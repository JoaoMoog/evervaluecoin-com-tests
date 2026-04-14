import * as vscode from 'vscode'
import * as yaml from 'js-yaml'

export interface AgentFlowConfig {
  version: string
  project: string
  defaultModel: string
  extraSkills: string[]
  scan: {
    maxDepth: number
    exclude: string[]
  }
}

const DEFAULT_CONFIG: AgentFlowConfig = {
  version: '0.1',
  project: 'unknown',
  defaultModel: 'copilot/gpt-4o',
  extraSkills: [],
  scan: {
    maxDepth: 3,
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', 'build/**'],
  },
}

export class ConfigStore {
  private uri: vscode.Uri

  constructor(workspaceRoot: string) {
    this.uri = vscode.Uri.file(`${workspaceRoot}/.agentflow/agentflow.yaml`)
  }

  async load(): Promise<AgentFlowConfig> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.uri)
      const parsed = yaml.load(Buffer.from(bytes).toString('utf-8')) as Partial<AgentFlowConfig>
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  async save(config: AgentFlowConfig): Promise<void> {
    const dirUri = vscode.Uri.file(this.uri.fsPath.replace('/agentflow.yaml', ''))
    try {
      await vscode.workspace.fs.createDirectory(dirUri)
    } catch {
      // Already exists
    }
    const content = yaml.dump(config, { indent: 2 })
    await vscode.workspace.fs.writeFile(this.uri, Buffer.from(content, 'utf-8'))
  }

  async initIfMissing(projectName: string): Promise<void> {
    try {
      await vscode.workspace.fs.stat(this.uri)
      // Already exists
    } catch {
      await this.save({ ...DEFAULT_CONFIG, project: projectName })
    }
  }
}
