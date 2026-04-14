import * as vscode from 'vscode'
import { AgentDefinition } from './types'

type TriggerCallback = (agent: AgentDefinition, context: string) => void

export class TriggerManager {
  private disposables: vscode.Disposable[] = []

  register(agent: AgentDefinition, onTrigger: TriggerCallback): void {
    if (!agent.active) return

    switch (agent.trigger.type) {
      case 'file_save':
        this.registerFileSave(agent, onTrigger)
        break

      case 'on_startup':
        // Fire once immediately (async, no await needed)
        Promise.resolve().then(() => onTrigger(agent, 'startup'))
        break

      case 'scheduled':
        // Future implementation: cron-based triggers
        break

      case 'manual':
        // No automatic trigger — user runs manually
        break
    }
  }

  private registerFileSave(agent: AgentDefinition, onTrigger: TriggerCallback): void {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders?.length) return

    const pattern = agent.trigger.pattern ?? '**/*'
    const glob = new vscode.RelativePattern(workspaceFolders[0], pattern)

    const disposable = vscode.workspace.onDidSaveTextDocument(doc => {
      // Match the saved document against the trigger pattern
      if (vscode.languages.match({ pattern: glob.pattern }, doc) > 0 ||
          doc.uri.fsPath.includes(pattern.replace('**/', '').replace('*', ''))) {
        onTrigger(agent, doc.uri.fsPath)
      }
    })

    this.disposables.push(disposable)
  }

  unregisterAgent(agentId: string): void {
    // For simplicity in v0.1, disposeAll and re-register remaining agents
    // A more precise implementation would track disposables per agent
    void agentId
  }

  disposeAll(): void {
    this.disposables.forEach(d => d.dispose())
    this.disposables = []
  }
}
