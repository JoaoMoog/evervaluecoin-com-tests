import * as vscode from 'vscode'

export interface CustomSkillMeta {
  id: string
  file: string
  name: string
}

export class SkillStore {
  private dirUri: vscode.Uri

  constructor(workspaceRoot: string) {
    this.dirUri = vscode.Uri.file(`${workspaceRoot}/.agentflow/skills`)
  }

  async listCustomSkills(): Promise<CustomSkillMeta[]> {
    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(this.dirUri)
    } catch {
      return []
    }

    return entries
      .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.ts'))
      .map(([name]) => ({
        id: name.replace('.ts', ''),
        file: name,
        name: name.replace('.ts', '').replace(/-/g, ' '),
      }))
  }

  async ensureDir(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.dirUri)
    } catch {
      // Already exists
    }
  }
}
