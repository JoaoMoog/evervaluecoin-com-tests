import * as vscode from 'vscode'
import { Skill, SkillContext } from '../types'

// Only allow safe commands
const ALLOWED_COMMAND_PREFIXES = [
  'npm ', 'yarn ', 'pnpm ',
  'npx ', 'node ',
  'tsc', 'eslint', 'prettier',
  'jest', 'vitest', 'mocha',
  'git status', 'git log',
]

export const runTerminalSkill: Skill = {
  id: 'run-terminal',
  name: 'Executar no terminal',
  description: 'Executa comandos como npm test, tsc --noEmit, etc.',
  icon: '▷',

  async applyOutput({ output }: SkillContext & { output: string }): Promise<string[]> {
    const commands = extractBashBlocks(output)
    const safeCommands = commands.filter(isCommandSafe).slice(0, 2)

    for (const cmd of safeCommands) {
      const terminal = vscode.window.createTerminal({ name: 'AgentFlow' })
      terminal.sendText(cmd)
      terminal.show(true)
    }

    return []   // terminal commands don't modify tracked files
  },
}

function extractBashBlocks(output: string): string[] {
  const commands: string[] = []
  const BASH_RE = /```(?:bash|sh|shell)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = BASH_RE.exec(output)) !== null) {
    const lines = match[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
    commands.push(...lines)
  }

  return commands
}

function isCommandSafe(cmd: string): boolean {
  return ALLOWED_COMMAND_PREFIXES.some(prefix => cmd.startsWith(prefix))
}
