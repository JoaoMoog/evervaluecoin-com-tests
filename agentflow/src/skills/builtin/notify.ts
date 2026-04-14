import * as vscode from 'vscode'
import { Skill, SkillContext } from '../types'

export const notifySkill: Skill = {
  id: 'notify',
  name: 'Notificar',
  description: 'Exibe notificações no VSCode ao completar tarefas',
  icon: '🔔',

  async applyOutput({ output, agentId }: SkillContext & { output: string }): Promise<string[]> {
    // Extract the first meaningful line as the notification summary
    const summary = extractSummary(output)

    vscode.window.showInformationMessage(
      `AgentFlow [${agentId}]: ${summary}`,
      'Ver Output'
    ).then(action => {
      if (action === 'Ver Output') {
        vscode.commands.executeCommand('agentflow.openCanvas')
      }
    })

    return []
  },
}

function extractSummary(output: string): string {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('```'))
  return lines[0]?.slice(0, 100) ?? 'Tarefa concluída'
}
