import * as vscode from 'vscode'
import { CanvasPanel } from './panel'
import { buildCanvasNodes } from './stateSync'
import { WebviewToExtension } from './types'
import { scanWorkspace, buildContext } from '../scanner/index'
import { CopilotBridge, PROMPTS, parseAgentSuggestions } from '../llm/index'
import { AgentExecutor, TriggerManager, AgentDefinition } from '../runtime/index'
import { AgentStore, ConfigStore } from '../storage/index'
import { HistoryManager } from '../runtime/historyManager'
import { Logger } from '../utils/logger'

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
    }
  }

  private async handleRequestState(panel: CanvasPanel): Promise<void> {
    const agents = await this.agentStore.list()
    panel.send({
      type: 'INITIAL_STATE',
      payload: { agents, nodes: [] },
    })
  }

  private async handleScan(panel: CanvasPanel): Promise<void> {
    this.logger.info('Iniciando varredura do workspace...')

    try {
      const repoCtx = await scanWorkspace(
        this.extensionContext,
        (step, pct) => panel.send({ type: 'SCAN_PROGRESS', payload: { step, pct } })
      )

      panel.send({ type: 'SCAN_PROGRESS', payload: { step: 'Consultando Copilot...', pct: 90 } })

      const contextStr = buildContext(repoCtx)
      const raw = await this.bridge.send([{
        role: 'user',
        content: PROMPTS.SUGGEST_AGENTS(contextStr),
      }])

      const suggestions = parseAgentSuggestions(raw)
      this.logger.info(`${suggestions.length} agentes sugeridos pelo Copilot`)

      const existingAgents = await this.agentStore.list()
      const { nodes, edges } = buildCanvasNodes(repoCtx, suggestions, existingAgents)

      panel.send({ type: 'SCAN_COMPLETE', payload: { nodes, edges } })
      panel.send({ type: 'AGENT_SUGGESTED', payload: { agents: suggestions } })

      // Initialize config if this is the first scan
      await this.configStore.initIfMissing(repoCtx.projectName)

    } catch (err) {
      this.logger.error(`Varredura falhou: ${err}`)
      panel.send({ type: 'ERROR', payload: { message: String(err) } })
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
}
