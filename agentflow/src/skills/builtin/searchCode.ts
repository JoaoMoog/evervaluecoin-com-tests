import * as vscode from 'vscode'
import { Skill, SkillContext } from '../types'

export const searchCodeSkill: Skill = {
  id: 'search-code',
  name: 'Buscar no código',
  description: 'Pesquisa padrões e símbolos no workspace para enriquecer o contexto',
  icon: '🔍',

  async gatherContext({ taskContext }: SkillContext): Promise<string | null> {
    // Extract identifiers from the task context to search for
    const identifiers = extractIdentifiers(taskContext)
    if (!identifiers.length) return null

    const results: string[] = []

    for (const term of identifiers.slice(0, 3)) {
      const matches = await searchTerm(term)
      if (matches.length > 0) {
        results.push(`// Ocorrências de "${term}":\n${matches.slice(0, 5).join('\n')}`)
      }
    }

    return results.length > 0 ? results.join('\n\n') : null
  },
}

async function searchTerm(term: string): Promise<string[]> {
  const results: string[] = []
  const files = await vscode.workspace.findFiles(
    '**/*.{ts,tsx,js,jsx}',
    '**/node_modules/**',
    20
  )

  for (const uri of files) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      const content = Buffer.from(bytes).toString('utf-8')
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        if (line.includes(term)) {
          const relPath = vscode.workspace.asRelativePath(uri)
          results.push(`${relPath}:${i + 1}: ${line.trim()}`)
        }
      })
    } catch {
      // Skip unreadable files
    }
  }

  return results
}

function extractIdentifiers(text: string): string[] {
  // Extract camelCase and PascalCase identifiers that look like function/class names
  const matches = text.match(/\b[A-Za-z][a-zA-Z0-9]{3,}\b/g) ?? []
  // Remove common English words and keywords
  const stopWords = new Set(['function', 'const', 'return', 'async', 'await', 'import', 'export', 'from', 'class'])
  return [...new Set(matches)].filter(w => !stopWords.has(w)).slice(0, 5)
}
