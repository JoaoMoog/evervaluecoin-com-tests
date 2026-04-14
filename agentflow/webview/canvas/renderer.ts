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
  private nodesGroup: SVGGElement
  private edgesGroup: SVGGElement
  private nodes: Map<string, CanvasNodeView> = new Map()
  private onNodeClick: NodeClickHandler | null = null

  // Pan state
  private isPanning = false
  private panStart = { x: 0, y: 0 }
  private viewOffset = { x: 0, y: 0 }
  private scale = 1

  constructor(container: HTMLElement) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('width', '100%')
    this.svg.setAttribute('height', '100%')
    this.svg.style.cursor = 'grab'

    // Dot grid background
    this.addDotGrid()

    this.edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    this.edgesGroup.setAttribute('class', 'edges')
    this.nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    this.nodesGroup.setAttribute('class', 'nodes')

    this.svg.appendChild(this.edgesGroup)
    this.svg.appendChild(this.nodesGroup)
    container.appendChild(this.svg)

    this.setupPanning()
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

    // Draw edges first (behind nodes)
    edgeData.forEach(edge => this.drawEdge(edge))

    // Draw nodes
    this.nodes.forEach(node => this.drawNode(node))
  }

  updateNodeStatus(nodeId: string, status: string): void {
    const node = this.nodes.get(`agent-${nodeId}`)
    if (!node) return
    node.status = status

    const el = this.svg.querySelector(`[data-id="${node.id}"] rect`) as SVGRectElement | null
    if (el) {
      el.setAttribute('stroke', STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#6b7280')
    }

    // Update status dot
    const dot = this.svg.querySelector(`[data-id="${node.id}"] .status-dot`) as SVGCircleElement | null
    if (dot) {
      dot.setAttribute('fill', STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#6b7280')
    }
  }

  setNodeClickHandler(fn: NodeClickHandler): void {
    this.onNodeClick = fn
  }

  private drawNode(node: CanvasNodeView): void {
    const style = NODE_STYLES[node.type]
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('data-id', node.id)
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`)
    g.style.cursor = 'pointer'

    // Background rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
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
    label.setAttribute('y', String(node.height / 2 - 4))
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
      sub.textContent = truncate(node.sublabel, 22)
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
    }

    // Click handler
    g.addEventListener('click', () => {
      this.onNodeClick?.(node)
    })

    // Drag support
    this.makeDraggable(g, node)

    this.nodesGroup.appendChild(g)
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

  private addDotGrid(): void {
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

    // Dot pattern
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

    this.svg.appendChild(defs)

    // Background rect using the dot pattern
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', 'url(#dot-grid)')
    this.svg.appendChild(bg)
  }

  private setupPanning(): void {
    let mainGroup: SVGGElement | null = null

    const getMainGroup = (): SVGGElement => {
      if (!mainGroup) {
        mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        mainGroup.setAttribute('class', 'main-group')
        this.svg.appendChild(mainGroup)
        mainGroup.appendChild(this.edgesGroup)
        mainGroup.appendChild(this.nodesGroup)
      }
      return mainGroup
    }

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
      getMainGroup().setAttribute(
        'transform',
        `translate(${this.viewOffset.x}, ${this.viewOffset.y}) scale(${this.scale})`
      )
    })

    window.addEventListener('mouseup', () => {
      this.isPanning = false
      this.svg.style.cursor = 'grab'
    })

    // Zoom with scroll
    this.svg.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      this.scale = Math.max(0.3, Math.min(2, this.scale - e.deltaY * 0.001))
      getMainGroup().setAttribute(
        'transform',
        `translate(${this.viewOffset.x}, ${this.viewOffset.y}) scale(${this.scale})`
      )
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
        // Notify extension of position change
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
