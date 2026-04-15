import * as vscode from 'vscode'
import * as path from 'path'
import { Skill, SkillContext } from '../types'

// Allowed extensions for LLM-generated files
const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml',
  '.md', '.css', '.scss', '.html', '.py', '.go', '.txt', '.env.example',
])

// Block patterns that must never appear in resolved paths
const BLOCKED_PATTERNS = ['.git/', 'node_modules/', '.env', '.ssh/']

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

      // Normalize separators and strip leading slashes
      const normalized = block.filePath.replace(/\\/g, '/').replace(/^\/+/, '')

      // Resolve absolute path and verify it stays inside workspace (prevents path traversal)
      const absolute = path.resolve(workspaceRoot, normalized)
      if (!absolute.startsWith(path.resolve(workspaceRoot) + path.sep) &&
          absolute !== path.resolve(workspaceRoot)) {
        console.warn(`[write-file] Blocked path traversal attempt: ${normalized}`)
        continue
      }

      // Block sensitive paths
      const lowerAbs = absolute.toLowerCase()
      if (BLOCKED_PATTERNS.some(p => lowerAbs.includes(p))) {
        console.warn(`[write-file] Blocked sensitive path: ${normalized}`)
        continue
      }

      // Allow only known safe extensions
      const ext = path.extname(normalized).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        console.warn(`[write-file] Blocked disallowed extension: ${ext}`)
        continue
      }

      const uri = vscode.Uri.file(absolute)
      try {
        // Ensure parent directory exists
        const parentUri = vscode.Uri.file(path.dirname(absolute))
        await vscode.workspace.fs.createDirectory(parentUri)
        await vscode.workspace.fs.writeFile(uri, Buffer.from(block.code, 'utf-8'))
        modified.push(normalized)
      } catch (err) {
        console.error(`[write-file] Failed to write ${normalized}:`, err)
      }
    }

    return modified
  },
}

function extractCodeBlocks(output: string): Array<{ filePath: string | null; language: string; code: string }> {
  const blocks: Array<{ filePath: string | null; language: string; code: string }> = []
  const CODE_BLOCK_RE = /```(\w+)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = CODE_BLOCK_RE.exec(output)) !== null) {
    const language = match[1] ?? 'text'
    const body = match[2]
    const firstLineMatch = body.match(/^(?:\/\/|#)\s*([\w./-]+\.\w+)\s*\n/)
    const filePath = firstLineMatch?.[1] ?? null
    const code = filePath ? body.slice(firstLineMatch![0].length) : body
    blocks.push({ filePath, language, code })
  }

  return blocks
}
