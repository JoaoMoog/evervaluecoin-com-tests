import * as vscode from 'vscode'
import { Skill, SkillContext } from '../types'

const FILE_REF_RE = /(?:^|\s|["'`])((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|json|yaml|yml|py|go|md))(?=\s|["'`]|$)/gm

export const readFileSkill: Skill = {
  id: 'read-file',
  name: 'Ler arquivo',
  description: 'Lê o conteúdo de arquivos relevantes para o contexto da tarefa',
  icon: '📂',

  async gatherContext({ taskContext, workspaceRoot }: SkillContext): Promise<string | null> {
    const fileRefs = extractFileReferences(taskContext)
    if (!fileRefs.length) return null

    const contents: string[] = []
    for (const ref of fileRefs.slice(0, 3)) {
      const uri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), ref)
      try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const text = Buffer.from(bytes).toString('utf-8')
        contents.push(`// ${ref}\n${text.slice(0, 2000)}`)
      } catch {
        // File not found — skip silently
      }
    }

    return contents.length > 0 ? contents.join('\n\n') : null
  },
}

function extractFileReferences(text: string): string[] {
  const refs: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(FILE_REF_RE.source, 'gm')
  while ((match = re.exec(text)) !== null) {
    const ref = match[1]
    if (ref && !refs.includes(ref)) refs.push(ref)
  }
  return refs
}
