import * as vscode from 'vscode'
import { AgentDefinition } from './types'

type TriggerCallback = (agent: AgentDefinition, context: string) => void

// Simple glob → RegExp converter (supports **, *, ?)
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')   // escape regex specials except * and ?
    .replace(/\*\*/g, '§DOUBLE§')            // temporarily replace **
    .replace(/\*/g, '[^/]*')                 // * = anything except /
    .replace(/\?/g, '[^/]')                  // ? = any single char except /
    .replace(/§DOUBLE§/g, '.*')              // ** = anything including /
  return new RegExp(`^${escaped}$`)
}

export class TriggerManager {
  // Maps agentId → list of disposables registered for that agent
  private agentDisposables = new Map<string, vscode.Disposable[]>()

  register(agent: AgentDefinition, onTrigger: TriggerCallback): void {
    if (!agent.active) return

    // Dispose any existing registration for this agent before re-registering
    this.unregisterAgent(agent.id)

    switch (agent.trigger.type) {
      case 'file_save':
        this.registerFileSave(agent, onTrigger)
        break

      case 'on_startup':
        Promise.resolve().then(() => onTrigger(agent, 'startup'))
        break

      case 'scheduled':
        // Future: cron-based triggers
        break

      case 'manual':
        break
    }
  }

  private registerFileSave(agent: AgentDefinition, onTrigger: TriggerCallback): void {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders?.length) return

    const pattern = agent.trigger.pattern ?? '**/*'
    const workspaceRoot = workspaceFolders[0].uri.fsPath
    const patternRegex = globToRegex(pattern)

    const disposable = vscode.workspace.onDidSaveTextDocument(doc => {
      // Convert absolute path to a workspace-relative forward-slash path
      const abs = doc.uri.fsPath
      if (!abs.startsWith(workspaceRoot)) return

      const rel = abs.slice(workspaceRoot.length).replace(/\\/g, '/').replace(/^\//, '')

      if (patternRegex.test(rel)) {
        onTrigger(agent, abs)
      }
    })

    this.addDisposable(agent.id, disposable)
  }

  unregisterAgent(agentId: string): void {
    const disposables = this.agentDisposables.get(agentId) ?? []
    disposables.forEach(d => d.dispose())
    this.agentDisposables.delete(agentId)
  }

  disposeAll(): void {
    this.agentDisposables.forEach(disposables => disposables.forEach(d => d.dispose()))
    this.agentDisposables.clear()
  }

  private addDisposable(agentId: string, disposable: vscode.Disposable): void {
    const existing = this.agentDisposables.get(agentId) ?? []
    existing.push(disposable)
    this.agentDisposables.set(agentId, existing)
  }
}
