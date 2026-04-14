import { RepoContext, FunctionInfo } from './types'

const MAX_TOKENS = 3500
const CHARS_PER_TOKEN = 4   // rough estimate

/**
 * Builds a compact text representation of the repo context for the LLM.
 * Stays under MAX_TOKENS to leave room for the system prompt.
 */
export function buildContext(repo: RepoContext): string {
  const parts: string[] = []

  // Header
  parts.push(
    `PROJECT: ${repo.projectName} | LANG: ${repo.language} | FRAMEWORK: ${repo.framework ?? 'none'} | TEST: ${repo.testFramework ?? 'none'}`
  )
  parts.push(`STATS: ${repo.stats.totalFiles} files, ${repo.stats.totalFunctions} functions`)

  // Scripts
  if (Object.keys(repo.scripts).length > 0) {
    const scriptLines = Object.entries(repo.scripts)
      .slice(0, 8)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')
    parts.push(`SCRIPTS:\n${scriptLines}`)
  }

  // Gaps first — highest priority
  if (repo.gaps.length > 0) {
    const gapLines = repo.gaps
      .slice(0, 10)
      .map(g => `  [${g.type}] ${g.file}: ${g.detail}`)
      .join('\n')
    parts.push(`GAPS DETECTED:\n${gapLines}`)
  }

  // Routes
  if (repo.routes.length > 0) {
    const routeLines = repo.routes
      .slice(0, 20)
      .map(r => `  ${r.method} ${r.path} @ ${r.file} (handler: ${r.handler})`)
      .join('\n')
    parts.push(`ROUTES (${repo.routes.length} total, showing ${Math.min(20, repo.routes.length)}):\n${routeLines}`)
  }

  // Models
  if (repo.models.length > 0) {
    const modelLines = repo.models
      .slice(0, 10)
      .map(m => `  ${m.name} [${m.orm}] @ ${m.file} fields: ${m.fields.join(', ')}`)
      .join('\n')
    parts.push(`MODELS:\n${modelLines}`)
  }

  // Functions — prioritize ones without tests or docs
  const prioritized = prioritizeFunctions(repo.functions)
  const maxFunctions = estimateMaxFunctions(parts.join('\n'))
  const fnLines = prioritized
    .slice(0, maxFunctions)
    .map(f => {
      const flags: string[] = []
      if (!f.hasTests) flags.push('no-tests')
      if (!f.hasJsDoc) flags.push('no-docs')
      if (f.isAsync) flags.push('async')
      const flagStr = flags.length ? ` [${flags.join(', ')}]` : ''
      return `  ${f.name}(${f.params.join(', ')}) @ ${f.file}:${f.line}${flagStr}`
    })
    .join('\n')
  parts.push(`FUNCTIONS (top ${Math.min(prioritized.length, maxFunctions)}):\n${fnLines}`)

  const result = parts.join('\n\n')
  // Truncate hard if still too long
  const maxChars = MAX_TOKENS * CHARS_PER_TOKEN
  return result.length > maxChars ? result.slice(0, maxChars) + '\n...(truncated)' : result
}

function prioritizeFunctions(fns: FunctionInfo[]): FunctionInfo[] {
  return [...fns].sort((a, b) => {
    const scoreA = (!a.hasTests ? 2 : 0) + (!a.hasJsDoc ? 1 : 0)
    const scoreB = (!b.hasTests ? 2 : 0) + (!b.hasJsDoc ? 1 : 0)
    return scoreB - scoreA
  })
}

function estimateMaxFunctions(existingText: string): number {
  const usedChars = existingText.length
  const remaining = MAX_TOKENS * CHARS_PER_TOKEN - usedChars
  // Each function line ≈ 80 chars
  return Math.max(5, Math.floor(remaining / 80))
}
