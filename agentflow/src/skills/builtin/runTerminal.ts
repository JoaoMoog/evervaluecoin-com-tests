import * as vscode from 'vscode'
import { Skill, SkillContext } from '../types'

// Strict allowlist: exact command tokens that are permitted.
// Each entry is either a full command string or a prefix token pair [cmd, allowed-subcommands]
const SAFE_COMMANDS: Array<{ cmd: string; args?: RegExp }> = [
  { cmd: 'npm',     args: /^(test|run|install|build|lint|typecheck|ci)(\s|$)/ },
  { cmd: 'yarn',    args: /^(test|run|install|build|lint|add|dev)(\s|$)/ },
  { cmd: 'pnpm',    args: /^(test|run|install|build|lint|add|dev)(\s|$)/ },
  { cmd: 'npx',     args: /^(jest|vitest|eslint|tsc|prettier)(\s|$)/ },
  { cmd: 'tsc',     args: /^(--noEmit|--watch|-p)?/ },
  { cmd: 'eslint',  args: /^[\s./]/ },
  { cmd: 'jest',    args: /^(--watch|--coverage|--testPathPattern)?/ },
  { cmd: 'vitest',  args: /^(run|watch|coverage)?/ },
  { cmd: 'prettier',args: /^(--write|--check)/ },
]

// Characters that indicate shell injection attempts
const INJECTION_CHARS = /[;&|`$(){}[\]<>\\]/

export const runTerminalSkill: Skill = {
  id: 'run-terminal',
  name: 'Executar no terminal',
  description: 'Executa comandos como npm test, tsc --noEmit, etc.',
  icon: '▷',

  async applyOutput({ output }: SkillContext & { output: string }): Promise<string[]> {
    const commands = extractBashBlocks(output)
    const safe = commands.filter(isCommandSafe).slice(0, 2)

    for (const cmd of safe) {
      const terminal = vscode.window.createTerminal({ name: 'AgentFlow' })
      terminal.sendText(cmd)
      terminal.show(true)
    }

    return []
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
  // Reject anything with shell metacharacters immediately
  if (INJECTION_CHARS.test(cmd)) return false

  const trimmed = cmd.trim()
  const [token, ...rest] = trimmed.split(/\s+/)
  const suffix = rest.join(' ')

  const rule = SAFE_COMMANDS.find(r => r.cmd === token)
  if (!rule) return false
  if (!rule.args) return true
  return rule.args.test(suffix)
}
