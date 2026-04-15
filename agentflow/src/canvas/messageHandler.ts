import * as vscode from 'vscode'
import { CanvasPanel } from './panel'
import { buildCanvasNodes } from './stateSync'
import { WebviewToExtension, TutorialStep, BuilderState, HistoryRunSummary } from './types'
import { scanWorkspace, buildContext } from '../scanner/index'
import { CopilotBridge, PROMPTS, parseAgentSuggestions } from '../llm/index'
import { AgentExecutor, TriggerManager, AgentDefinition } from '../runtime/index'
import { AgentStore, ConfigStore } from '../storage/index'
import { HistoryManager } from '../runtime/historyManager'
import { Logger } from '../utils/logger'

// Tutorial steps shown in sequence during first-use flow
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    step: 1,
    total: 3,
    title: 'Vamos conhecer seu projeto',
    body: 'O AgentFlow vai analisar seus arquivos de código e perguntar ao Copilot quais agentes de IA seriam mais úteis para o seu projeto. Leva menos de 30 segundos.',
    actionLabel: 'Analisar meu código',
    spotlightNodeType: undefined,
  },
  {
    step: 2,
    total: 3,
    title: 'Agentes sugeridos para você',
    body: 'O Copilot analisou seu projeto e sugeriu esses agentes. Cada nó verde é um agente. Clique em um deles para ver o que ele faz e como configurá-lo.',
    actionLabel: 'Entendi, mostrar o canvas',
    spotlightNodeType: 'agent',
  },
  {
    step: 3,
    total: 3,
    title: 'Ative seu primeiro agente',
    body: 'Ajuste o prompt se quiser (ou deixe como está) e clique em "Ativar Agente". A partir daí ele roda automaticamente conforme você configurou.',
    actionLabel: 'Ativar e ver em ação',
    spotlightNodeType: 'agent',
  },
]

/** Maps raw error strings to user-friendly Portuguese messages. */
function friendlyError(err: unknown): string {
  const raw = String(err)
  if (/ENOENT|no such file/i.test(raw))
    return 'Arquivo não encontrado. Verifique se o arquivo ainda existe no projeto.'
  if (/EACCES|permission denied/i.test(raw))
    return 'Sem permissão para acessar o arquivo. Verifique as permissões.'
  if (/Copilot|lm\.|selectChatModels/i.test(raw))
    return 'GitHub Copilot não está disponível. Verifique se está instalado e conectado.'
  if (/rate.?limit|429/i.test(raw))
    return 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.'
  if (/network|ECONNREFUSED|fetch failed/i.test(raw))
    return 'Erro de conexão. Verifique sua internet e tente novamente.'
  if (/timeout/i.test(raw))
    return 'O agente demorou muito para responder. Tente novamente.'
  if (raw.length > 180) return raw.slice(0, 180) + '…'
  return raw
}

const MAX_CONCURRENT_RUNS = 2

export class MessageHandler {
  /** Maps agentId → active CancellationTokenSource so runs can be stopped */
  private activeRuns = new Map<string, vscode.CancellationTokenSource>()

  /** Simple concurrency limiter */
  private runningCount = 0
  private runQueue: Array<() => void> = []

  constructor(
    private extensionContext: vscode.ExtensionContext,
    private bridge: CopilotBridge,
    private executor: AgentExecutor,
    private triggerManager: TriggerManager,
    private agentStore: AgentStore,
    private configStore: ConfigStore,
    private history: HistoryManager,
    private logger: Logger,
    private workspaceRoot: string
  ) {}

  async handle(raw: unknown, panel: CanvasPanel): Promise<void> {
    const msg = raw as WebviewToExtension
    switch (msg.type) {
      case 'REQUEST_STATE':
        await this.handleRequestState(panel)
        break

      case 'SCAN_REQUEST':
        await this.handleScan(panel)
        break

      case 'ACTIVATE_AGENT':
        await this.handleActivateAgent(msg.payload, panel)
        break

      case 'DEACTIVATE_AGENT':
        await this.handleDeactivateAgent(msg.payload.id, panel)
        break

      case 'SAVE_AGENT':
        await this.agentStore.save(msg.payload)
        break

      case 'DELETE_AGENT':
        await this.agentStore.delete(msg.payload.id)
        break

      case 'RUN_AGENT':
        await this.handleRunAgent(msg.payload.id, msg.payload.context, panel)
        break

      case 'CANCEL_AGENT':
        this.handleCancelAgent(msg.payload.id, panel)
        break

      case 'REQUEST_HISTORY':
        this.handleRequestHistory(msg.payload?.limit, panel)
        break

      case 'NODE_MOVED':
        await this.handleNodeMoved(msg.payload.id, msg.payload.x, msg.payload.y)
        break

      case 'TUTORIAL_ADVANCE':
        await this.handleTutorialAdvance(msg.payload.step, panel)
        break

      case 'TUTORIAL_SKIP':
        this.logger.info('Tutorial ignorado pelo usuário')
        break

      case 'SUGGEST_PROMPT':
        await this.handleSuggestPrompt(msg.payload, panel)
        break

      case 'OPEN_BUILDER':
        await this.handleOpenBuilder(msg.payload, panel)
        break

      case 'BUILDER_NEXT':
        await this.handleBuilderNext(msg.payload, panel)
        break

      case 'CREATE_AGENT_FROM_BUILDER':
        await this.handleCreateAgentFromBuilder(msg.payload.state, panel)
        break
    }
  }

  private async handleRequestState(panel: CanvasPanel): Promise<void> {
    const agents = await this.agentStore.list()
    const hasAgents = agents.length > 0

    // Build a map of agentId → ISO lastRunAt for the canvas to show idle hints
    const agentHistory: Record<string, string> = {}
    for (const agent of agents) {
      const lastRun = this.history.getByAgent(agent.id, 1)[0]
      if (lastRun) agentHistory[agent.id] = lastRun.startedAt.toISOString()
    }

    panel.send({
      type: 'INITIAL_STATE',
      payload: { agents, nodes: [], hasAgents, agentHistory },
    })

    // First-time user: start the tutorial
    if (!hasAgents) {
      panel.send({ type: 'TUTORIAL_STEP', payload: TUTORIAL_STEPS[0] })
    }
  }

  private async handleScan(panel: CanvasPanel): Promise<void> {
    this.logger.info('Iniciando varredura do workspace...')

    try {
      const repoCtx = await scanWorkspace(
        this.extensionContext,
        (step, pct) => {
          const stage = pct <= 70 ? 'scan' : pct <= 90 ? 'copilot' : 'canvas'
          panel.send({ type: 'SCAN_PROGRESS', payload: { step, pct, stage } })
        }
      )

      panel.send({ type: 'SCAN_PROGRESS', payload: { step: 'Pedindo sugestões ao Copilot...', pct: 90, stage: 'copilot' } })

      const contextStr = buildContext(repoCtx)
      const raw = await this.bridge.send([{
        role: 'user',
        content: PROMPTS.SUGGEST_AGENTS(contextStr),
      }])

      const suggestions = parseAgentSuggestions(raw)
      this.logger.info(`${suggestions.length} agentes sugeridos pelo Copilot`)

      panel.send({ type: 'SCAN_PROGRESS', payload: { step: 'Preparando o canvas...', pct: 95, stage: 'canvas' } })

      const existingAgents = await this.agentStore.list()
      const { nodes, edges } = buildCanvasNodes(repoCtx, suggestions, existingAgents, repoCtx.flows)

      panel.send({ type: 'SCAN_COMPLETE', payload: { nodes, edges } })
      panel.send({ type: 'AGENT_SUGGESTED', payload: { agents: suggestions } })

      // Advance tutorial to step 2 after scan
      panel.send({ type: 'TUTORIAL_STEP', payload: TUTORIAL_STEPS[1] })

      await this.configStore.initIfMissing(repoCtx.projectName)

    } catch (err) {
      this.logger.error(`Varredura falhou: ${err}`)
      panel.send({ type: 'ERROR', payload: { message: friendlyError(err), detail: String(err) } })
    }
  }

  private async handleActivateAgent(agent: AgentDefinition, panel: CanvasPanel): Promise<void> {
    await this.agentStore.save(agent)
    this.triggerManager.register(agent, (a, ctx) => {
      panel.send({ type: 'AGENT_STATUS', payload: { id: a.id, status: 'running' } })
      this.executeWithQueue(a, ctx, panel)
    })
    panel.send({ type: 'AGENT_STATUS', payload: { id: agent.id, status: 'idle' } })
    this.logger.info(`Agente "${agent.name}" ativado`)
  }

  private async handleDeactivateAgent(id: string, panel: CanvasPanel): Promise<void> {
    const agent = await this.agentStore.get(id)
    if (agent) {
      agent.active = false
      await this.agentStore.save(agent)
    }
    this.triggerManager.unregisterAgent(id)
    panel.send({ type: 'AGENT_STATUS', payload: { id, status: 'paused' } })
    this.logger.info(`Agente "${id}" desativado`)
  }

  private async handleRunAgent(id: string, context: string, panel: CanvasPanel): Promise<void> {
    const agent = await this.agentStore.get(id)
    if (!agent) {
      this.logger.warn(`Agente "${id}" não encontrado`)
      return
    }
    panel.send({ type: 'AGENT_STATUS', payload: { id, status: 'running' } })
    this.executeWithQueue(agent, context, panel)
  }

  /**
   * Executes an agent respecting the MAX_CONCURRENT_RUNS limit.
   * If the limit is reached, queues the run until a slot is free.
   */
  private executeWithQueue(agent: AgentDefinition, context: string, panel: CanvasPanel): void {
    const run = async (): Promise<void> => {
      this.runningCount++
      const cts = new vscode.CancellationTokenSource()
      this.activeRuns.set(agent.id, cts)

      try {
        const agentRun = await this.executor.execute(
          agent,
          context,
          text => panel.send({ type: 'RUN_CHUNK', payload: { agentId: agent.id, text } }),
          cts.token
        )
        this.history.addRun(agentRun)
        panel.send({ type: 'RUN_COMPLETE', payload: { run: agentRun } })
        panel.send({ type: 'AGENT_STATUS', payload: { id: agent.id, status: agentRun.status, lastRunAt: agentRun.startedAt.toISOString() } })
      } finally {
        cts.dispose()
        this.activeRuns.delete(agent.id)
        this.runningCount--
        // Dequeue next run if any are waiting
        const next = this.runQueue.shift()
        next?.()
      }
    }

    if (this.runningCount < MAX_CONCURRENT_RUNS) {
      run()
    } else {
      this.logger.info(`Agente "${agent.name}" na fila (${this.runQueue.length + 1} aguardando)`)
      this.runQueue.push(() => run())
    }
  }

  private handleCancelAgent(agentId: string, panel: CanvasPanel): void {
    const cts = this.activeRuns.get(agentId)
    if (cts) {
      cts.cancel()
      this.logger.info(`Agente "${agentId}" cancelado pelo usuário`)
      panel.send({ type: 'AGENT_CANCELLED', payload: { id: agentId } })
      panel.send({ type: 'AGENT_STATUS', payload: { id: agentId, status: 'idle' } })
    }
  }

  private handleRequestHistory(limit: number | undefined, panel: CanvasPanel): void {
    const runs = this.history.getRecent(limit ?? 30)
    const agentCache = new Map<string, { name: string; emoji: string }>()

    // Build history summaries synchronously from in-memory data
    const summaries: HistoryRunSummary[] = runs.map(r => {
      const cached = agentCache.get(r.agentId)
      const durationMs = r.finishedAt
        ? r.finishedAt.getTime() - r.startedAt.getTime()
        : undefined

      return {
        agentId: r.agentId,
        agentName: cached?.name ?? r.agentId,
        agentEmoji: cached?.emoji ?? '🤖',
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString(),
        durationMs,
        filesModified: r.filesModified,
        error: r.error,
      }
    })

    panel.send({ type: 'HISTORY_DATA', payload: { runs: summaries } })
  }

  private async handleNodeMoved(agentId: string, x: number, y: number): Promise<void> {
    const id = agentId.replace('agent-', '')
    const agent = await this.agentStore.get(id)
    if (agent) {
      agent.canvasPosition = { x, y }
      await this.agentStore.save(agent)
    }
  }

  private async handleTutorialAdvance(step: number, panel: CanvasPanel): Promise<void> {
    // step 1 → trigger scan; step 2 → just dismiss; step 3 → handled by inspector
    if (step === 1) {
      await this.handleScan(panel)
    }
    // Steps 2 and 3 are advanced by the webview itself after user interaction
  }

  private async handleSuggestPrompt(
    payload: { agentId: string; agentName: string; agentDescription: string },
    panel: CanvasPanel
  ): Promise<void> {
    if (!this.bridge.isAvailable()) return

    const prompt = await this.bridge.send([{
      role: 'user',
      content: `Você é especialista em criar system prompts para agentes de IA.

Crie um system prompt em português para o seguinte agente:
- Nome: ${payload.agentName}
- Descrição: ${payload.agentDescription}

O prompt deve:
- Ser claro e objetivo (máximo 8 linhas)
- Definir o comportamento e tom do agente
- Listar as regras principais
- Usar linguagem direta

Retorne APENAS o prompt, sem explicações ou formatação extra.`,
    }])

    panel.send({
      type: 'PROMPT_SUGGESTED',
      payload: { agentId: payload.agentId, prompt: prompt.trim() },
    })
  }

  private async handleOpenBuilder(
    payload: { flowDomain?: string; flowLabel?: string; flowFunctions?: string[] },
    panel: CanvasPanel
  ): Promise<void> {
    // Send builder context back to webview — wizard manages its own step state
    panel.send({
      type: 'BUILDER_STEP',
      payload: {
        step: 1,
        total: 5,
        title: 'Quando este agente vai executar?',
        body: 'Escolha o gatilho do agente.',
        fields: [],
        flowDomain:    payload.flowDomain,
        flowLabel:     payload.flowLabel,
        flowFunctions: payload.flowFunctions,
      },
    })
  }

  private async handleBuilderNext(
    payload: { step: number; values: Record<string, unknown> },
    panel: CanvasPanel
  ): Promise<void> {
    // Only step 5 needs Copilot (prompt generation)
    if (payload.step !== 5) return
    if (!this.bridge.isAvailable()) {
      panel.send({
        type: 'BUILDER_PROMPT_READY',
        payload: {
          prompt: `Você é um agente especializado. Seu objetivo é ${payload.values.customGoal ?? payload.values.goalType}.`,
          name: String(payload.values.name ?? 'Meu Agente'),
          emoji: String(payload.values.emoji ?? '🤖'),
          description: String(payload.values.customGoal ?? payload.values.goalType ?? ''),
        },
      })
      return
    }

    const flowCtx = payload.values.flowLabel
      ? `O agente vai atuar no fluxo de "${payload.values.flowLabel}" com as funções: ${(payload.values.flowFunctions as string[] | undefined)?.slice(0, 5).join(', ') ?? 'não especificadas'}.`
      : payload.values.customContext
      ? `Contexto do projeto: ${payload.values.customContext}`
      : 'Contexto: projeto geral.'

    const goalMap: Record<string, string> = {
      test:     'escrever e melhorar testes',
      security: 'revisar e corrigir problemas de segurança',
      docs:     'documentar o código com JSDoc e comentários',
      review:   'revisar qualidade, clean code e performance',
      custom:   String(payload.values.customGoal ?? ''),
    }
    const goalDesc = goalMap[String(payload.values.goalType)] ?? String(payload.values.goalType)

    const triggerDesc = payload.values.trigger === 'file_save'
      ? `Ele é acionado ao salvar arquivos que correspondem a "${payload.values.triggerPattern ?? '**/*'}".`
      : payload.values.trigger === 'on_startup'
      ? 'Ele executa automaticamente quando o projeto é aberto.'
      : payload.values.trigger === 'scheduled'
      ? `Ele executa automaticamente no horário ${payload.values.triggerPattern ?? ''} todos os dias.`
      : 'Ele executa quando o usuário pedir manualmente.'

    const raw = await this.bridge.send([{
      role: 'user',
      content: `Você é especialista em criar agentes de IA para desenvolvimento de software.

Crie um system prompt completo em português para um agente com as seguintes características:
- Objetivo: ${goalDesc}
- ${flowCtx}
- ${triggerDesc}

O prompt deve:
1. Definir claramente o papel e objetivo do agente (1-2 frases)
2. Listar as etapas que ele deve seguir (numeradas, máximo 5)
3. Especificar o formato de saída esperado
4. Ser conciso (máximo 12 linhas)

Também sugira:
- Um nome curto e descritivo para o agente (máximo 4 palavras)
- Um emoji representativo
- Uma descrição curta de 1 frase

Responda EXATAMENTE no formato JSON (sem markdown):
{"prompt": "...", "name": "...", "emoji": "...", "description": "..."}`,
    }])

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      if (parsed?.prompt) {
        panel.send({
          type: 'BUILDER_PROMPT_READY',
          payload: {
            prompt:      String(parsed.prompt),
            name:        String(parsed.name ?? payload.values.name ?? 'Meu Agente'),
            emoji:       String(parsed.emoji ?? payload.values.emoji ?? '🤖'),
            description: String(parsed.description ?? ''),
          },
        })
        return
      }
    } catch { /* fall through */ }

    // Fallback if JSON parsing fails
    panel.send({
      type: 'BUILDER_PROMPT_READY',
      payload: {
        prompt:      raw.trim().slice(0, 800),
        name:        String(payload.values.name ?? 'Meu Agente'),
        emoji:       String(payload.values.emoji ?? '🤖'),
        description: goalDesc,
      },
    })
  }

  private async handleCreateAgentFromBuilder(
    state: BuilderState,
    panel: CanvasPanel
  ): Promise<void> {
    const id = `agent-${(state.name ?? 'custom').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30)}-${Date.now()}`

    const agent: AgentDefinition = {
      id,
      name:        state.name        ?? 'Meu Agente',
      emoji:       state.emoji       ?? '🤖',
      description: state.description ?? '',
      prompt:      state.prompt      ?? '',
      model:       'copilot/gpt-4o',
      active:      false,
      skills:      state.skills ?? ['read-file'],
      trigger: {
        type:    (state.trigger as AgentDefinition['trigger']['type']) ?? 'manual',
        pattern: (state.trigger === 'file_save' || state.trigger === 'scheduled')
          ? (state.triggerPattern ?? '')
          : undefined,
      },
      config: {},
    }

    await this.agentStore.save(agent)
    this.logger.info(`Agente "${agent.name}" criado via Builder`)

    panel.send({ type: 'AGENT_STATUS', payload: { id, status: 'idle' } })

    // Trigger a lightweight state refresh so the canvas shows the new agent
    await this.handleRequestState(panel)
  }
}
