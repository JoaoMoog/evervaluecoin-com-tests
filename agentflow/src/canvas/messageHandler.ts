import * as vscode from 'vscode'
import { CanvasPanel } from './panel'
import { buildCanvasNodes } from './stateSync'
import { WebviewToExtension, TutorialStep } from './types'
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

export class MessageHandler {
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
    }
  }

  private async handleRequestState(panel: CanvasPanel): Promise<void> {
    const agents = await this.agentStore.list()
    const hasAgents = agents.length > 0

    panel.send({
      type: 'INITIAL_STATE',
      payload: { agents, nodes: [], hasAgents },
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
      const { nodes, edges } = buildCanvasNodes(repoCtx, suggestions, existingAgents)

      panel.send({ type: 'SCAN_COMPLETE', payload: { nodes, edges } })
      panel.send({ type: 'AGENT_SUGGESTED', payload: { agents: suggestions } })

      // Advance tutorial to step 2 after scan
      panel.send({ type: 'TUTORIAL_STEP', payload: TUTORIAL_STEPS[1] })

      await this.configStore.initIfMissing(repoCtx.projectName)

    } catch (err) {
      this.logger.error(`Varredura falhou: ${err}`)
      const raw = String(err)
      // Show a friendly message, not a raw stack trace
      const friendly = raw.includes('Copilot')
        ? 'GitHub Copilot não está disponível. Verifique se está instalado e conectado.'
        : raw.length > 120
        ? raw.slice(0, 120) + '...'
        : raw
      panel.send({ type: 'ERROR', payload: { message: friendly, detail: raw } })
    }
  }

  private async handleActivateAgent(agent: AgentDefinition, panel: CanvasPanel): Promise<void> {
    await this.agentStore.save(agent)
    this.triggerManager.register(agent, (a, ctx) => {
      panel.send({ type: 'AGENT_STATUS', payload: { id: a.id, status: 'running' } })
      this.executor.execute(a, ctx, text =>
        panel.send({ type: 'RUN_CHUNK', payload: { agentId: a.id, text } })
      ).then(run => {
        this.history.addRun(run)
        panel.send({ type: 'RUN_COMPLETE', payload: { run } })
        panel.send({ type: 'AGENT_STATUS', payload: { id: a.id, status: run.status } })
      })
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
    const run = await this.executor.execute(agent, context, text =>
      panel.send({ type: 'RUN_CHUNK', payload: { agentId: id, text } })
    )
    this.history.addRun(run)
    panel.send({ type: 'RUN_COMPLETE', payload: { run } })
    panel.send({ type: 'AGENT_STATUS', payload: { id, status: run.status } })
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
}
