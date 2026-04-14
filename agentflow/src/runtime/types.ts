export type AgentStatus = 'idle' | 'running' | 'success' | 'error' | 'paused'

export interface TriggerConfig {
  type: 'file_save' | 'manual' | 'on_startup' | 'scheduled'
  pattern?: string    // glob for file_save
  cron?: string       // for scheduled (future)
}

export interface AgentDefinition {
  id: string
  name: string
  emoji: string
  description: string
  model: string
  trigger: TriggerConfig
  skills: string[]
  prompt: string
  config: Record<string, unknown>
  active: boolean
  canvasPosition?: { x: number; y: number }
}

export interface AgentRun {
  agentId: string
  startedAt: Date
  finishedAt?: Date
  status: AgentStatus
  input: string
  output: string
  filesModified: string[]
  error?: string
}
