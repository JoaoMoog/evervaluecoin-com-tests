import * as vscode from 'vscode'
import * as path from 'path'
import { AgentRun } from './types'

const MAX_RUNS_STORED = 50

export class HistoryManager {
  private runsDir: string
  private memory: AgentRun[] = []

  constructor(workspaceRoot: string) {
    this.runsDir = path.join(workspaceRoot, '.agentflow', 'runs')
  }

  addRun(run: AgentRun): void {
    this.memory.unshift(run)
    if (this.memory.length > MAX_RUNS_STORED) {
      this.memory = this.memory.slice(0, MAX_RUNS_STORED)
    }
    // Persist asynchronously (best-effort)
    this.persistRun(run).catch(() => {})
  }

  getRecent(limit = 10): AgentRun[] {
    return this.memory.slice(0, limit)
  }

  getByAgent(agentId: string, limit = 5): AgentRun[] {
    return this.memory.filter(r => r.agentId === agentId).slice(0, limit)
  }

  private async persistRun(run: AgentRun): Promise<void> {
    const dirUri = vscode.Uri.file(this.runsDir)
    try {
      await vscode.workspace.fs.createDirectory(dirUri)
    } catch {
      // Already exists
    }

    const ts = run.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `${ts}-${run.agentId}.json`
    const uri = vscode.Uri.joinPath(dirUri, filename)

    const json = JSON.stringify(run, null, 2)
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'))
  }
}
