import { NODE_STYLES, STATUS_COLORS, NodeType } from './nodeTypes'
import { computeEdgePath } from './edgeRouter'

export interface CanvasNodeData {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  emoji?: string
  x: number
  y: number
  data: Record<string, unknown>
}

export interface CanvasEdgeData {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

export interface CanvasNodeView extends CanvasNodeData {
  width: number
  height: number
  status?: string
}

export type NodeClickHandler = (node: CanvasNodeView) => void

export class CanvasRenderer {
  private svg: SVGSVGElement
  private mainGroup: SVGGElement
  private nodesGroup: SVGGElement
  private edgesGroup: SVGGElement
  private nodes: Map<string, CanvasNodeView> = new Map()
  private onNodeClick: NodeClickHandler | null = null
  private selectedNodeId: string | null = null
  private tooltip!: HTMLElement

  // Pan / zoom state
  private isPanning = false
  private panStart = { x: 0, y: 0 }
  private viewOffset = { x: 0, y: 0 }
  private scale = 1

  constructor(container: HTMLElement) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('width', '100%')
    this.svg.setAttribute('height', '100%')
    this.svg.style.cursor = 'grab'

    this.addDefs()
    this.addDotGrid()

    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    this.mainGroup.setAttribute('class', 'main-group')

    this.edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    this.edgesGroup.setAttribute('class', 'edges')
    this.nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    this.nodesGroup.setAttribute('class', 'nodes')

    this.mainGroup.appendChild(this.edgesGroup)
    this.mainGroup.appendChild(this.nodesGroup)
    this.svg.appendChild(this.mainGroup)
    container.appendChild(this.svg)

    this.setupPanning()

    this.tooltip = document.createElement('div')
    this.tooltip.id = 'node-tooltip'
    document.body.appendChild(this.tooltip)
  }

  setNodes(nodeData: CanvasNodeData[], edgeData: CanvasEdgeData[]): void {
    this.nodes.clear()
    this.nodesGroup.innerHTML = ''
    this.edgesGroup.innerHTML = ''

    nodeData.forEach(nd => {
      const style = NODE_STYLES[nd.type]
      const view: CanvasNodeView = { ...nd, width: style.width, height: style.height }
      this.nodes.set(nd.id, view)
    })

    edgeData.forEach(edge => this.drawEdge(edge))

    // Draw nodes with staggered entrance animation
    let index = 0
    this.nodes.forEach(node => {
      this.drawNode(node, index)
      index++
    })
  }

  updateNodeStatus(nodeId: string, status: string): void {
    // Try exact ID first, then with agent- prefix
    const node = this.nodes.get(`agent-${nodeId}`) ?? this.nodes.get(nodeId)
    if (!node) return
    node.status = status

    const el = this.svg.querySelector(`[data-id="${node.id}"] .node-rect`) as SVGRectElement | null
    if (el) {
      el.setAttribute('stroke', STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#6b7280')
      if (status === 'running') {
        el.classList.add('node-rect--running')
      } else {
        el.classList.remove('node-rect--running')
      }
    }

    const dot = this.svg.querySelector(`[data-id="${node.id}"] .status-dot`) as SVGCircleElement | null
    if (dot) {
      dot.setAttribute('fill', STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#6b7280')
      dot.classList.toggle('status-dot--running', status === 'running')
    }

    const statusTextEl = this.svg.querySelector(`[data-id="${node.id}"] [data-status-text]`) as SVGTextElement | null
    if (statusTextEl) {
      const STATUS_LABELS: Record<string, {text: string; color: string}> = {
        idle:    { text: '● Pronto',       color: '#22c55e' },
        running: { text: '⏳ Executando…', color: '#f59e0b' },
        success: { text: '✓ Concluído',    color: '#22c55e' },
        error:   { text: '✗ Erro',         color: '#ef4444' },
        paused:  { text: '⏸ Pausado',      color: '#6b7280' },
      }
      const s = STATUS_LABELS[status] ?? STATUS_LABELS.idle
      statusTextEl.textContent = s.text
      statusTextEl.setAttribute('fill', s.color)
    }

    if (status === 'success') {
      this.showCompletionMark(node.id)
    }
  }

  setNodeClickHandler(fn: NodeClickHandler): void {
    this.onNodeClick = fn
  }

  zoomIn(): void {
    this.scale = Math.min(2, this.scale + 0.15)
    this.applyTransform()
  }

  zoomOut(): void {
    this.scale = Math.max(0.3, this.scale - 0.15)
    this.applyTransform()
  }

  fitToScreen(): void {
    if (this.nodes.size === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    })
    const padding = 40
    const svgW = this.svg.clientWidth  || 800
    const svgH = this.svg.clientHeight || 600
    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2
    this.scale = Math.min(1, Math.min(svgW / contentW, svgH / contentH))
    this.viewOffset = {
      x: (svgW - contentW * this.scale) / 2 - (minX - padding) * this.scale,
      y: (svgH - contentH * this.scale) / 2 - (minY - padding) * this.scale,
    }
    this.applyTransform()
  }

  private applyTransform(): void {
    this.mainGroup.setAttribute(
      'transform',
      `translate(${this.viewOffset.x}, ${this.viewOffset.y}) scale(${this.scale})`
    )
  }

  // Spotlight: dim everything except nodes of the given type
  spotlight(nodeType: NodeType | undefined): void {
    const dimEl = this.svg.querySelector('.spotlight-dim') as SVGRectElement | null
    if (!nodeType) {
      dimEl?.remove()
      return
    }
    if (!dimEl) {
      const dim = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      dim.setAttribute('class', 'spotlight-dim')
      dim.setAttribute('width', '100%')
      dim.setAttribute('height', '100%')
      dim.setAttribute('fill', 'rgba(0,0,0,0.55)')
      dim.style.pointerEvents = 'none'
      this.mainGroup.insertBefore(dim, this.nodesGroup)
    }
  }

  private drawNode(node: CanvasNodeView, index: number): void {
    const style = NODE_STYLES[node.type]
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('data-id', node.id)
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`)
    g.style.cursor = 'pointer'

    // Entrance animation via CSS class + delay
    g.classList.add('node-enter')
    g.style.animationDelay = `${index * 55}ms`

    // Background rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('class', 'node-rect')
    rect.setAttribute('width', String(node.width))
    rect.setAttribute('height', String(node.height))
    rect.setAttribute('rx', String(style.borderRadius))
    rect.setAttribute('fill', style.fill)
    rect.setAttribute('stroke', style.stroke)
    rect.setAttribute('stroke-width', '1.5')
    g.appendChild(rect)

    // Emoji / icon
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    iconText.setAttribute('x', '12')
    iconText.setAttribute('y', String(node.height / 2 + 5))
    iconText.setAttribute('font-size', '16')
    iconText.textContent = node.emoji ?? style.icon
    g.appendChild(iconText)

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', '36')
    label.setAttribute('y', String(node.height / 2 - (node.sublabel ? 4 : -4)))
    label.setAttribute('fill', style.textColor)
    label.setAttribute('font-size', '12')
    label.setAttribute('font-weight', '600')
    label.setAttribute('font-family', 'var(--vscode-font-family, monospace)')
    label.textContent = truncate(node.label, 18)
    g.appendChild(label)

    // Sublabel
    if (node.sublabel) {
      const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      sub.setAttribute('x', '36')
      sub.setAttribute('y', String(node.height / 2 + 10))
      sub.setAttribute('fill', '#6b7280')
      sub.setAttribute('font-size', '9')
      sub.setAttribute('font-family', 'var(--vscode-font-family, monospace)')
      sub.textContent = truncate(node.sublabel, 24)
      g.appendChild(sub)
    }

    // Status dot for agents
    if (node.type === 'agent') {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('class', 'status-dot')
      dot.setAttribute('cx', String(node.width - 10))
      dot.setAttribute('cy', '10')
      dot.setAttribute('r', '5')
      dot.setAttribute('fill', STATUS_COLORS.idle)
      g.appendChild(dot)

      const statusText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      statusText.setAttribute('class', 'agent-status-text')
      statusText.setAttribute('data-status-text', 'true')
      statusText.setAttribute('x', String(node.width / 2))
      statusText.setAttribute('y', String(node.height + 12))
      statusText.setAttribute('text-anchor', 'middle')
      statusText.setAttribute('fill', '#6b7280')
      statusText.setAttribute('font-size', '9')
      statusText.textContent = '● Pronto'
      g.appendChild(statusText)
    }

    g.addEventListener('click', () => {
      this.selectNode(node.id)
      this.onNodeClick?.(node)
    })
    g.addEventListener('mouseenter', (e: MouseEvent) => {
      const tip = this.getTooltipText(node)
      if (!tip) return
      this.tooltip.textContent = tip
      this.tooltip.classList.add('visible')
      this.tooltip.style.left = `${e.clientX + 14}px`
      this.tooltip.style.top  = `${e.clientY - 10}px`
    })
    g.addEventListener('mousemove', (e: MouseEvent) => {
      this.tooltip.style.left = `${e.clientX + 14}px`
      this.tooltip.style.top  = `${e.clientY - 10}px`
    })
    g.addEventListener('mouseleave', () => {
      this.tooltip.classList.remove('visible')
    })
    this.makeDraggable(g, node)
    this.nodesGroup.appendChild(g)
  }

  private selectNode(id: string): void {
    // Remove old selection
    if (this.selectedNodeId) {
      const old = this.svg.querySelector(`[data-id="${this.selectedNodeId}"]`)
      old?.classList.remove('node-selected')
    }
    this.selectedNodeId = id
    const el = this.svg.querySelector(`[data-id="${id}"]`)
    el?.classList.add('node-selected')
  }

  private getTooltipText(node: CanvasNodeView): string {
    const TIPS: Record<string, string> = {
      agent:    'Clique para configurar e ativar este agente',
      function: node.data && (node.data as Record<string,unknown>).hasTests === false
        ? 'Esta função não tem testes — clique para ver detalhes'
        : 'Clique para ver os detalhes desta função',
      trigger:  'Área do projeto detectada — clique para criar um agente especializado',
      route:    'Rota da API — clique para ver detalhes',
      model:    'Modelo de dados — clique para ver detalhes',
      skill:    'Ferramenta disponível para agentes',
    }
    return TIPS[node.type] ?? ''
  }

  private drawEdge(edge: CanvasEdgeData): void {
    const source = this.nodes.get(edge.sourceId)
    const target = this.nodes.get(edge.targetId)
    if (!source || !target) return

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', computeEdgePath(source, target))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', '#374151')
    path.setAttribute('stroke-width', '1.5')
    path.setAttribute('stroke-dasharray', '4 3')
    path.setAttribute('marker-end', 'url(#arrow)')
    this.edgesGroup.appendChild(path)
  }

  private showCompletionMark(nodeId: string): void {
    const g = this.svg.querySelector(`[data-id="${nodeId}"]`)
    const node = this.nodes.get(nodeId)
    if (!g || !node) return

    const existing = g.querySelector('.completion-check')
    existing?.remove()

    const check = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    check.setAttribute('class', 'completion-check')
    check.setAttribute('x', String(node.width / 2))
    check.setAttribute('y', String(node.height / 2 + 6))
    check.setAttribute('text-anchor', 'middle')
    check.setAttribute('fill', '#22c55e')
    check.setAttribute('font-size', '18')
    check.setAttribute('font-weight', 'bold')
    check.textContent = '✓'
    g.appendChild(check)
    setTimeout(() => check.remove(), 3000)
  }

  private addDefs(): void {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')

    // Arrow marker
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
    marker.setAttribute('id', 'arrow')
    marker.setAttribute('markerWidth', '8')
    marker.setAttribute('markerHeight', '8')
    marker.setAttribute('refX', '6')
    marker.setAttribute('refY', '3')
    marker.setAttribute('orient', 'auto')
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    arrowPath.setAttribute('d', 'M0,0 L0,6 L8,3 z')
    arrowPath.setAttribute('fill', '#374151')
    marker.appendChild(arrowPath)
    defs.appendChild(marker)

    this.svg.appendChild(defs)
  }

  private addDotGrid(): void {
    const defs = this.svg.querySelector('defs') ?? document.createElementNS('http://www.w3.org/2000/svg', 'defs')

    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
    pattern.setAttribute('id', 'dot-grid')
    pattern.setAttribute('x', '0')
    pattern.setAttribute('y', '0')
    pattern.setAttribute('width', '24')
    pattern.setAttribute('height', '24')
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot.setAttribute('cx', '1')
    dot.setAttribute('cy', '1')
    dot.setAttribute('r', '1')
    dot.setAttribute('fill', '#1f2937')
    pattern.appendChild(dot)
    defs.appendChild(pattern)

    if (!this.svg.querySelector('defs')) this.svg.appendChild(defs)

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', 'url(#dot-grid)')
    this.svg.appendChild(bg)
  }

  private setupPanning(): void {
    this.svg.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as SVGElement).closest('[data-id]')) return
      this.isPanning = true
      this.panStart = { x: e.clientX - this.viewOffset.x, y: e.clientY - this.viewOffset.y }
      this.svg.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isPanning) return
      this.viewOffset.x = e.clientX - this.panStart.x
      this.viewOffset.y = e.clientY - this.panStart.y
      this.applyTransform()
    })

    window.addEventListener('mouseup', () => {
      this.isPanning = false
      this.svg.style.cursor = 'grab'
    })

    this.svg.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      this.scale = Math.max(0.3, Math.min(2, this.scale - e.deltaY * 0.001))
      this.applyTransform()
    }, { passive: false })
  }

  private makeDraggable(el: SVGGElement, node: CanvasNodeView): void {
    let dragging = false
    let startMouse = { x: 0, y: 0 }
    let startPos = { x: node.x, y: node.y }

    el.addEventListener('mousedown', (e: MouseEvent) => {
      e.stopPropagation()
      dragging = true
      startMouse = { x: e.clientX, y: e.clientY }
      startPos = { x: node.x, y: node.y }
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return
      const dx = (e.clientX - startMouse.x) / this.scale
      const dy = (e.clientY - startMouse.y) / this.scale
      node.x = startPos.x + dx
      node.y = startPos.y + dy
      el.setAttribute('transform', `translate(${node.x}, ${node.y})`)
    })

    window.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false
        import('../bridge').then(({ bridge }) => {
          bridge.send('NODE_MOVED', { id: node.id, x: node.x, y: node.y })
        })
      }
    })
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
