import * as vscode from 'vscode'
import { Skill, SkillContext } from '../types'

interface CodeBlock {
  filePath: string | null
  language: string
  code: string
}

export const writeFileSkill: Skill = {
  id: 'write-file',
  name: 'Escrever arquivo',
  description: 'Cria ou atualiza arquivos com o output gerado pelo agente',
  icon: '✍️',

  async applyOutput({ output, workspaceRoot }: SkillContext & { output: string }): Promise<string[]> {
    const blocks = extractCodeBlocks(output)
    const modified: string[] = []

    for (const block of blocks) {
      if (!block.filePath) continue

      // Security: disallow paths that escape the workspace
      const normalized = block.filePath.replace(/\\/g, '/').replace(/^\/+/, '')
      if (normalized.includes('../') || normalized.startsWith('/')) continue

      const uri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), normalized)
      try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(block.code, 'utf-8'))
        modified.push(normalized)
      } catch (err) {
        // Log but don't crash — other files should still be written
        console.error(`[write-file] Failed to write ${normalized}:`, err)
      }
    }

    return modified
  },
}

/**
 * Extracts code blocks from LLM output.
 * Looks for: ```lang\n// path/to/file\n<code>```
 */
function extractCodeBlocks(output: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const CODE_BLOCK_RE = /```(\w+)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = CODE_BLOCK_RE.exec(output)) !== null) {
    const language = match[1] ?? 'text'
    const body = match[2]

    // First line may be a file path comment: // path/to/file.ts or # path/file.py
    const firstLineMatch = body.match(/^(?:\/\/|#)\s*([\w./-]+\.\w+)\s*\n/)
    const filePath = firstLineMatch?.[1] ?? null
    const code = filePath ? body.slice(firstLineMatch![0].length) : body

    blocks.push({ filePath, language, code })
  }

  return blocks
}
