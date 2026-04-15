export interface AgentSuggestion {
  id: string
  name: string
  emoji: string
  description: string
  why: string
  matchScore: number
  trigger: string
  triggerDetail: string
  skills: string[]
  modelPreference: string
  promptTemplate: string
  config: Record<string, unknown>
}

/**
 * Safely parses agent suggestions from LLM response.
 * Never throws — returns empty array on parse failure.
 */
export function parseAgentSuggestions(raw: string): AgentSuggestion[] {
  const clean = stripMarkdownFences(raw)

  try {
    const parsed = JSON.parse(clean)
    return validateSuggestions(parsed.agents ?? [])
  } catch {
    // Try to extract JSON from within surrounding text
    const match = raw.match(/\{[\s\S]*"agents"[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return validateSuggestions(parsed.agents ?? [])
      } catch {
        return []
      }
    }
    return []
  }
}

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

function validateSuggestions(raw: unknown[]): AgentSuggestion[] {
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(item => ({
      id: String(item.id ?? generateId(String(item.name ?? ''))),
      name: String(item.name ?? 'Agente sem nome'),
      emoji: String(item.emoji ?? '🤖'),
      description: String(item.description ?? ''),
      why: String(item.why ?? ''),
      matchScore: Number(item.matchScore ?? 50),
      trigger: String(item.trigger ?? 'manual'),
      triggerDetail: String(item.triggerDetail ?? ''),
      skills: Array.isArray(item.skills) ? item.skills.map(String) : ['read-file'],
      modelPreference: String(item.modelPreference ?? 'gpt-4o-mini'),
      promptTemplate: String(item.promptTemplate ?? ''),
      config: (typeof item.config === 'object' && item.config !== null)
        ? item.config as Record<string, unknown>
        : {},
    }))
}

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || `agent-${Date.now()}`
}
