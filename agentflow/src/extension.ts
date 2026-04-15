import * as vscode from 'vscode'
import { CopilotBridge } from './llm/bridge'
import { AgentExecutor, TriggerManager, HistoryManager } from './runtime/index'
import { SkillRegistry } from './skills/index'
import { AgentStore, ConfigStore } from './storage/index'
import { CanvasPanel } from './canvas/panel'
import { MessageHandler } from './canvas/messageHandler'
import { Logger } from './utils/logger'
import { getWorkspaceRoot } from './utils/fsHelpers'

let logger: Logger
let bridge: CopilotBridge
let triggerManager: TriggerManager

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger('AgentFlow')
  logger.info('AgentFlow ativado')

  const root = getWorkspaceRoot()
  if (!root) {
    vscode.window.showInformationMessage(
      'AgentFlow: Abra uma pasta de projeto para começar.'
    )
    return
  }

  // Initialize LLM bridge
  bridge = new CopilotBridge()
  const copilotAvailable = await bridge.initialize()

  if (!copilotAvailable) {
    const action = await vscode.window.showWarningMessage(
      'AgentFlow: GitHub Copilot não encontrado. É necessário para gerar sugestões de agentes.',
      'Instalar Copilot',
      'Usar API Key manual'
    )
    if (action === 'Instalar Copilot') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=GitHub.copilot')
      )
    } else if (action === 'Usar API Key manual') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agentflow.fallbackApiKey')
    }
  } else {
    logger.info(`Copilot conectado: ${bridge.getModelName()}`)
  }

  // Wire up all modules
  const skills = new SkillRegistry()
  await skills.loadCustomSkills(root)

  const agentStore = new AgentStore(root)
  const configStore = new ConfigStore(root)
  const history = new HistoryManager(root)

  triggerManager = new TriggerManager()

  const executor = new AgentExecutor(bridge, skills, logger, root)

  const messageHandler = new MessageHandler(
    context,
    bridge,
    executor,
    triggerManager,
    agentStore,
    configStore,
    history,
    logger,
  )

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.openCanvas', () => {
      const panel = CanvasPanel.create(context, msg => messageHandler.handle(msg, panel))
      void panel  // panel registers itself as currentPanel
    }),

    vscode.commands.registerCommand('agentflow.scan', async () => {
      const panel = CanvasPanel.create(context, msg => messageHandler.handle(msg, panel))
      panel.send({ type: 'SCAN_PROGRESS', payload: { step: 'Iniciando...', pct: 0 } })
      await messageHandler.handle({ type: 'SCAN_REQUEST' }, panel)
    }),

    vscode.commands.registerCommand('agentflow.runAll', async () => {
      const agents = await agentStore.list()
      const active = agents.filter(a => a.active)
      if (!active.length) {
        vscode.window.showInformationMessage('AgentFlow: Nenhum agente ativo encontrado.')
        return
      }

      const panel = CanvasPanel.create(context, msg => messageHandler.handle(msg, panel))
      await Promise.all(active.map(agent =>
        messageHandler.handle({
          type: 'RUN_AGENT',
          payload: { id: agent.id, context: 'manual run all' },
        }, panel)
      ))
    })
  )

  // Re-activate saved triggers for already-active agents
  const savedAgents = await agentStore.list()
  for (const agent of savedAgents.filter(a => a.active)) {
    const panel = CanvasPanel.currentPanel
    if (panel) {
      triggerManager.register(agent, (a, ctx) => {
        panel.send({ type: 'AGENT_STATUS', payload: { id: a.id, status: 'running' } })
        executor.execute(a, ctx, text =>
          panel.send({ type: 'RUN_CHUNK', payload: { agentId: a.id, text } })
        ).then(run => {
          history.addRun(run)
          panel.send({ type: 'RUN_COMPLETE', payload: { run } })
          panel.send({ type: 'AGENT_STATUS', payload: { id: a.id, status: run.status } })
        })
      })
    }
  }

  context.subscriptions.push({ dispose: () => triggerManager.disposeAll() })
  context.subscriptions.push({ dispose: () => logger.dispose() })

  logger.info(`${savedAgents.filter(a => a.active).length} agentes ativos re-registrados`)
}

export function deactivate(): void {
  triggerManager?.disposeAll()
  logger?.info('AgentFlow desativado')
}
