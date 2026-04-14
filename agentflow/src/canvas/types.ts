import { AgentStatus } from '../runtime/types'

export type NodeType = 'function' | 'agent' | 'skill' | 'trigger' | 'route' | 'model'

export interface CanvasNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  emoji?: string
  x: number
  y: number
  data: Record<string, unknown>
}

export interface CanvasEdge {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

// Messages from Extension → Webview
export type ExtensionToWebview =
  | { type: 'SCAN_PROGRESS';   payload: { step: string; pct: number } }
  | { type: 'SCAN_COMPLETE';   payload: { nodes: CanvasNode[]; edges: CanvasEdge[] } }
  | { type: 'AGENT_SUGGESTED'; payload: { agents: import('../llm/parser').AgentSuggestion[] } }
  | { type: 'AGENT_STATUS';    payload: { id: string; status: AgentStatus } }
  | { type: 'RUN_CHUNK';       payload: { agentId: string; text: string } }
  | { type: 'RUN_COMPLETE';    payload: { run: import('../runtime/types').AgentRun } }
  | { type: 'INITIAL_STATE';   payload: { agents: import('../runtime/types').AgentDefinition[]; nodes: CanvasNode[] } }
  | { type: 'ERROR';           payload: { message: string } }

// Messages from Webview → Extension
export type WebviewToExtension =
  | { type: 'SCAN_REQUEST' }
  | { type: 'ACTIVATE_AGENT';   payload: import('../runtime/types').AgentDefinition }
  | { type: 'DEACTIVATE_AGENT'; payload: { id: string } }
  | { type: 'RUN_AGENT';        payload: { id: string; context: string } }
  | { type: 'SAVE_AGENT';       payload: import('../runtime/types').AgentDefinition }
  | { type: 'DELETE_AGENT';     payload: { id: string } }
  | { type: 'NODE_MOVED';       payload: { id: string; x: number; y: number } }
  | { type: 'REQUEST_STATE' }
