import { bridge } from './bridge'
import { CanvasRenderer, CanvasNodeData, CanvasEdgeData } from './canvas/renderer'
import { InspectorPanel } from './inspector/panel'

// ── DOM Setup ────────────────────────────────────────────────────────────────

const root = document.getElementById('root')!
root.innerHTML = `
  <div id="topbar">
    <span class="logo">⚡ AgentFlow</span>
    <div class="topbar-actions">
      <button id="btn-scan" class="btn btn-primary">Varrer repositório</button>
      <button id="btn-run-all" class="btn btn-secondary">▷ Executar todos</button>
    </div>
  </div>
  <div id="main-layout">
    <div id="canvas-container"></div>
    <div id="inspector-panel" style="display:none"></div>
  </div>
  <div id="log-panel">
    <div class="log-header">
      <span>Log de execuções</span>
      <button id="btn-clear-log" class="btn-icon">✕</button>
    </div>
    <div id="log-output"></div>
  </div>
  <div id="overlay-welcome" style="display:none">
    <div class="overlay-content">
      <div class="overlay-icon">⚡</div>
      <h1>AgentFlow</h1>
      <p>Agentes de IA para o seu repositório, powered by GitHub Copilot.</p>
      <button id="btn-first-scan" class="btn btn-primary btn-large">Varrer meu repositório</button>
    </div>
  </div>
  <div id="overlay-progress" style="display:none">
    <div class="overlay-content">
      <div class="progress-spinner"></div>
      <div id="progress-step">Iniciando...</div>
      <div id="progress-bar-wrap"><div id="progress-bar"></div></div>
    </div>
  </div>
`

// ── Module Instances ─────────────────────────────────────────────────────────

const canvasEl = document.getElementById('canvas-container')!
const inspectorEl = document.getElementById('inspector-panel')!
const logEl = document.getElementById('log-output')!

const renderer = new CanvasRenderer(canvasEl)
const inspector = new InspectorPanel(inspectorEl)

renderer.setNodeClickHandler(node => inspector.show(node))

// ── UI State ─────────────────────────────────────────────────────────────────

let hasScannedOnce = false

function showProgress(step: string, pct: number): void {
  const overlay = document.getElementById('overlay-progress')!
  overlay.style.display = 'flex'
  const progressStep = document.getElementById('progress-step')
  const progressBar = document.getElementById('progress-bar')
  if (progressStep) progressStep.textContent = step
  if (progressBar) progressBar.style.width = `${pct}%`
}

function hideProgress(): void {
  const overlay = document.getElementById('overlay-progress')!
  overlay.style.display = 'none'
}

function appendLog(text: string, cls = ''): void {
  const line = document.createElement('div')
  line.className = `log-line ${cls}`
  line.textContent = text
  logEl.appendChild(line)
  logEl.scrollTop = logEl.scrollHeight
}

function appendLogChunk(agentId: string, text: string): void {
  let stream = document.querySelector<HTMLElement>(`[data-stream="${agentId}"]`)
  if (!stream) {
    stream = document.createElement('div')
    stream.className = 'log-stream'
    stream.dataset.stream = agentId
    stream.innerHTML = `<span class="log-agent-id">[${agentId}]</span> `
    logEl.appendChild(stream)
  }
  stream.textContent += text
  logEl.scrollTop = logEl.scrollHeight
}

// ── Extension Message Handlers ───────────────────────────────────────────────

bridge.on('SCAN_PROGRESS', (payload) => {
  const p = payload as { step: string; pct: number }
  showProgress(p.step, p.pct)
})

bridge.on('SCAN_COMPLETE', (payload) => {
  const p = payload as { nodes: CanvasNodeData[]; edges: CanvasEdgeData[] }
  hasScannedOnce = true
  hideProgress()
  hideWelcome()
  renderer.setNodes(p.nodes, p.edges)
  appendLog('✓ Canvas atualizado com o contexto do repositório', 'log-success')
})

bridge.on('AGENT_SUGGESTED', (payload) => {
  const p = payload as { agents: unknown[] }
  appendLog(`💡 ${p.agents.length} agentes sugeridos pelo Copilot`, 'log-info')
})

bridge.on('AGENT_STATUS', (payload) => {
  const p = payload as { id: string; status: string }
  renderer.updateNodeStatus(p.id, p.status)
  appendLog(`Agente ${p.id}: ${p.status}`, `log-${p.status}`)
})

bridge.on('RUN_CHUNK', (payload) => {
  const p = payload as { agentId: string; text: string }
  appendLogChunk(p.agentId, p.text)
})

bridge.on('RUN_COMPLETE', (payload) => {
  const p = payload as { run: { agentId: string; status: string; filesModified: string[] } }
  const { run } = p
  const status = run.status === 'success' ? '✓' : '✗'
  const files = run.filesModified.length ? ` — ${run.filesModified.join(', ')}` : ''
  appendLog(`${status} ${run.agentId} finalizado${files}`, `log-${run.status}`)
})

bridge.on('INITIAL_STATE', (payload) => {
  const p = payload as { agents: unknown[]; nodes: unknown[] }
  if (!p.agents.length && !hasScannedOnce) {
    showWelcome()
  }
})

bridge.on('ERROR', (payload) => {
  const p = payload as { message: string }
  hideProgress()
  appendLog(`✗ Erro: ${p.message}`, 'log-error')
})

// ── Button Handlers ───────────────────────────────────────────────────────────

document.getElementById('btn-scan')!.addEventListener('click', () => {
  bridge.send('SCAN_REQUEST')
})

document.getElementById('btn-run-all')!.addEventListener('click', () => {
  bridge.send('RUN_AGENT', { id: '*', context: 'manual run all' })
})

document.getElementById('btn-first-scan')!.addEventListener('click', () => {
  hideWelcome()
  bridge.send('SCAN_REQUEST')
})

document.getElementById('btn-clear-log')!.addEventListener('click', () => {
  logEl.innerHTML = ''
})

// ── Welcome Overlay ───────────────────────────────────────────────────────────

function showWelcome(): void {
  const el = document.getElementById('overlay-welcome')
  if (el) el.style.display = 'flex'
}

function hideWelcome(): void {
  const el = document.getElementById('overlay-welcome')
  if (el) el.style.display = 'none'
}

// ── Init ─────────────────────────────────────────────────────────────────────

// Request initial state when webview loads
bridge.send('REQUEST_STATE')
appendLog('AgentFlow inicializado. Clique em "Varrer repositório" para começar.', 'log-info')
