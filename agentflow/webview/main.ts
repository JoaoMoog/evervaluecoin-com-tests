import { bridge } from './bridge'
import { CanvasRenderer, CanvasNodeData, CanvasEdgeData } from './canvas/renderer'
import { InspectorPanel } from './inspector/panel'
import { BuilderWizard } from './builder/wizard'

// ── Persisted UI state ───────────────────────────────────────────────────────

interface UIState {
  tutorialStep: number          // 0 = completed or skipped
  hasCompletedTutorial: boolean
  hasScannedOnce: boolean
  hasActivatedFirst: boolean
}

function loadState(): UIState {
  const saved = bridge.getState() as Partial<UIState> | null
  return {
    tutorialStep: saved?.tutorialStep ?? 1,
    hasCompletedTutorial: saved?.hasCompletedTutorial ?? false,
    hasScannedOnce: saved?.hasScannedOnce ?? false,
    hasActivatedFirst: saved?.hasActivatedFirst ?? false,
  }
}

function saveState(patch: Partial<UIState>): void {
  bridge.setState({ ...state, ...patch })
  Object.assign(state, patch)
}

const state = loadState()

// ── DOM Setup ─────────────────────────────────────────────────────────────────

const root = document.getElementById('root')!
root.innerHTML = `
  <div id="topbar">
    <span class="logo">⚡ AgentFlow</span>
    <div class="topbar-actions">
      <button id="btn-new-agent" class="btn btn-ghost" title="Criar agente manualmente">+ Agente</button>
      <button id="btn-scan" class="btn btn-primary">🔍 Analisar projeto</button>
      <button id="btn-help" class="btn btn-ghost" title="O que é um agente?">?</button>
      <button id="btn-run-all" class="btn btn-secondary">▷ Executar todos</button>
    </div>
  </div>
  <div id="main-layout">
    <div id="canvas-container">
      <!-- Canvas legend -->
      <div id="canvas-legend">
        <div class="legend-title">Legenda</div>
        <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>Agente</div>
        <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div>Função</div>
        <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>Área do projeto</div>
        <div class="legend-item"><div class="legend-dot" style="background:#06b6d4"></div>Rota API</div>
        <div class="legend-item"><div class="legend-dot" style="background:#a855f7"></div>Ferramenta</div>
      </div>
      <!-- Canvas controls -->
      <div id="canvas-controls">
        <button class="canvas-ctrl-btn" id="btn-zoom-in" title="Aproximar">+</button>
        <button class="canvas-ctrl-btn" id="btn-zoom-out" title="Afastar">−</button>
        <button class="canvas-ctrl-btn" id="btn-zoom-fit" title="Encaixar tudo">⊡</button>
      </div>
      <!-- Canvas empty state -->
      <div id="canvas-empty">
        <div class="canvas-empty-card">
          <div class="canvas-empty-icon">⚡</div>
          <div class="canvas-empty-title">Bem-vindo ao AgentFlow</div>
          <div class="canvas-empty-desc">Analise seu projeto para detectar padrões de código e receber sugestões de agentes de IA personalizados para o seu repositório.</div>
          <div class="canvas-empty-steps">
            <div class="canvas-empty-step">
              <div class="canvas-empty-step-num">1</div>
              <div class="canvas-empty-step-text">Analise seu projeto<span>Clique em "Analisar projeto" para começar</span></div>
            </div>
            <div class="canvas-empty-step">
              <div class="canvas-empty-step-num">2</div>
              <div class="canvas-empty-step-text">Escolha um agente<span>O Copilot vai sugerir agentes para seu código</span></div>
            </div>
            <div class="canvas-empty-step">
              <div class="canvas-empty-step-num">3</div>
              <div class="canvas-empty-step-text">Ative e veja acontecer<span>O agente trabalha automaticamente enquanto você coda</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="inspector-panel" style="display:none"></div>
    <div id="builder-panel" style="display:none"></div>
  </div>
  <div id="log-panel">
    <div class="log-tabs-bar" id="log-tabs">
      <div class="log-tab log-tab--active" data-pane="system" id="tab-system">Atividade</div>
      <div class="log-tab-actions">
        <button id="btn-clear-log" class="btn-icon" title="Limpar">✕</button>
      </div>
    </div>
    <div class="log-pane log-pane--active" id="pane-system"></div>
  </div>

  <!-- Tutorial overlay -->
  <div id="overlay-tutorial" style="display:none">
    <div class="tutorial-card">
      <div class="tutorial-step-indicator">
        Passo <span id="tut-step">1</span> de <span id="tut-total">3</span>
      </div>
      <div class="tutorial-icon" id="tut-icon">⚡</div>
      <h2 id="tut-title"></h2>
      <p id="tut-body"></p>
      <div class="tutorial-actions">
        <button id="btn-tut-action" class="btn btn-primary btn-large"></button>
        <button id="btn-tut-skip" class="btn-link">Pular tutorial</button>
      </div>
      <div class="tutorial-dots" id="tut-dots"></div>
    </div>
  </div>

  <!-- Scan progress overlay -->
  <div id="overlay-progress" style="display:none">
    <div class="overlay-content">
      <div class="progress-spinner"></div>
      <div id="progress-step">Iniciando...</div>
      <div id="progress-bar-wrap"><div id="progress-bar"></div></div>
      <div id="progress-stages">
        <div class="progress-stage" data-stage="scan">
          <div class="stage-dot"></div><span>Analisando projeto</span>
        </div>
        <div class="progress-stage" data-stage="copilot">
          <div class="stage-dot"></div><span>Consultando Copilot</span>
        </div>
        <div class="progress-stage" data-stage="canvas">
          <div class="stage-dot"></div><span>Montando o canvas</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast container -->
  <div id="toast-container"></div>

  <!-- Result spotlight (first run) -->
  <div id="overlay-result" style="display:none">
    <div class="result-card">
      <div class="result-icon" id="result-icon">✓</div>
      <h3 id="result-title">Agente executado!</h3>
      <p id="result-summary"></p>
      <div id="result-files"></div>
      <div class="result-actions">
        <button id="btn-result-close" class="btn btn-primary">Ótimo!</button>
        <button id="btn-result-log" class="btn btn-secondary">Ver log completo</button>
      </div>
    </div>
  </div>

  <!-- Delete confirmation modal -->
  <div id="modal-delete" style="display:none">
    <div class="modal-card">
      <div class="modal-icon">🗑</div>
      <div class="modal-title" id="modal-delete-title">Remover agente?</div>
      <div class="modal-body" id="modal-delete-body">Este agente será removido e não poderá mais executar automaticamente.</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="btn-modal-cancel">Cancelar</button>
        <button class="btn btn-danger" id="btn-modal-confirm">Remover</button>
      </div>
    </div>
  </div>

  <!-- Help panel -->
  <div id="help-panel">
    <div class="help-header">
      <span class="help-header-title">? O que é um Agente?</span>
      <button class="inspector-close" id="btn-help-close">✕</button>
    </div>
    <div class="help-content">
      <div class="help-card">
        <div class="help-card-icon">🤖</div>
        <div class="help-card-title">O que é um agente de IA?</div>
        <div class="help-card-body">Um agente é um assistente de IA programado para uma tarefa específica no seu projeto. Ele lê seu código, pensa sobre ele e pode gerar testes, documentação, revisões ou melhorias — automaticamente.</div>
      </div>
      <div class="help-card">
        <div class="help-card-icon">⚡</div>
        <div class="help-card-title">Quando ele executa?</div>
        <div class="help-card-body">Você escolhe: manualmente quando quiser, toda vez que salvar um arquivo, ou quando abrir o projeto. O agente só faz o que você autorizou.</div>
      </div>
      <div class="help-card">
        <div class="help-card-icon">🛠</div>
        <div class="help-card-title">O que o agente pode fazer?</div>
        <div class="help-card-body">Apenas o que você permitir. Você escolhe se ele pode ler arquivos, criar arquivos novos, rodar comandos de teste, buscar no código ou enviar notificações.</div>
        <div class="help-card-example">📂 Ler arquivo → lê o código para ter contexto
✍️ Escrever → cria ou edita arquivos com sugestões
▷ Comandos → roda "npm test" depois de gerar código
🔔 Notificar → avisa quando terminar</div>
      </div>
      <div class="help-card">
        <div class="help-card-icon">💡</div>
        <div class="help-card-title">Exemplos práticos</div>
        <div class="help-card-body">O que outros times usam agentes para fazer:</div>
        <div class="help-card-example">• Gerar testes para funções novas ao salvar
• Documentar rotas da API toda semana
• Revisar segurança antes de cada commit
• Criar JSDoc para funções sem documentação</div>
      </div>
    </div>
  </div>
`

// ── Module Instances ──────────────────────────────────────────────────────────

const canvasEl = document.getElementById('canvas-container')!
const inspectorEl = document.getElementById('inspector-panel')!
const builderEl = document.getElementById('builder-panel')!

const renderer = new CanvasRenderer(canvasEl)
const inspector = new InspectorPanel(inspectorEl)
const builder = new BuilderWizard(builderEl)

const logTabsEl = document.getElementById('log-tabs')!
const paneSystem = document.getElementById('pane-system')!
// Map from agentId to pane element
const logPanes = new Map<string, { tab: HTMLElement; pane: HTMLElement; statusBadge: HTMLElement }>()

renderer.setNodeClickHandler(node => {
  inspector.show(node)
  // Advance tutorial to step 3 when user clicks an agent node
  if (node.type === 'agent' && state.tutorialStep === 2 && !state.hasCompletedTutorial) {
    bridge.send('TUTORIAL_ADVANCE', { step: 2 })
    saveState({ tutorialStep: 3 })
    showTutorialStep({
      step: 3,
      total: 3,
      title: 'Ative seu primeiro agente',
      body: 'Role o painel direito até o botão "Ativar Agente". Ajuste o prompt se quiser — ou deixe como está. Um clique e ele começa a funcionar.',
      actionLabel: 'Entendi',
      spotlightNodeType: 'agent',
    })
  }
})

// ── Tutorial ──────────────────────────────────────────────────────────────────

const TUTORIAL_ICONS: Record<number, string> = { 1: '🔍', 2: '🎯', 3: '🚀' }

function showTutorialStep(step: { step: number; total: number; title: string; body: string; actionLabel: string; spotlightNodeType?: string }): void {
  const overlay = document.getElementById('overlay-tutorial')!
  overlay.style.display = 'flex'

  ;(document.getElementById('tut-step') as HTMLSpanElement).textContent = String(step.step)
  ;(document.getElementById('tut-total') as HTMLSpanElement).textContent = String(step.total)
  ;(document.getElementById('tut-icon') as HTMLDivElement).textContent = TUTORIAL_ICONS[step.step] ?? '⚡'
  ;(document.getElementById('tut-title') as HTMLHeadingElement).textContent = step.title
  ;(document.getElementById('tut-body') as HTMLParagraphElement).textContent = step.body
  ;(document.getElementById('btn-tut-action') as HTMLButtonElement).textContent = step.actionLabel

  // Dots
  const dots = document.getElementById('tut-dots')!
  dots.innerHTML = ''
  for (let i = 1; i <= step.total; i++) {
    const dot = document.createElement('div')
    dot.className = `tut-dot${i === step.step ? ' tut-dot--active' : ''}`
    dots.appendChild(dot)
  }
}

function hideTutorial(): void {
  const overlay = document.getElementById('overlay-tutorial')!
  overlay.style.display = 'none'
  saveState({ hasCompletedTutorial: true, tutorialStep: 0 })
}

document.getElementById('btn-tut-action')!.addEventListener('click', () => {
  const step = state.tutorialStep
  if (step === 1) {
    hideTutorial()
    bridge.send('TUTORIAL_ADVANCE', { step: 1 })  // triggers scan
  } else if (step === 2) {
    hideTutorial()
  } else {
    hideTutorial()  // step 3: user will click in inspector
  }
})

document.getElementById('btn-tut-skip')!.addEventListener('click', () => {
  hideTutorial()
  bridge.send('TUTORIAL_SKIP')
})

// ── Progress overlay ──────────────────────────────────────────────────────────

let currentStage = ''

function showProgress(step: string, pct: number, stage?: string): void {
  const overlay = document.getElementById('overlay-progress')!
  overlay.style.display = 'flex'
  ;(document.getElementById('progress-step') as HTMLDivElement).textContent = step
  ;(document.getElementById('progress-bar') as HTMLDivElement).style.width = `${pct}%`

  if (stage && stage !== currentStage) {
    currentStage = stage
    document.querySelectorAll('.progress-stage').forEach(el => {
      const s = (el as HTMLElement).dataset.stage
      el.classList.toggle('stage--active', s === stage)
      el.classList.toggle('stage--done', s !== stage && isStageBeforeActive(s ?? '', stage))
    })
  }
}

function isStageBeforeActive(stage: string, active: string): boolean {
  const order = ['scan', 'copilot', 'canvas']
  return order.indexOf(stage) < order.indexOf(active)
}

function hideProgress(): void {
  const overlay = document.getElementById('overlay-progress')!
  overlay.style.display = 'none'
  currentStage = ''
  document.querySelectorAll('.progress-stage').forEach(el => {
    el.classList.remove('stage--active', 'stage--done')
  })
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(title: string, body: string, type: 'success' | 'info' | 'error' = 'success'): void {
  const container = document.getElementById('toast-container')!
  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '🎉' : type === 'error' ? '✗' : 'ℹ'}</span>
    <div class="toast-content">
      <strong>${title}</strong>
      <p>${body}</p>
    </div>
    <button class="toast-close">✕</button>
  `
  container.appendChild(toast)
  toast.querySelector('.toast-close')!.addEventListener('click', () => toast.remove())
  // Auto-dismiss after 5 seconds
  setTimeout(() => toast.classList.add('toast--hiding'), 4000)
  setTimeout(() => toast.remove(), 4500)
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function appendLog(text: string, cls = ''): void {
  const line = document.createElement('div')
  line.className = `log-line ${cls}`.trim()
  line.textContent = text
  paneSystem.appendChild(line)
  paneSystem.scrollTop = paneSystem.scrollHeight
}

function appendLogChunk(agentId: string, text: string): void {
  let entry = logPanes.get(agentId)
  if (!entry) {
    // Create tab
    const tab = document.createElement('div')
    tab.className = 'log-tab'
    tab.dataset.pane = agentId
    tab.innerHTML = `<span>${agentId.replace('agent-', '').split('-').slice(0, 2).join(' ')}</span>`
    tab.addEventListener('click', () => switchLogTab(agentId))

    // Create pane
    const pane = document.createElement('div')
    pane.className = 'log-pane'
    pane.id = `pane-${agentId}`

    const header = document.createElement('div')
    header.className = 'log-pane-header'
    const agentLabel = document.createElement('span')
    agentLabel.className = 'log-pane-agent'
    agentLabel.textContent = agentId.replace('agent-', '')
    const timeLabel = document.createElement('span')
    timeLabel.className = 'log-pane-time'
    timeLabel.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const badge = document.createElement('span')
    badge.className = 'log-status-badge log-status-badge--running'
    badge.textContent = 'executando'
    header.appendChild(agentLabel)
    header.appendChild(timeLabel)
    header.appendChild(badge)
    pane.appendChild(header)

    // Insert tab before the actions div
    const actionsDiv = logTabsEl.querySelector('.log-tab-actions')!
    logTabsEl.insertBefore(tab, actionsDiv)
    document.getElementById('log-panel')!.appendChild(pane)

    entry = { tab, pane, statusBadge: badge }
    logPanes.set(agentId, entry)
    switchLogTab(agentId)
  }

  const content = document.createElement('span')
  content.className = 'log-stream-content'
  content.textContent = text
  entry.pane.appendChild(content)
  entry.pane.scrollTop = entry.pane.scrollHeight
}

function switchLogTab(paneId: string): void {
  // Deactivate all
  document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('log-tab--active'))
  document.querySelectorAll('.log-pane').forEach(p => p.classList.remove('log-pane--active'))
  // Activate target
  const tab = logTabsEl.querySelector(`[data-pane="${paneId}"]`) as HTMLElement | null
  tab?.classList.add('log-tab--active')
  const pane = document.getElementById(`pane-${paneId}`) ?? paneSystem
  pane.classList.add('log-pane--active')
}

document.getElementById('tab-system')!.addEventListener('click', () => switchLogTab('system'))

// ── Empty state ───────────────────────────────────────────────────────────────

function updateEmptyState(hasNodes: boolean): void {
  const el = document.getElementById('canvas-empty')!
  el.style.display = hasNodes ? 'none' : 'flex'
}

// ── Delete modal ──────────────────────────────────────────────────────────────

let pendingDeleteId = ''
let pendingDeleteResolve: ((confirmed: boolean) => void) | null = null

function showDeleteModal(agentId: string, agentName: string): Promise<boolean> {
  pendingDeleteId = agentId
  const modal = document.getElementById('modal-delete')!
  ;(document.getElementById('modal-delete-title') as HTMLElement).textContent = `Remover "${agentName}"?`
  ;(document.getElementById('modal-delete-body') as HTMLElement).innerHTML =
    `O agente <strong>${agentName}</strong> será removido permanentemente e não executará mais automaticamente.`
  modal.style.display = 'flex'
  return new Promise(resolve => { pendingDeleteResolve = resolve })
}

;(window as Window & { showDeleteModal?: typeof showDeleteModal }).showDeleteModal = showDeleteModal

document.getElementById('btn-modal-cancel')!.addEventListener('click', () => {
  document.getElementById('modal-delete')!.style.display = 'none'
  pendingDeleteResolve?.(false)
  pendingDeleteResolve = null
})
document.getElementById('btn-modal-confirm')!.addEventListener('click', () => {
  document.getElementById('modal-delete')!.style.display = 'none'
  bridge.send('DELETE_AGENT', { id: pendingDeleteId })
  pendingDeleteResolve?.(true)
  pendingDeleteResolve = null
  showToast('Agente removido', 'O agente foi removido com sucesso.', 'info')
})

// ── Help panel ────────────────────────────────────────────────────────────────

document.getElementById('btn-help')!.addEventListener('click', () => {
  const panel = document.getElementById('help-panel')!
  panel.classList.toggle('help-panel--open')
})
document.getElementById('btn-help-close')!.addEventListener('click', () => {
  document.getElementById('help-panel')!.classList.remove('help-panel--open')
})

// ── Result spotlight ──────────────────────────────────────────────────────────

function showResultSpotlight(run: { agentId: string; status: string; output: string; filesModified: string[] }): void {
  const overlay = document.getElementById('overlay-result')!
  overlay.style.display = 'flex'

  const icon = document.getElementById('result-icon')!
  const title = document.getElementById('result-title')!
  const summary = document.getElementById('result-summary')!
  const filesEl = document.getElementById('result-files')!

  icon.textContent = run.status === 'success' ? '✓' : '✗'
  icon.className = `result-icon result-icon--${run.status}`
  title.textContent = run.status === 'success' ? 'Agente executado com sucesso!' : 'Agente encontrou um problema'

  // Show first 200 chars of output, cleaned
  const cleanOutput = run.output.replace(/```\w*\n?/g, '').trim()
  summary.textContent = cleanOutput.slice(0, 200) + (cleanOutput.length > 200 ? '…' : '')

  filesEl.innerHTML = ''
  if (run.filesModified.length > 0) {
    const label = document.createElement('div')
    label.className = 'result-files-label'
    label.textContent = `${run.filesModified.length} arquivo(s) modificado(s):`
    filesEl.appendChild(label)
    run.filesModified.forEach(f => {
      const chip = document.createElement('div')
      chip.className = 'result-file-chip'
      chip.textContent = f
      filesEl.appendChild(chip)
    })
  }
}

document.getElementById('btn-result-close')!.addEventListener('click', () => {
  const overlay = document.getElementById('overlay-result')!
  overlay.style.display = 'none'
})

document.getElementById('btn-result-log')!.addEventListener('click', () => {
  const overlay = document.getElementById('overlay-result')!
  overlay.style.display = 'none'
  paneSystem.scrollTop = paneSystem.scrollHeight
})

// ── Extension message handlers ────────────────────────────────────────────────

bridge.on('TUTORIAL_STEP', (payload) => {
  const p = payload as { step: number; total: number; title: string; body: string; actionLabel: string }
  if (state.hasCompletedTutorial) return
  saveState({ tutorialStep: p.step })
  showTutorialStep(p)
})

bridge.on('SCAN_PROGRESS', (payload) => {
  const p = payload as { step: string; pct: number; stage?: string }
  showProgress(p.step, p.pct, p.stage)
})

bridge.on('SCAN_COMPLETE', (payload) => {
  const p = payload as { nodes: CanvasNodeData[]; edges: CanvasEdgeData[] }
  saveState({ hasScannedOnce: true })
  hideProgress()
  renderer.setNodes(p.nodes, p.edges)
  updateEmptyState(p.nodes.length > 0)
  appendLog(`✓ Canvas atualizado — ${p.nodes.filter(n => n.type === 'agent').length} agentes encontrados`, 'log-success')
})

bridge.on('AGENT_SUGGESTED', (payload) => {
  const p = payload as { agents: unknown[] }
  appendLog(`💡 ${p.agents.length} agentes sugeridos pelo Copilot`, 'log-info')
})

bridge.on('AGENT_STATUS', (payload) => {
  const p = payload as { id: string; status: string }
  renderer.updateNodeStatus(p.id, p.status)

  if (p.status === 'idle' && !state.hasActivatedFirst) {
    saveState({ hasActivatedFirst: true })
    showToast('Agente ativado!', 'Seu primeiro agente está funcionando. Clique em "Testar agora" para ver o resultado.')
  }
})

bridge.on('RUN_CHUNK', (payload) => {
  const p = payload as { agentId: string; text: string }
  appendLogChunk(p.agentId, p.text)
})

bridge.on('RUN_COMPLETE', (payload) => {
  const p = payload as { run: { agentId: string; status: string; output: string; filesModified: string[] } }
  const { run } = p

  const status = run.status === 'success' ? '✓' : '✗'
  const files = run.filesModified.length ? ` — ${run.filesModified.join(', ')}` : ''
  appendLog(`${status} ${run.agentId} finalizado${files}`, `log-${run.status}`)

  // Show spotlight only for first-time run
  if (!state.hasActivatedFirst || run.filesModified.length > 0) {
    showResultSpotlight(run)
  }

  const entry = logPanes.get(run.agentId)
  if (entry) {
    entry.statusBadge.className = `log-status-badge log-status-badge--${run.status}`
    entry.statusBadge.textContent = run.status === 'success' ? 'concluído' : 'erro'
  }
})

bridge.on('INITIAL_STATE', (payload) => {
  const p = payload as { agents: unknown[]; hasAgents: boolean }
  updateEmptyState(p.hasAgents)
  if (!p.hasAgents && !state.hasCompletedTutorial) {
    // Tutorial will be shown via TUTORIAL_STEP from the extension
  }
})

bridge.on('PROMPT_SUGGESTED', (payload) => {
  const p = payload as { agentId: string; prompt: string }
  inspector.fillPrompt(p.agentId, p.prompt)
  showToast('Prompt sugerido!', 'O Copilot criou um prompt para este agente. Você pode editá-lo antes de ativar.', 'info')
})

bridge.on('BUILDER_STEP', (payload) => {
  const p = payload as { flowDomain?: string; flowLabel?: string; flowFunctions?: string[] }
  inspector.hide()
  builder.open(p)
})

bridge.on('BUILDER_PROMPT_READY', (payload) => {
  const p = payload as { prompt: string; name: string; emoji: string; description: string }
  builder.fillPrompt(p)
  showToast('Prompt gerado!', 'O Copilot criou um prompt personalizado para o seu agente.', 'info')
})

bridge.on('ERROR', (payload) => {
  const p = payload as { message: string }
  hideProgress()
  appendLog(`✗ ${p.message}`, 'log-error')
  showToast('Algo deu errado', p.message, 'error')
})

// ── Button handlers ───────────────────────────────────────────────────────────

document.getElementById('btn-new-agent')!.addEventListener('click', () => {
  inspector.hide()
  bridge.send('OPEN_BUILDER', {})
})

document.getElementById('btn-scan')!.addEventListener('click', () => {
  bridge.send('SCAN_REQUEST')
})

document.getElementById('btn-run-all')!.addEventListener('click', () => {
  bridge.send('RUN_AGENT', { id: '*', context: 'manual run all' })
})

document.getElementById('btn-clear-log')!.addEventListener('click', () => {
  paneSystem.innerHTML = ''
})

// ── Zoom controls ─────────────────────────────────────────────────────────────

document.getElementById('btn-zoom-in')!.addEventListener('click', () => renderer.zoomIn())
document.getElementById('btn-zoom-out')!.addEventListener('click', () => renderer.zoomOut())
document.getElementById('btn-zoom-fit')!.addEventListener('click', () => renderer.fitToScreen())

// ── Init ──────────────────────────────────────────────────────────────────────

bridge.send('REQUEST_STATE')
appendLog('AgentFlow pronto. Clique em "Analisar projeto" para começar.', 'log-info')
