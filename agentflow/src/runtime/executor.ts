import { CopilotBridge, LLMMessage } from '../llm/bridge'
import { SkillRegistry } from '../skills/index'
import { SkillContext } from '../skills/types'
import { Logger } from '../utils/logger'
import { AgentDefinition, AgentRun } from './types'

export class AgentExecutor {
  constructor(
    private bridge: CopilotBridge,
    private skills: SkillRegistry,
    private logger: Logger,
    private workspaceRoot: string
  ) {}

  async execute(
    agent: AgentDefinition,
    taskContext: string,
    onChunk?: (text: string) => void
  ): Promise<AgentRun> {
    const run: AgentRun = {
      agentId: agent.id,
      startedAt: new Date(),
      status: 'running',
      input: taskContext,
      output: '',
      filesModified: [],
    }

    this.logger.info(`▷ Executando: ${agent.emoji} ${agent.name}`)

    try {
      // 1. Gather skill context (pre-LLM)
      const skillContext = await this.gatherSkillContext(agent.skills, taskContext, agent.id)

      // 2. Build messages
      const userContent = [
        agent.prompt,
        skillContext ? `CONTEXTO ADICIONAL:\n${skillContext}` : '',
        `TAREFA: ${taskContext}`,
      ].filter(Boolean).join('\n\n')

      const messages: LLMMessage[] = [
        { role: 'user', content: userContent },
      ]

      // 3. Stream from Copilot
      let fullOutput = ''
      for await (const chunk of this.bridge.sendStream(messages)) {
        if (!chunk.done) {
          fullOutput += chunk.text
          onChunk?.(chunk.text)
        } else {
          fullOutput = chunk.text
        }
      }

      // 4. Apply output skills (post-LLM)
      const modified = await this.applyOutputSkills(agent.skills, fullOutput, run)

      run.output = fullOutput
      run.filesModified = modified
      run.status = 'success'
      run.finishedAt = new Date()

      this.logger.success(`✓ ${agent.name} concluído (${modified.length} arquivo(s) modificado(s))`)

    } catch (err) {
      run.status = 'error'
      run.error = String(err)
      run.finishedAt = new Date()
      this.logger.error(`✗ ${agent.name}: ${err}`)
    }

    return run
  }

  private async gatherSkillContext(
    skillNames: string[],
    taskContext: string,
    agentId: string
  ): Promise<string> {
    const ctx: SkillContext = {
      taskContext,
      workspaceRoot: this.workspaceRoot,
      agentId,
    }

    const parts: string[] = []
    for (const name of skillNames) {
      const skill = this.skills.get(name)
      if (!skill?.gatherContext) continue
      try {
        const gathered = await skill.gatherContext(ctx)
        if (gathered) parts.push(`[${skill.name}]\n${gathered}`)
      } catch (err) {
        this.logger.warn(`Skill "${name}" falhou ao coletar contexto: ${err}`)
      }
    }

    return parts.join('\n\n')
  }

  private async applyOutputSkills(
    skillNames: string[],
    output: string,
    run: AgentRun
  ): Promise<string[]> {
    const modified: string[] = []
    const ctx: SkillContext & { output: string } = {
      taskContext: run.input,
      workspaceRoot: this.workspaceRoot,
      agentId: run.agentId,
      run: {
        agentId: run.agentId,
        startedAt: run.startedAt,
        filesModified: run.filesModified,
      },
      output,
    }

    for (const name of skillNames) {
      const skill = this.skills.get(name)
      if (!skill?.applyOutput) continue
      try {
        const files = await skill.applyOutput(ctx)
        modified.push(...files)
      } catch (err) {
        this.logger.warn(`Skill "${name}" falhou ao aplicar output: ${err}`)
      }
    }

    return modified
  }
}
