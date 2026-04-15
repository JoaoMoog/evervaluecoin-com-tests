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
      <button id="btn-scan" class="btn btn-primary">Varrer repositório</button>
      <button id="btn-run-all" class="btn btn-secondary">▷ Executar todos</button>
    </div>
  </div>
  <div id="main-layout">
    <div id="canvas-container"></div>
    <div id="inspector-panel" style="display:none"></div>
    <div id="builder-panel" style="display:none"></div>
  </div>
  <div id="log-panel">
    <div class="log-header">
      <span>Atividade</span>
      <button id="btn-clear-log" class="btn-icon" title="Limpar log">✕</button>
    </div>
    <div id="log-output"></div>
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
`

// ── Module Instances ──────────────────────────────────────────────────────────

const canvasEl = document.getElementById('canvas-container')!
const inspectorEl = document.getElementById('inspector-panel')!
const builderEl = document.getElementById('builder-panel')!
const logEl = document.getElementById('log-output')!

const renderer = new CanvasRenderer(canvasEl)
const inspector = new InspectorPanel(inspectorEl)
const builder = new BuilderWizard(builderEl)

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
  logEl.appendChild(line)
  logEl.scrollTop = logEl.scrollHeight
}

// Fixed: keep label span separate from streamed content
function appendLogChunk(agentId: string, text: string): void {
  let stream = document.querySelector<HTMLElement>(`[data-stream="${agentId}"]`)
  if (!stream) {
    stream = document.createElement('div')
    stream.className = 'log-stream'
    stream.dataset.stream = agentId

    const label = document.createElement('span')
    label.className = 'log-agent-id'
    label.textContent = `[${agentId}] `

    const content = document.createElement('span')
    content.className = 'log-stream-content'

    stream.appendChild(label)
    stream.appendChild(content)
    logEl.appendChild(stream)
  }

  const content = stream.querySelector<HTMLSpanElement>('.log-stream-content')!
  content.textContent += text
  logEl.scrollTop = logEl.scrollHeight
}

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
  logEl.scrollTop = logEl.scrollHeight
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
})

bridge.on('INITIAL_STATE', (payload) => {
  const p = payload as { agents: unknown[]; hasAgents: boolean }
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
  logEl.innerHTML = ''
})

// ── Init ──────────────────────────────────────────────────────────────────────

bridge.send('REQUEST_STATE')
appendLog('AgentFlow pronto. Clique em "Varrer repositório" para começar.', 'log-info')
