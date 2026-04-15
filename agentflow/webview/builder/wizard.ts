import { bridge } from '../bridge'

const GOAL_OPTIONS = [
  { value: 'test',     label: '🧪 Escrever testes',        detail: 'Gera testes unitários e de integração automaticamente',
    example: "describe('checkout', () => {\n  it('should process payment', () => {\n    expect(result.status).toBe('success')\n  })\n})" },
  { value: 'security', label: '🛡 Revisar segurança',      detail: 'Detecta senhas expostas, inputs sem validação e outros riscos',
    example: '⚠ checkout.ts:45 — Senha exposta em variável\n⚠ api/users.ts:12 — Input não sanitizado antes de query' },
  { value: 'docs',     label: '📝 Documentar código',      detail: 'Adiciona descrições claras às funções e arquivos do projeto',
    example: "/** Processa o pagamento via Stripe.\n * @param amount Valor em centavos\n * @returns Status da transação\n */" },
  { value: 'review',   label: '🔍 Revisar qualidade',      detail: 'Sugere melhorias de legibilidade, performance e organização',
    example: '💡 processOrder() tem 120 linhas — considere dividir\n💡 3 loops aninhados em cart.ts — pode otimizar' },
  { value: 'custom',   label: '✏️ Objetivo personalizado',  detail: 'Descreva exatamente o que você quer que o agente faça',
    example: null },
]

const TRIGGER_OPTIONS = [
  { value: 'manual',
    label: '🖱 Somente quando eu pedir',
    detail: 'Você clica em ▷ quando quiser rodar o agente',
    example: 'Ideal para tarefas pontuais, como revisar antes de um deploy' },
  { value: 'file_save',
    label: '💾 Ao salvar um arquivo',
    detail: 'Executa automaticamente toda vez que você salvar',
    example: 'Ex: sempre que salvar um .ts, gera os testes daquela função' },
  { value: 'on_startup',
    label: '🚀 Ao abrir o projeto',
    detail: 'Roda uma vez quando você abre o VS Code',
    example: 'Ex: mostra um resumo do que mudou desde ontem' },
]

const ALL_SKILLS = [
  { id: 'read-file',    label: '📂 Ler arquivos',        detail: 'Lê arquivos para ter contexto antes de responder' },
  { id: 'write-file',   label: '✍️ Modificar arquivos',  detail: 'Cria ou edita arquivos com o código gerado' },
  { id: 'run-terminal', label: '▷ Executar comandos',    detail: 'Roda npm test, tsc e outros comandos seguros' },
  { id: 'search-code',  label: '🔍 Buscar no código',    detail: 'Pesquisa trechos do projeto para mais contexto' },
  { id: 'notify',       label: '🔔 Notificar ao concluir', detail: 'Envia notificação quando terminar de executar' },
]

const GOAL_DEFAULT_SKILLS: Record<string, string[]> = {
  test:     ['read-file', 'write-file', 'run-terminal'],
  security: ['read-file', 'search-code'],
  docs:     ['read-file', 'write-file'],
  review:   ['read-file', 'search-code', 'notify'],
  custom:   ['read-file'],
}

interface WizardState {
  flowDomain?: string
  flowLabel?: string
  flowFunctions?: string[]
  trigger: string
  triggerPattern: string
  customContext: string
  goalType: string
  customGoal: string
  skills: string[]
  name: string
  emoji: string
  description: string
  prompt: string
}

const TOTAL_STEPS = 5
const STEP_LABELS = ['Gatilho', 'Contexto', 'Objetivo', 'Ações', 'Confirmar']

export class BuilderWizard {
  private container: HTMLElement
  private step = 1
  private promptLoading = false
  private state: WizardState = {
    trigger: 'manual',
    triggerPattern: '',
    customContext: '',
    goalType: 'test',
    customGoal: '',
    skills: ['read-file'],
    name: '',
    emoji: '🤖',
    description: '',
    prompt: '',
  }

  constructor(container: HTMLElement) {
    this.container = container
  }

  open(payload: { flowDomain?: string; flowLabel?: string; flowFunctions?: string[] }): void {
    this.step = 1
    this.promptLoading = false
    this.state = {
      ...this.state,
      flowDomain: payload.flowDomain,
      flowLabel: payload.flowLabel,
      flowFunctions: payload.flowFunctions ?? [],
      name: payload.flowLabel ? `Agente de ${payload.flowLabel}` : '',
      emoji: '🤖',
      prompt: '',
      skills: ['read-file'],
    }
    this.container.style.display = 'flex'
    this.render()
  }

  close(): void {
    this.container.style.display = 'none'
    this.container.innerHTML = ''
  }

  /** Called when BUILDER_PROMPT_READY arrives from the extension */
  fillPrompt(data: { prompt: string; name: string; emoji: string; description: string }): void {
    this.promptLoading = false
    if (data.prompt)       this.state.prompt = data.prompt
    if (data.name)         this.state.name = data.name
    if (data.emoji)        this.state.emoji = data.emoji
    if (data.description)  this.state.description = data.description
    if (this.step === TOTAL_STEPS) this.render()
  }

  private render(): void {
    this.container.innerHTML = ''
    this.container.appendChild(this.buildHeader())
    this.container.appendChild(this.buildProgress())

    const content = document.createElement('div')
    content.className = 'builder-content'

    switch (this.step) {
      case 1: this.renderStep1(content); break
      case 2: this.renderStep2(content); break
      case 3: this.renderStep3(content); break
      case 4: this.renderStep4(content); break
      case 5: this.renderStep5(content); break
    }

    this.container.appendChild(content)
    this.container.appendChild(this.buildFooter())
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  private buildHeader(): HTMLElement {
    const h = document.createElement('div')
    h.className = 'builder-header'

    const title = document.createElement('div')
    title.className = 'builder-title'
    title.textContent = '+ Criar Agente'

    const close = document.createElement('button')
    close.className = 'inspector-close'
    close.title = 'Fechar'
    close.textContent = '✕'
    close.addEventListener('click', () => this.close())

    h.appendChild(title)
    h.appendChild(close)
    return h
  }

  // ── Progress steps ──────────────────────────────────────────────────────────

  private buildProgress(): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'builder-progress'

    STEP_LABELS.forEach((label, i) => {
      const stepNum = i + 1
      const isDone   = stepNum < this.step
      const isActive = stepNum === this.step

      const dot = document.createElement('div')
      dot.className = [
        'builder-step-dot',
        isActive ? 'builder-step-dot--active' : '',
        isDone   ? 'builder-step-dot--done'   : '',
      ].filter(Boolean).join(' ')

      const icon = document.createElement('div')
      icon.className = 'builder-step-icon'
      icon.textContent = isDone ? '✓' : String(stepNum)

      const lbl = document.createElement('div')
      lbl.className = 'builder-step-label'
      lbl.textContent = label

      dot.appendChild(icon)
      dot.appendChild(lbl)
      bar.appendChild(dot)

      if (i < STEP_LABELS.length - 1) {
        const line = document.createElement('div')
        line.className = `builder-step-line${isDone ? ' builder-step-line--done' : ''}`
        bar.appendChild(line)
      }
    })

    return bar
  }

  // ── Step 1: Trigger ─────────────────────────────────────────────────────────

  private renderStep1(el: HTMLElement): void {
    this.addStepHeading(el, 'Quando este agente vai executar?', 'Escolha o que dispara este agente. Você pode mudar isso depois.')

    TRIGGER_OPTIONS.forEach(opt => {
      const card = this.makeOptionCard(
        'trigger', opt.value, opt.label, opt.detail,
        this.state.trigger === opt.value,
        (val) => {
          this.state.trigger = val
          patternWrap.style.display = val === 'file_save' ? 'block' : 'none'
        }
      )
      // Concrete example below the detail
      const ex = document.createElement('div')
      ex.className = 'builder-option-example'
      ex.textContent = opt.example
      card.appendChild(ex)
      el.appendChild(card)
    })

    const patternWrap = document.createElement('div')
    patternWrap.className = 'builder-pattern-wrap'
    patternWrap.style.display = this.state.trigger === 'file_save' ? 'block' : 'none'

    const patternLabel = document.createElement('label')
    patternLabel.className = 'builder-field-label'
    patternLabel.textContent = 'Quais arquivos monitorar?'

    const patternInput = document.createElement('input')
    patternInput.type = 'text'
    patternInput.className = 'inspector-input'
    patternInput.placeholder = 'Ex: src/**/*.ts'
    patternInput.value = this.state.triggerPattern
    patternInput.addEventListener('input', () => { this.state.triggerPattern = patternInput.value })

    const hint = document.createElement('div')
    hint.className = 'builder-hint'
    hint.textContent = 'src/**/*.ts  →  todos os .ts em src/   ·   **/*.test.ts  →  arquivos de teste'

    patternWrap.appendChild(patternLabel)
    patternWrap.appendChild(patternInput)
    patternWrap.appendChild(hint)
    el.appendChild(patternWrap)
  }

  // ── Step 2: Context ─────────────────────────────────────────────────────────

  private renderStep2(el: HTMLElement): void {
    this.addStepHeading(el, 'Em qual parte do projeto ele vai atuar?', 'O agente usará este contexto para saber onde focar.')

    if (this.state.flowDomain && this.state.flowFunctions?.length) {
      const card = document.createElement('div')
      card.className = 'builder-flow-context'

      const badge = document.createElement('div')
      badge.className = 'builder-flow-badge'
      badge.textContent = `📦 Fluxo: ${this.state.flowLabel ?? this.state.flowDomain}`
      card.appendChild(badge)

      const fns = this.state.flowFunctions
      const fnList = document.createElement('div')
      fnList.className = 'builder-fn-list'
      fnList.textContent = fns.slice(0, 6).join(', ') + (fns.length > 6 ? ` +${fns.length - 6} mais` : '')
      card.appendChild(fnList)

      const hint = document.createElement('p')
      hint.className = 'builder-hint'
      hint.textContent = 'O agente vai focar nestas funções detectadas no seu projeto.'
      card.appendChild(hint)

      el.appendChild(card)
    } else {
      const lbl = document.createElement('label')
      lbl.className = 'builder-field-label'
      lbl.textContent = 'Foco do agente'

      const textarea = document.createElement('textarea')
      textarea.className = 'inspector-textarea'
      textarea.rows = 3
      textarea.placeholder = 'Ex: Arquivos em src/payments/**  ·  Funções de autenticação  ·  Toda a API REST'
      textarea.value = this.state.customContext
      textarea.addEventListener('input', () => { this.state.customContext = textarea.value })

      el.appendChild(lbl)
      el.appendChild(textarea)
    }
  }

  // ── Step 3: Goal ────────────────────────────────────────────────────────────

  private renderStep3(el: HTMLElement): void {
    this.addStepHeading(el, 'O que você quer que ele faça?', 'Escolha o objetivo principal deste agente.')

    let customWrap: HTMLElement

    GOAL_OPTIONS.forEach(opt => {
      const card = this.makeOptionCard(
        'goalType', opt.value, opt.label, opt.detail,
        this.state.goalType === opt.value,
        (val) => {
          this.state.goalType = val
          customWrap.style.display = val === 'custom' ? 'block' : 'none'
          this.state.skills = GOAL_DEFAULT_SKILLS[val] ?? ['read-file']
        }
      )
      if (opt.example) {
        const ex = document.createElement('div')
        ex.className = 'builder-option-example'
        ex.textContent = opt.example
        card.appendChild(ex)
      }
      el.appendChild(card)
    })

    customWrap = document.createElement('div')
    customWrap.className = 'builder-pattern-wrap'
    customWrap.style.display = this.state.goalType === 'custom' ? 'block' : 'none'

    const customLbl = document.createElement('label')
    customLbl.className = 'builder-field-label'
    customLbl.textContent = 'Descreva o objetivo'

    const customInput = document.createElement('textarea')
    customInput.className = 'inspector-textarea'
    customInput.rows = 3
    customInput.placeholder = 'Ex: Refatorar funções longas seguindo o princípio SRP'
    customInput.value = this.state.customGoal
    customInput.addEventListener('input', () => { this.state.customGoal = customInput.value })

    customWrap.appendChild(customLbl)
    customWrap.appendChild(customInput)
    el.appendChild(customWrap)
  }

  // ── Step 4: Skills ──────────────────────────────────────────────────────────

  private renderStep4(el: HTMLElement): void {
    this.addStepHeading(el, 'O que este agente pode fazer?', 'Selecione as ações que ele terá permissão de executar.')

    // Pre-fill from goal if still at default
    const defaultSkills = GOAL_DEFAULT_SKILLS[this.state.goalType] ?? ['read-file']
    if (this.state.skills.length === 1 && this.state.skills[0] === 'read-file') {
      this.state.skills = [...defaultSkills]
    }

    ALL_SKILLS.forEach(skill => {
      const row = document.createElement('label')
      row.className = 'inspector-skill-row builder-skill-row'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.value = skill.id
      checkbox.checked = this.state.skills.includes(skill.id)
      checkbox.className = 'inspector-checkbox'
      checkbox.addEventListener('change', () => {
        this.state.skills = checkbox.checked
          ? [...this.state.skills, skill.id]
          : this.state.skills.filter(s => s !== skill.id)
      })

      const textWrap = document.createElement('div')
      textWrap.className = 'builder-skill-text'

      const labelSpan = document.createElement('span')
      labelSpan.className = 'builder-skill-label'
      labelSpan.textContent = skill.label

      const descSpan = document.createElement('span')
      descSpan.className = 'builder-skill-desc'
      descSpan.textContent = skill.detail

      textWrap.appendChild(labelSpan)
      textWrap.appendChild(descSpan)
      row.appendChild(checkbox)
      row.appendChild(textWrap)
      el.appendChild(row)
    })
  }

  // ── Step 5: Confirmation ────────────────────────────────────────────────────

  private renderStep5(el: HTMLElement): void {
    if (this.promptLoading) {
      const loading = document.createElement('div')
      loading.className = 'builder-loading'

      const spinner = document.createElement('div')
      spinner.className = 'progress-spinner'

      const msg = document.createElement('p')
      msg.textContent = 'Copilot está gerando o prompt para o agente...'

      loading.appendChild(spinner)
      loading.appendChild(msg)
      el.appendChild(loading)
      return
    }

    this.addStepHeading(el, 'Confirme seu agente', 'Você pode ajustar o nome e as instruções antes de criar.')

    // Emoji + Name row
    const nameRow = document.createElement('div')
    nameRow.className = 'builder-name-row'

    const emojiInput = document.createElement('input')
    emojiInput.type = 'text'
    emojiInput.className = 'builder-emoji-input'
    emojiInput.value = this.state.emoji
    emojiInput.maxLength = 2
    emojiInput.title = 'Emoji do agente'
    emojiInput.addEventListener('input', () => { this.state.emoji = emojiInput.value })

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.className = 'inspector-input builder-name-input'
    nameInput.value = this.state.name
    nameInput.placeholder = 'Nome do agente'
    nameInput.addEventListener('input', () => { this.state.name = nameInput.value })

    nameRow.appendChild(emojiInput)
    nameRow.appendChild(nameInput)
    el.appendChild(nameRow)

    // Summary chips
    const chips = document.createElement('div')
    chips.className = 'builder-chips'
    const triggerLabel = TRIGGER_OPTIONS.find(t => t.value === this.state.trigger)?.label ?? this.state.trigger
    const goalLabel    = GOAL_OPTIONS.find(g => g.value === this.state.goalType)?.label ?? this.state.goalType
    const ctxLabel     = this.state.flowLabel ? `📦 ${this.state.flowLabel}` : '📁 Contexto personalizado'
    ;[triggerLabel, goalLabel, ctxLabel].forEach(text => {
      const chip = document.createElement('span')
      chip.className = 'builder-chip'
      chip.textContent = text
      chips.appendChild(chip)
    })
    el.appendChild(chips)

    // Summary card
    const summary = document.createElement('div')
    summary.className = 'builder-summary-card'

    const summaryRows: Array<{ icon: string; label: string; value: string }> = [
      {
        icon: '⚡',
        label: 'Disparo',
        value: TRIGGER_OPTIONS.find(t => t.value === this.state.trigger)?.label ?? this.state.trigger,
      },
      {
        icon: '🎯',
        label: 'Objetivo',
        value: GOAL_OPTIONS.find(g => g.value === this.state.goalType)?.label ?? this.state.goalType,
      },
      {
        icon: '📦',
        label: 'Contexto',
        value: this.state.flowLabel
          ? `Fluxo: ${this.state.flowLabel}`
          : this.state.customContext || 'Todo o projeto',
      },
      {
        icon: '🔧',
        label: 'Ações',
        value: this.state.skills.length
          ? this.state.skills.map(s => ALL_SKILLS.find(a => a.id === s)?.label ?? s).join(' · ')
          : 'Nenhuma ação selecionada',
      },
    ]

    summaryRows.forEach(row => {
      const rowEl = document.createElement('div')
      rowEl.className = 'builder-summary-row'

      const iconEl = document.createElement('span')
      iconEl.className = 'builder-summary-icon'
      iconEl.textContent = row.icon

      const labelEl = document.createElement('span')
      labelEl.className = 'builder-summary-label'
      labelEl.textContent = row.label + ':'

      const valueEl = document.createElement('span')
      valueEl.className = 'builder-summary-value'
      valueEl.textContent = row.value

      rowEl.appendChild(iconEl)
      rowEl.appendChild(labelEl)
      rowEl.appendChild(valueEl)
      summary.appendChild(rowEl)
    })

    el.appendChild(summary)

    // Prompt editor
    const promptLbl = document.createElement('div')
    promptLbl.className = 'inspector-label'
    promptLbl.textContent = 'Instruções para o agente'

    const promptArea = document.createElement('textarea')
    promptArea.className = 'inspector-textarea'
    promptArea.id = 'builder-prompt-area'
    promptArea.rows = 7
    promptArea.value = this.state.prompt
    promptArea.placeholder = 'O Copilot gerou um prompt baseado nas suas escolhas...'
    promptArea.addEventListener('input', () => { this.state.prompt = promptArea.value })

    el.appendChild(promptLbl)
    el.appendChild(promptArea)
  }

  // ── Footer ──────────────────────────────────────────────────────────────────

  private buildFooter(): HTMLElement {
    const footer = document.createElement('div')
    footer.className = 'builder-footer'

    if (this.step > 1) {
      const back = document.createElement('button')
      back.className = 'btn btn-secondary'
      back.textContent = '← Voltar'
      back.addEventListener('click', () => {
        this.step--
        this.render()
      })
      footer.appendChild(back)
    } else {
      footer.appendChild(document.createElement('div'))  // spacer
    }

    if (this.step < TOTAL_STEPS) {
      const next = document.createElement('button')
      const isLastBeforeConfirm = this.step === TOTAL_STEPS - 1
      next.className = 'btn btn-primary'
      next.textContent = isLastBeforeConfirm ? '✨ Gerar com Copilot →' : 'Próximo →'
      next.addEventListener('click', () => {
        this.step++
        if (isLastBeforeConfirm) {
          this.promptLoading = true
          this.render()
          bridge.send('BUILDER_NEXT', { step: this.step, values: this.collectState() })
        } else {
          this.render()
        }
      })
      footer.appendChild(next)
    } else {
      const create = document.createElement('button')
      create.className = 'btn btn-primary'
      create.textContent = '✓ Criar Agente'
      create.disabled = this.promptLoading
      create.addEventListener('click', () => {
        bridge.send('CREATE_AGENT_FROM_BUILDER', { state: this.collectState() })
        this.close()
      })
      footer.appendChild(create)
    }

    return footer
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private addStepHeading(el: HTMLElement, title: string, subtitle: string): void {
    const h3 = document.createElement('h3')
    h3.className = 'builder-step-title'
    h3.textContent = title

    const p = document.createElement('p')
    p.className = 'builder-step-desc'
    p.textContent = subtitle

    el.appendChild(h3)
    el.appendChild(p)
  }

  private makeOptionCard(
    name: string,
    value: string,
    label: string,
    detail: string,
    checked: boolean,
    onChange: (v: string) => void
  ): HTMLElement {
    const card = document.createElement('label')
    card.className = `builder-option-card${checked ? ' builder-option-card--selected' : ''}`

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = name
    radio.value = value
    radio.checked = checked
    radio.className = 'builder-radio'
    radio.addEventListener('change', () => {
      this.container.querySelectorAll<HTMLElement>(`.builder-option-card`).forEach(c => {
        if (c.querySelector(`input[name="${name}"]`)) {
          c.classList.remove('builder-option-card--selected')
        }
      })
      card.classList.add('builder-option-card--selected')
      onChange(value)
    })

    const labelDiv = document.createElement('div')
    labelDiv.className = 'builder-option-label'
    labelDiv.textContent = label

    const detailDiv = document.createElement('div')
    detailDiv.className = 'builder-option-detail'
    detailDiv.textContent = detail

    card.appendChild(radio)
    card.appendChild(labelDiv)
    card.appendChild(detailDiv)
    return card
  }

  private collectState(): Record<string, unknown> {
    return {
      flowDomain:    this.state.flowDomain,
      flowLabel:     this.state.flowLabel,
      flowFunctions: this.state.flowFunctions,
      trigger:       this.state.trigger,
      triggerPattern: this.state.triggerPattern,
      customContext: this.state.customContext,
      goalType:      this.state.goalType,
      customGoal:    this.state.customGoal,
      skills:        [...this.state.skills],
      name:          this.state.name,
      emoji:         this.state.emoji,
      description:   this.state.description,
      prompt:        this.state.prompt,
    }
  }
}
