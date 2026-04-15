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

/**
 * Parses "HH:MM" from the trigger pattern (used as cron time for scheduled triggers).
 * Returns null if the format is invalid.
 */
function parseCronTime(pattern: string | undefined): { hour: number; minute: number } | null {
  if (!pattern) return null
  const m = pattern.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export class TriggerManager {
  // Maps agentId → list of disposables registered for that agent
  private agentDisposables = new Map<string, vscode.Disposable[]>()
  // Maps agentId → interval id for scheduled triggers
  private agentIntervals = new Map<string, ReturnType<typeof setInterval>>()

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
        this.registerScheduled(agent, onTrigger)
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

  /**
   * Registers a scheduled trigger that fires at a given HH:MM each day.
   * The pattern field stores the time as "HH:MM" (e.g. "09:00").
   * Checks every 60 seconds whether the current time matches.
   */
  private registerScheduled(agent: AgentDefinition, onTrigger: TriggerCallback): void {
    const cronTime = parseCronTime(agent.trigger.pattern)
    if (!cronTime) return

    let lastFiredDate = ''   // ISO date string (YYYY-MM-DD) of last fire

    const check = (): void => {
      const now = new Date()
      const todayKey = now.toISOString().slice(0, 10)  // YYYY-MM-DD
      if (now.getHours() === cronTime.hour && now.getMinutes() === cronTime.minute && lastFiredDate !== todayKey) {
        lastFiredDate = todayKey
        onTrigger(agent, `scheduled run at ${agent.trigger.pattern ?? ''}`)
      }
    }

    // Run check every 60 seconds
    const intervalId = setInterval(check, 60_000)
    this.agentIntervals.set(agent.id, intervalId)

    // Also check immediately in case we're launching right at the scheduled time
    check()
  }

  unregisterAgent(agentId: string): void {
    const disposables = this.agentDisposables.get(agentId) ?? []
    disposables.forEach(d => d.dispose())
    this.agentDisposables.delete(agentId)

    const intervalId = this.agentIntervals.get(agentId)
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      this.agentIntervals.delete(agentId)
    }
  }

  disposeAll(): void {
    this.agentDisposables.forEach(disposables => disposables.forEach(d => d.dispose()))
    this.agentDisposables.clear()

    this.agentIntervals.forEach(id => clearInterval(id))
    this.agentIntervals.clear()
  }

  private addDisposable(agentId: string, disposable: vscode.Disposable): void {
    const existing = this.agentDisposables.get(agentId) ?? []
    existing.push(disposable)
    this.agentDisposables.set(agentId, existing)
  }
}
