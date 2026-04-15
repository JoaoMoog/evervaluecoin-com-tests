import { AgentStatus } from '../runtime/types'

export type NodeType = 'function' | 'agent' | 'skill' | 'trigger' | 'route' | 'model'

// Agent Builder wizard — 5-step sidebar flow
export interface BuilderStep {
  step: number           // 1-5
  total: number          // 5
  title: string
  body: string
  fields: BuilderField[]
  // Pre-filled from a flow node click
  flowDomain?: string
  flowLabel?: string
  flowFunctions?: string[]
}

export interface BuilderField {
  key: string
  label: string
  type: 'select' | 'text' | 'textarea' | 'multiselect' | 'toggle'
  options?: string[]          // for select / multiselect
  placeholder?: string
  defaultValue?: string | boolean | string[]
}

export interface BuilderState {
  // Flow context (pre-filled from canvas flow node)
  flowDomain?: string
  flowLabel?: string
  flowFunctions?: string[]
  // Step 1
  trigger?: string
  triggerPattern?: string
  // Step 2
  customContext?: string
  // Step 3
  goalType?: string
  customGoal?: string
  // Step 4
  skills?: string[]
  // Step 5 (Confirmation)
  name?: string
  emoji?: string
  description?: string
  prompt?: string
}

export interface CanvasNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  emoji?: string
  x: number
  y: number
  data: object
}

export interface CanvasEdge {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

export interface TutorialStep {
  step: number
  total: number
  title: string
  body: string
  actionLabel: string    // text of the primary button
  spotlightNodeType?: NodeType  // if set, spotlight first node of this type
}

// Messages from Extension → Webview
export type ExtensionToWebview =
  | { type: 'SCAN_PROGRESS';        payload: { step: string; pct: number; stage?: 'scan' | 'copilot' | 'canvas' } }
  | { type: 'SCAN_COMPLETE';        payload: { nodes: CanvasNode[]; edges: CanvasEdge[] } }
  | { type: 'AGENT_SUGGESTED';      payload: { agents: import('../llm/parser').AgentSuggestion[] } }
  | { type: 'AGENT_STATUS';         payload: { id: string; status: AgentStatus } }
  | { type: 'RUN_CHUNK';            payload: { agentId: string; text: string } }
  | { type: 'RUN_COMPLETE';         payload: { run: import('../runtime/types').AgentRun } }
  | { type: 'INITIAL_STATE';        payload: { agents: import('../runtime/types').AgentDefinition[]; nodes: CanvasNode[]; hasAgents: boolean } }
  | { type: 'ERROR';                payload: { message: string; detail?: string } }
  | { type: 'TUTORIAL_STEP';        payload: TutorialStep }
  | { type: 'PROMPT_SUGGESTED';     payload: { agentId: string; prompt: string } }
  | { type: 'BUILDER_STEP';         payload: BuilderStep }
  | { type: 'BUILDER_PROMPT_READY'; payload: { prompt: string; name: string; emoji: string; description: string } }

// Messages from Webview → Extension
export type WebviewToExtension =
  | { type: 'SCAN_REQUEST' }
  | { type: 'ACTIVATE_AGENT';        payload: import('../runtime/types').AgentDefinition }
  | { type: 'DEACTIVATE_AGENT';      payload: { id: string } }
  | { type: 'RUN_AGENT';             payload: { id: string; context: string } }
  | { type: 'SAVE_AGENT';            payload: import('../runtime/types').AgentDefinition }
  | { type: 'DELETE_AGENT';          payload: { id: string } }
  | { type: 'NODE_MOVED';            payload: { id: string; x: number; y: number } }
  | { type: 'REQUEST_STATE' }
  | { type: 'TUTORIAL_ADVANCE';      payload: { step: number } }
  | { type: 'TUTORIAL_SKIP' }
  | { type: 'SUGGEST_PROMPT';        payload: { agentId: string; agentName: string; agentDescription: string } }
  | { type: 'OPEN_BUILDER';          payload: { flowDomain?: string; flowLabel?: string; flowFunctions?: string[] } }
  | { type: 'BUILDER_NEXT';          payload: { step: number; values: Record<string, unknown> } }
  | { type: 'BUILDER_BACK';          payload: { step: number } }
  | { type: 'CREATE_AGENT_FROM_BUILDER'; payload: { state: BuilderState } }
