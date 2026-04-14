export interface SkillContext {
  taskContext: string
  workspaceRoot: string
  agentId: string
  run?: AgentRunRef
}

// Lightweight reference to an agent run (avoids circular import)
export interface AgentRunRef {
  agentId: string
  startedAt: Date
  filesModified: string[]
}

export interface Skill {
  id: string            // e.g. 'read-file'
  name: string          // e.g. 'Ler arquivo'
  description: string
  icon: string

  /** Called BEFORE the LLM to gather extra context */
  gatherContext?(ctx: SkillContext): Promise<string | null>

  /** Called AFTER the LLM to apply its output */
  applyOutput?(ctx: SkillContext & { output: string }): Promise<string[]>
}
