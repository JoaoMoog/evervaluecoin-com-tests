import * as vscode from 'vscode'
import { Skill } from './types'
import { readFileSkill } from './builtin/readFile'
import { writeFileSkill } from './builtin/writeFile'
import { runTerminalSkill } from './builtin/runTerminal'
import { searchCodeSkill } from './builtin/searchCode'
import { notifySkill } from './builtin/notify'

export { Skill } from './types'
export type { SkillContext } from './types'

export class SkillRegistry {
  private skills = new Map<string, Skill>()

  constructor() {
    [readFileSkill, writeFileSkill, runTerminalSkill, searchCodeSkill, notifySkill]
      .forEach(s => this.register(s))
  }

  register(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * Loads custom skills from .agentflow/skills/*.ts in the workspace.
   * NOTE: v0.1 — dynamic loading is a stub; requires pre-compiled modules.
   */
  async loadCustomSkills(_workspaceRoot: string): Promise<void> {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(_workspaceRoot),
      '.agentflow/skills/*.js'   // pre-compiled JS
    )
    const files = await vscode.workspace.findFiles(pattern)
    for (const file of files) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(file.fsPath) as { default?: Skill; skill?: Skill }
        const skill = mod.default ?? mod.skill
        if (skill?.id) {
          this.register(skill)
        }
      } catch (err) {
        console.warn(`[SkillRegistry] Failed to load custom skill from ${file.fsPath}:`, err)
      }
    }
  }
}
