import { bridge } from '../bridge'
import { CanvasNodeView } from '../canvas/renderer'

export class InspectorPanel {
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  show(node: CanvasNodeView): void {
    this.container.innerHTML = ''
    this.container.style.display = 'flex'

    const header = this.createHeader(node)
    this.container.appendChild(header)

    if (node.type === 'agent') {
      this.renderAgentInspector(node)
    } else {
      this.renderInfoPanel(node)
    }
  }

  hide(): void {
    this.container.style.display = 'none'
    this.container.innerHTML = ''
  }

  private createHeader(node: CanvasNodeView): HTMLElement {
    const h = document.createElement('div')
    h.className = 'inspector-header'

    const title = document.createElement('div')
    title.className = 'inspector-title'
    title.textContent = `${node.emoji ?? ''} ${node.label}`
    h.appendChild(title)

    const close = document.createElement('button')
    close.className = 'inspector-close'
    close.textContent = '✕'
    close.addEventListener('click', () => this.hide())
    h.appendChild(close)

    return h
  }

  private renderAgentInspector(node: CanvasNodeView): void {
    const data = node.data as Record<string, unknown>
    const agentId = String(data.id ?? node.id.replace('agent-', ''))

    // Description
    this.addSection('Descrição', String(data.description ?? data.why ?? ''))

    // Why suggested
    if (data.why) {
      this.addSection('Por que sugerido', String(data.why))
    }

    // Prompt editor
    this.addPromptEditor(String(data.promptTemplate ?? data.prompt ?? ''))

    // Skills checklist
    const skills = (data.skills as string[]) ?? []
    this.addSkillsSection(skills)

    // Trigger config
    this.addTriggerConfig(data)

    // Actions
    this.addActions(agentId, data, node)
  }

  private renderInfoPanel(node: CanvasNodeView): void {
    const entries = Object.entries(node.data).filter(([k]) => !['data'].includes(k))
    entries.slice(0, 8).forEach(([key, val]) => {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        this.addSection(formatKey(key), String(val))
      }
    })
  }

  private addSection(label: string, content: string): void {
    const section = document.createElement('div')
    section.className = 'inspector-section'

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

  private addPromptEditor(defaultPrompt: string): void {
    const section = document.createElement('div')
    section.className = 'inspector-section'

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = 'Prompt do agente'

    const textarea = document.createElement('textarea')
    textarea.className = 'inspector-textarea'
    textarea.value = defaultPrompt
    textarea.rows = 6
    textarea.id = 'agent-prompt-input'

    section.appendChild(lbl)
    section.appendChild(textarea)
    this.container.appendChild(section)
  }

  private addSkillsSection(selectedSkills: string[]): void {
    const ALL_SKILLS = [
      { id: 'read-file', label: '📂 Ler arquivo' },
      { id: 'write-file', label: '✍️ Escrever arquivo' },
      { id: 'run-terminal', label: '▷ Terminal' },
      { id: 'search-code', label: '🔍 Buscar código' },
      { id: 'notify', label: '🔔 Notificar' },
    ]

    const section = document.createElement('div')
    section.className = 'inspector-section'

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = 'Skills ativas'
    section.appendChild(lbl)

    ALL_SKILLS.forEach(skill => {
      const row = document.createElement('label')
      row.className = 'inspector-skill-row'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.value = skill.id
      checkbox.checked = selectedSkills.includes(skill.id)
      checkbox.className = 'inspector-checkbox'

      const span = document.createElement('span')
      span.textContent = skill.label

      row.appendChild(checkbox)
      row.appendChild(span)
      section.appendChild(row)
    })

    this.container.appendChild(section)
  }

  private addTriggerConfig(data: Record<string, unknown>): void {
    const section = document.createElement('div')
    section.className = 'inspector-section'

    const lbl = document.createElement('div')
    lbl.className = 'inspector-label'
    lbl.textContent = 'Trigger'

    const select = document.createElement('select')
    select.className = 'inspector-select'
    select.id = 'agent-trigger-select'

    const options = [
      { value: 'manual', label: 'Manual' },
      { value: 'file_save', label: 'Ao salvar arquivo' },
      { value: 'on_startup', label: 'Ao abrir o projeto' },
    ]

    const trigger = (data.trigger as { type?: string })?.type ?? data.trigger ?? 'manual'

    options.forEach(opt => {
      const op = document.createElement('option')
      op.value = opt.value
      op.textContent = opt.label
      op.selected = opt.value === trigger
      select.appendChild(op)
    })

    const patternInput = document.createElement('input')
    patternInput.type = 'text'
    patternInput.className = 'inspector-input'
    patternInput.id = 'agent-trigger-pattern'
    patternInput.placeholder = 'Pattern (ex: src/**/*.ts)'
    const triggerPattern = (data.trigger as { pattern?: string })?.pattern ?? data.triggerDetail as string ?? ''
    patternInput.value = String(triggerPattern)

    section.appendChild(lbl)
    section.appendChild(select)
    section.appendChild(patternInput)
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
      activateBtn.textContent = '✓ Ativado!'
      activateBtn.disabled = true
    })

    const runBtn = document.createElement('button')
    runBtn.className = 'btn btn-secondary'
    runBtn.textContent = '▷ Testar agora'
    runBtn.addEventListener('click', () => {
      bridge.send('RUN_AGENT', { id: agentId, context: 'manual test' })
    })

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'btn btn-danger'
    deleteBtn.textContent = '✕ Remover'
    deleteBtn.addEventListener('click', () => {
      bridge.send('DELETE_AGENT', { id: agentId })
      this.hide()
    })

    section.appendChild(activateBtn)
    section.appendChild(runBtn)
    section.appendChild(deleteBtn)
    this.container.appendChild(section)
  }

  private buildAgentDefinition(
    agentId: string,
    data: Record<string, unknown>,
    _node: CanvasNodeView
  ): Record<string, unknown> {
    const prompt = (document.getElementById('agent-prompt-input') as HTMLTextAreaElement)?.value
      ?? String(data.promptTemplate ?? data.prompt ?? '')

    const triggerType = (document.getElementById('agent-trigger-select') as HTMLSelectElement)?.value
      ?? 'manual'

    const triggerPattern = (document.getElementById('agent-trigger-pattern') as HTMLInputElement)?.value
      ?? ''

    const allCheckboxes = this.container.querySelectorAll<HTMLInputElement>('.inspector-checkbox:checked')
    const skills = Array.from(allCheckboxes).map(c => c.value)

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

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}
