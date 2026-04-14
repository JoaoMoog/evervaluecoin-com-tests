export type NodeType = 'function' | 'agent' | 'skill' | 'trigger' | 'route' | 'model'

export interface NodeStyle {
  fill: string
  stroke: string
  textColor: string
  width: number
  height: number
  borderRadius: number
  icon: string
}

export const NODE_STYLES: Record<NodeType, NodeStyle> = {
  function: {
    fill: '#1e2a3a',
    stroke: '#3b82f6',
    textColor: '#93c5fd',
    width: 160,
    height: 56,
    borderRadius: 8,
    icon: 'ƒ',
  },
  agent: {
    fill: '#1a2a1a',
    stroke: '#22c55e',
    textColor: '#86efac',
    width: 180,
    height: 68,
    borderRadius: 12,
    icon: '🤖',
  },
  skill: {
    fill: '#2a1a2a',
    stroke: '#a855f7',
    textColor: '#d8b4fe',
    width: 140,
    height: 48,
    borderRadius: 8,
    icon: '⚡',
  },
  trigger: {
    fill: '#2a1a1a',
    stroke: '#f59e0b',
    textColor: '#fcd34d',
    width: 140,
    height: 48,
    borderRadius: 8,
    icon: '⚡',
  },
  route: {
    fill: '#1a2020',
    stroke: '#06b6d4',
    textColor: '#67e8f9',
    width: 160,
    height: 52,
    borderRadius: 8,
    icon: '→',
  },
  model: {
    fill: '#20201a',
    stroke: '#eab308',
    textColor: '#fde047',
    width: 150,
    height: 52,
    borderRadius: 8,
    icon: '◈',
  },
}

export const STATUS_COLORS = {
  idle: '#22c55e',
  running: '#f59e0b',
  success: '#22c55e',
  error: '#ef4444',
  paused: '#6b7280',
}
