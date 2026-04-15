import { bridge } from '../bridge'
import { CanvasNodeView } from '../canvas/renderer'

const ALL_SKILLS = [
  {
    id: 'read-file',
    label: '📂 Ler arquivo',
    tooltip: 'O agente pode abrir e ler arquivos do seu projeto para ter contexto antes de responder',
  },
  {
    id: 'write-file',
    label: '✍️ Escrever arquivo',
    tooltip: 'O agente pode criar ou modificar arquivos automaticamente com o código que gerou',
  },
  {
    id: 'run-terminal',
    label: '▷ Executar no terminal',
    tooltip: 'O agente pode rodar comandos seguros (npm test, tsc, etc.) depois de gerar o código',
  },
  {
    id: 'search-code',
    label: '🔍 Buscar no projeto',
    tooltip: 'O agente pesquisa trechos do seu código para ter mais contexto antes de responder',
  },
  {
    id: 'notify',
    label: '🔔 Notificar ao concluir',
    tooltip: 'O agente envia uma notificação no VS Code quando terminar de executar',
  },
]

const TRIGGER_OPTIONS = [
  { value: 'manual',     label: 'Somente quando eu pedir' },
  { value: 'file_save',  label: 'Automaticamente ao salvar um arquivo' },
  { value: 'on_startup', label: 'Toda vez que eu abrir o projeto' },
]

const GLOB_EXAMPLES = `Exemplos de padrões:
  src/**/*.ts    → todos os TypeScript em src/
  **/*.test.ts   → todos os arquivos de teste
  src/services/* → arquivos direto em services/`

export class InspectorPanel {
  private container: HTMLElement
  private currentAgentId: string | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  show(node: CanvasNodeView): void {
    this.container.innerHTML = ''
    this.container.style.display = 'flex'
    this.currentAgentId = null

    this.container.appendChild(this.createHeader(node))

    if (node.type === 'agent') {
      this.renderAgentInspector(node)
    } else {
      this.renderInfoPanel(node)
    }
  }

  hide(): void {
    this.container.style.display = 'none'
    this.container.innerHTML = ''
    this.currentAgentId = null
  }

  /** Called by main.ts when extension sends PROMPT_SUGGESTED */
  fillPrompt(agentId: string, prompt: string): void {
    if (this.currentAgentId !== agentId) return
    const textarea = document.getElementById('agent-prompt-input') as HTMLTextAreaElement | null
    if (textarea) {
      textarea.value = prompt
      textarea.classList.add('textarea--filled')
    }
  }

  private createHeader(node: CanvasNodeView): HTMLElement {
    const h = document.createElement('div')
    h.className = 'inspector-header'

    const title = document.createElement('div')
    title.className = 'inspector-title'
    title.textContent = `${node.emoji ?? ''} ${node.label}`.trim()

    const close = document.createElement('button')
    close.className = 'inspector-close'
    close.title = 'Fechar'
    close.textContent = '✕'
    close.addEventListener('click', () => this.hide())

    h.appendChild(title)
    h.appendChild(close)
    return h
  }

  private renderAgentInspector(node: CanvasNodeView): void {
    const data = node.data as Record<string, unknown>
    const agentId = String(data.id ?? node.id.replace('agent-', ''))
    this.currentAgentId = agentId

    // Why this agent was suggested
    if (data.why) {
      this.addSection('Por que foi sugerido para o seu projeto', String(data.why), 'inspector-why')
    } else if (data.description) {
      this.addSection('O que este agente faz', String(data.description))
    }

    this.addPromptEditor(String(data.promptTemplate ?? data.prompt ?? ''), agentId, String(data.name ?? ''), String(data.description ?? ''))
    this.addSkillsSection((data.skills as string[]) ?? [])
    this.addTriggerConfig(data)
    this.addActions(agentId, data, node)
  }

  private renderInfoPanel(node: CanvasNodeView): void {
    const LABELS: Record<string, string> = {
      name: 'Nome', file: 'Arquivo', line: 'Linha', method: 'Método',
      path: 'Rota', handler: 'Handler', orm: 'ORM',
      isAsync: 'Assíncrona', isExported: 'Exportada',
      hasTests: 'Tem testes', hasJsDoc: 'Tem documentação',
    }

    const data = node.data as Record<string, unknown>
    Object.entries(data)
      .filter(([k, v]) => k in LABELS && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
      .slice(0, 8)
      .forEach(([key, val]) => {
        const display = typeof val === 'boolean' ? (val ? 'Sim' : 'Não') : String(val)
        this.addSection(LABELS[key] ?? key, display)
      })

    // Show flags for functions
    if (node.type === 'function') {
      const flags = (data as { flags?: string[] }).flags ?? []
      if (flags.length) {
        this.addSection('Alertas detectados', flags.join(' · '), 'inspector-flags')
      }
    }

    // For flow (trigger) nodes: offer to create an agent from this flow
    if (node.type === 'trigger') {
      const flowData = data as { domain?: string; label?: string; functions?: string[]; agentSuggestions?: unknown[] }
      const section = document.createElement('div')
      section.className = 'inspector-actions'

      const createBtn = document.createElement('button')
      createBtn.className = 'btn btn-primary'
      createBtn.textContent = '+ Criar Agente para este Fluxo'
      createBtn.addEventListener('click', () => {
        bridge.send('OPEN_BUILDER', {
          flowDomain:    flowData.domain,
          flowLabel:     flowData.label ?? node.label,
          flowFunctions: flowData.functions ?? [],
        })
        this.hide()
      })

      section.appendChild(createBtn)
      this.container.appendChild(section)
    }
  }

  private addSection(label: string, content: string, extraClass = ''): void {
    const section = document.createElement('div')
    section.className = `inspector-section ${extraClass}`.trim()

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = label

    const val = document.createElement('div')
    val.className = 'inspector-value'
    val.textContent = content

    section.appendChild(lbl)
    section.appendChild(val)
    this.container.appendChild(section)
  }

  private addPromptEditor(defaultPrompt: string, agentId: string, agentName: string, agentDescription: string): void {
    const section = document.createElement('div')
    section.className = 'inspector-section'

    const headerRow = document.createElement('div')
    headerRow.className = 'inspector-label-row'

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = 'Instruções do agente'

    const suggestBtn = document.createElement('button')
    suggestBtn.className = 'btn-link-small'
    suggestBtn.textContent = '✨ Sugerir com Copilot'
    suggestBtn.title = 'Pedir ao Copilot para criar um prompt para este agente'
    suggestBtn.addEventListener('click', () => {
      suggestBtn.textContent = '⏳ Gerando...'
      suggestBtn.disabled = true
      bridge.send('SUGGEST_PROMPT', { agentId, agentName, agentDescription })
      // Re-enable after 10s as fallback
      setTimeout(() => {
        suggestBtn.textContent = '✨ Sugerir com Copilot'
        suggestBtn.disabled = false
      }, 10000)
    })

    headerRow.appendChild(lbl)
    headerRow.appendChild(suggestBtn)

    const textarea = document.createElement('textarea')
    textarea.className = 'inspector-textarea'
    textarea.id = 'agent-prompt-input'
    textarea.value = defaultPrompt
    textarea.rows = 6
    textarea.placeholder = 'Descreva como o agente deve se comportar.\n\nEx: "Você revisa código TypeScript e sugere melhorias de legibilidade. Foque em nomes de variáveis e comentários."'

    const hint = document.createElement('div')
    hint.className = 'inspector-hint'
    hint.textContent = 'Sem ideia do que escrever? Use o botão "Sugerir com Copilot" acima.'

    section.appendChild(headerRow)
    section.appendChild(textarea)
    if (!defaultPrompt) section.appendChild(hint)
    this.container.appendChild(section)
  }

  private addSkillsSection(selectedSkills: string[]): void {
    const section = document.createElement('div')
    section.className = 'inspector-section'

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = 'O que este agente pode fazer'
    section.appendChild(lbl)

    ALL_SKILLS.forEach(skill => {
      const row = document.createElement('label')
      row.className = 'inspector-skill-row'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.value = skill.id
      checkbox.checked = selectedSkills.includes(skill.id)
      checkbox.className = 'inspector-checkbox'

      const labelSpan = document.createElement('span')
      labelSpan.textContent = skill.label

      const tooltipWrap = document.createElement('span')
      tooltipWrap.className = 'skill-tooltip-wrap'

      const tooltipIcon = document.createElement('span')
      tooltipIcon.className = 'skill-tooltip-icon'
      tooltipIcon.textContent = '?'

      const tooltipBox = document.createElement('span')
      tooltipBox.className = 'skill-tooltip-box'
      tooltipBox.textContent = skill.tooltip

      tooltipWrap.appendChild(tooltipIcon)
      tooltipWrap.appendChild(tooltipBox)

      row.appendChild(checkbox)
      row.appendChild(labelSpan)
      row.appendChild(tooltipWrap)
      section.appendChild(row)
    })

    this.container.appendChild(section)
  }

  private addTriggerConfig(data: Record<string, unknown>): void {
    const section = document.createElement('div')
    section.className = 'inspector-section'

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = 'Quando este agente vai rodar?'

    const select = document.createElement('select')
    select.className = 'inspector-select'
    select.id = 'agent-trigger-select'

    const triggerType = (data.trigger as { type?: string })?.type ?? String(data.trigger ?? 'manual')

    TRIGGER_OPTIONS.forEach(opt => {
      const op = document.createElement('option')
      op.value = opt.value
      op.textContent = opt.label
      op.selected = opt.value === triggerType
      select.appendChild(op)
    })

    const patternWrap = document.createElement('div')
    patternWrap.className = 'inspector-pattern-wrap'
    patternWrap.style.display = triggerType === 'file_save' ? 'block' : 'none'

    const patternLabel = document.createElement('div')
    patternLabel.className = 'inspector-sublabel'
    patternLabel.textContent = 'Quais arquivos monitorar?'

    const patternInput = document.createElement('input')
    patternInput.type = 'text'
    patternInput.className = 'inspector-input'
    patternInput.id = 'agent-trigger-pattern'
    patternInput.placeholder = 'Ex: src/**/*.ts (todos os TypeScript em src/)'
    const existingPattern = (data.trigger as { pattern?: string })?.pattern ?? String(data.triggerDetail ?? '')
    patternInput.value = existingPattern

    const patternHint = document.createElement('div')
    patternHint.className = 'inspector-hint'
    patternHint.style.whiteSpace = 'pre'
    patternHint.textContent = GLOB_EXAMPLES

    patternWrap.appendChild(patternLabel)
    patternWrap.appendChild(patternInput)
    patternWrap.appendChild(patternHint)

    select.addEventListener('change', () => {
      patternWrap.style.display = select.value === 'file_save' ? 'block' : 'none'
    })

    section.appendChild(lbl)
    section.appendChild(select)
    section.appendChild(patternWrap)
    this.container.appendChild(section)
  }

  private addActions(agentId: string, data: Record<string, unknown>, node: CanvasNodeView): void {
    const section = document.createElement('div')
    section.className = 'inspector-actions'

    const activateBtn = document.createElement('button')
    activateBtn.className = 'btn btn-primary'
    activateBtn.textContent = '✓ Ativar Agente'
    activateBtn.addEventListener('click', () => {
      const agentDef = this.buildAgentDefinition(agentId, data, node)
      agentDef.active = true
      bridge.send('ACTIVATE_AGENT', agentDef)
      activateBtn.textContent = '⏳ Ativando...'
      activateBtn.disabled = true
      // Success state after short delay (bridge will send AGENT_STATUS)
      setTimeout(() => {
        if (activateBtn.disabled) {
          activateBtn.textContent = '✓ Agente ativado!'
          activateBtn.style.background = '#22c55e'
        }
      }, 1500)
    })

    const runBtn = document.createElement('button')
    runBtn.className = 'btn btn-secondary'
    runBtn.textContent = '▷ Testar agora'
    runBtn.title = 'Executa o agente manualmente uma vez para você ver o resultado'
    runBtn.addEventListener('click', () => {
      runBtn.textContent = '⏳ Executando...'
      runBtn.disabled = true
      bridge.send('RUN_AGENT', { id: agentId, context: 'manual test' })
      setTimeout(() => {
        runBtn.textContent = '▷ Testar agora'
        runBtn.disabled = false
      }, 20000)
    })

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'btn btn-danger'
    deleteBtn.textContent = 'Remover agente'
    deleteBtn.addEventListener('click', async () => {
      const modal = (window as Window & { showDeleteModal?: (id: string, name: string) => Promise<boolean> }).showDeleteModal
      if (modal) {
        const confirmed = await modal(agentId, String(data.name ?? agentId))
        if (confirmed) this.hide()
      } else {
        // Fallback
        if (confirm(`Remover o agente "${String(data.name ?? agentId)}"?`)) {
          bridge.send('DELETE_AGENT', { id: agentId })
          this.hide()
        }
      }
    })

    section.appendChild(activateBtn)
    section.appendChild(runBtn)
    section.appendChild(deleteBtn)
    this.container.appendChild(section)
  }

  private buildAgentDefinition(agentId: string, data: Record<string, unknown>, _node: CanvasNodeView): Record<string, unknown> {
    const prompt = (document.getElementById('agent-prompt-input') as HTMLTextAreaElement | null)?.value
      ?? String(data.promptTemplate ?? data.prompt ?? '')

    const triggerType = (document.getElementById('agent-trigger-select') as HTMLSelectElement | null)?.value
      ?? 'manual'

    const triggerPattern = (document.getElementById('agent-trigger-pattern') as HTMLInputElement | null)?.value
      ?? ''

    const allChecked = this.container.querySelectorAll<HTMLInputElement>('.inspector-checkbox:checked')
    const skills = Array.from(allChecked).map(c => c.value)

    return {
      id: agentId,
      name: String(data.name ?? 'Agente'),
      emoji: String(data.emoji ?? '🤖'),
      description: String(data.description ?? ''),
      model: String(data.modelPreference ?? 'copilot/gpt-4o'),
      trigger: {
        type: triggerType,
        pattern: triggerPattern || undefined,
      },
      skills,
      prompt,
      config: data.config ?? {},
      active: true,
    }
  }
}
