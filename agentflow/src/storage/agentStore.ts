import * as vscode from 'vscode'
import * as yaml from 'js-yaml'
import { AgentDefinition, TriggerConfig } from '../runtime/types'

// ── Schema validation ─────────────────────────────────────────────────────────
// Lightweight validation without external dependencies

function isString(v: unknown): v is string { return typeof v === 'string' }
function isBoolean(v: unknown): v is boolean { return typeof v === 'boolean' }
function isArray(v: unknown): v is unknown[] { return Array.isArray(v) }

function validateAgent(raw: unknown): AgentDefinition {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Agent YAML must be an object')
  }

  const r = raw as Record<string, unknown>

  if (!isString(r.id) || !r.id.trim()) throw new Error('agent.id must be a non-empty string')
  if (!isString(r.name))               throw new Error('agent.name must be a string')
  if (!isString(r.prompt))             r.prompt = ''
  if (!isBoolean(r.active))            r.active = false
  if (!isString(r.model))              r.model = 'copilot/gpt-4o'
  if (!isString(r.emoji))              r.emoji = '🤖'
  if (!isString(r.description))        r.description = ''
  if (!isArray(r.skills))              r.skills = []

  // Sanitize skill ids
  r.skills = (r.skills as unknown[]).filter(isString)

  // Validate trigger
  const trigger = r.trigger as Record<string, unknown> | undefined
  const validTriggerTypes = ['manual', 'file_save', 'on_startup', 'scheduled'] as const
  const triggerType = isString(trigger?.type) && validTriggerTypes.includes(trigger!.type as typeof validTriggerTypes[number])
    ? trigger!.type as TriggerConfig['type']
    : 'manual'

  r.trigger = {
    type: triggerType,
    pattern: isString(trigger?.pattern) ? trigger!.pattern : undefined,
    cron: isString(trigger?.cron) ? trigger!.cron : undefined,
  } satisfies TriggerConfig

  // Sanitize config
  r.config = (typeof r.config === 'object' && r.config !== null) ? r.config : {}

  // Sanitize canvasPosition
  if (r.canvasPosition && typeof r.canvasPosition === 'object') {
    const pos = r.canvasPosition as Record<string, unknown>
    r.canvasPosition = {
      x: typeof pos.x === 'number' ? pos.x : 0,
      y: typeof pos.y === 'number' ? pos.y : 0,
    }
  } else {
    delete r.canvasPosition
  }

  return r as unknown as AgentDefinition
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class AgentStore {
  private dirUri: vscode.Uri

  constructor(workspaceRoot: string) {
    this.dirUri = vscode.Uri.file(`${workspaceRoot}/.agentflow/agents`)
  }

  private async ensureDir(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.dirUri)
    } catch { /* already exists */ }
  }

  async list(): Promise<AgentDefinition[]> {
    await this.ensureDir()
    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(this.dirUri)
    } catch {
      return []
    }

    const results = await Promise.all(
      entries
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.yaml'))
        .map(([name]) => this.readFile(name))
    )

    return results.filter((a): a is AgentDefinition => a !== null)
  }

  async get(id: string): Promise<AgentDefinition | null> {
    // Sanitize id to prevent path traversal
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '')
    return this.readFile(`${safeId}.yaml`)
  }

  async save(agent: AgentDefinition): Promise<void> {
    await this.ensureDir()
    const validated = validateAgent(agent)
    const safeId = validated.id.replace(/[^a-zA-Z0-9-_]/g, '')
    const uri = vscode.Uri.joinPath(this.dirUri, `${safeId}.yaml`)
    const content = yaml.dump(validated, { indent: 2, lineWidth: 120 })
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
  }

  async delete(id: string): Promise<void> {
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '')
    const uri = vscode.Uri.joinPath(this.dirUri, `${safeId}.yaml`)
    try {
      await vscode.workspace.fs.delete(uri)
    } catch { /* file may not exist */ }
  }

  private async readFile(filename: string): Promise<AgentDefinition | null> {
    const uri = vscode.Uri.joinPath(this.dirUri, filename)
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      const raw = yaml.load(Buffer.from(bytes).toString('utf-8'))
      return validateAgent(raw)
    } catch (err) {
      console.warn(`[AgentStore] Skipping invalid agent file ${filename}:`, String(err))
      return null
    }
  }
}
