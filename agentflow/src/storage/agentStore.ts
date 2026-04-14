import * as vscode from 'vscode'
import * as yaml from 'js-yaml'
import { AgentDefinition } from '../runtime/types'

export class AgentStore {
  private dirUri: vscode.Uri

  constructor(workspaceRoot: string) {
    this.dirUri = vscode.Uri.file(`${workspaceRoot}/.agentflow/agents`)
  }

  private async ensureDir(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.dirUri)
    } catch {
      // Already exists
    }
  }

  async list(): Promise<AgentDefinition[]> {
    await this.ensureDir()
    const agents: AgentDefinition[] = []

    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(this.dirUri)
    } catch {
      return []
    }

    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith('.yaml')) continue
      const uri = vscode.Uri.joinPath(this.dirUri, name)
      try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const content = Buffer.from(bytes).toString('utf-8')
        const agent = yaml.load(content) as AgentDefinition
        if (agent?.id) agents.push(agent)
      } catch {
        // Corrupt file — skip
      }
    }

    return agents
  }

  async get(id: string): Promise<AgentDefinition | null> {
    const uri = vscode.Uri.joinPath(this.dirUri, `${id}.yaml`)
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      return yaml.load(Buffer.from(bytes).toString('utf-8')) as AgentDefinition
    } catch {
      return null
    }
  }

  async save(agent: AgentDefinition): Promise<void> {
    await this.ensureDir()
    const uri = vscode.Uri.joinPath(this.dirUri, `${agent.id}.yaml`)
    const content = yaml.dump(agent, { indent: 2, lineWidth: 120 })
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
  }

  async delete(id: string): Promise<void> {
    const uri = vscode.Uri.joinPath(this.dirUri, `${id}.yaml`)
    try {
      await vscode.workspace.fs.delete(uri)
    } catch {
      // File may not exist
    }
  }
}
