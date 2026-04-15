import { RepoContext } from '../scanner/index'
import { FlowInfo } from '../scanner/flowDetector'
import { AgentSuggestion } from '../llm/parser'
import { AgentDefinition } from '../runtime/types'
import { CanvasNode, CanvasEdge } from './types'

const SKILL_LABELS: Record<string, string> = {
  'read-file': '📂 Ler arquivo',
  'write-file': '✍️ Escrever',
  'run-terminal': '▷ Terminal',
  'search-code': '🔍 Buscar',
  'notify': '🔔 Notificar',
}

// Column layout constants
const COL_FN    = 60
const COL_AGENT = 420
const COL_SKILL = 680
const GRID_Y    = 110

/**
 * Converts a scanned RepoContext + agent suggestions into canvas nodes and edges.
 * Uses a local counter per call — no global mutable state.
 */
export function buildCanvasNodes(
  ctx: RepoContext,
  suggestions: AgentSuggestion[],
  existingAgents: AgentDefinition[] = [],
  flows: FlowInfo[] = []
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  let counter = 0
  const nextId = () => ++counter

  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []

  // ── Function nodes (top 10 by gap priority) ──────────────────────────────
  const topFunctions = ctx.functions
    .filter(f => f.isExported)
    .sort((a, b) => {
      const score = (f: typeof a) => (!f.hasTests ? 2 : 0) + (!f.hasJsDoc ? 1 : 0)
      return score(b) - score(a)
    })
    .slice(0, 10)

  topFunctions.forEach((fn, i) => {
    nodes.push({
      id: `fn-${fn.name}-${nextId()}`,
      type: 'function',
      label: `${fn.name}()`,
      sublabel: fn.file,
      x: COL_FN,
      y: 60 + i * GRID_Y,
      data: { ...fn, flags: buildFlags(fn) },
    })
  })

  // ── Route nodes ───────────────────────────────────────────────────────────
  ctx.routes.slice(0, 5).forEach((route, i) => {
    nodes.push({
      id: `route-${nextId()}`,
      type: 'route',
      label: `${route.method} ${route.path}`,
      sublabel: route.file,
      x: COL_FN,
      y: 60 + (topFunctions.length + i) * GRID_Y,
      data: route,
    })
  })

  // ── Flow group nodes ──────────────────────────────────────────────────────
  flows.slice(0, 6).forEach((flow, i) => {
    nodes.push({
      id: `flow-${flow.domain}`,
      type: 'trigger',
      label: flow.label,
      sublabel: `${flow.files.length} arquivo(s)`,
      emoji: flow.emoji,
      x: COL_FN - 10,
      y: 60 + (topFunctions.length + ctx.routes.slice(0, 5).length + i) * GRID_Y,
      data: flow,
    })
  })

  // ── Agent nodes ───────────────────────────────────────────────────────────
  const allAgents: (AgentSuggestion | AgentDefinition)[] = [
    ...existingAgents,
    ...suggestions.filter(s => !existingAgents.find(a => a.id === s.id)),
  ]

  allAgents.slice(0, 8).forEach((agent, i) => {
    const isExisting = 'active' in agent
    const pos = isExisting && agent.canvasPosition
      ? agent.canvasPosition
      : { x: COL_AGENT, y: 60 + i * GRID_Y }

    const agentNodeId = `agent-${agent.id}`
    const agentNode: CanvasNode = {
      id: agentNodeId,
      type: 'agent',
      label: agent.name,
      sublabel: agent.description,
      emoji: agent.emoji,
      x: pos.x,
      y: pos.y,
      data: agent,
    }
    nodes.push(agentNode)

    // Skill nodes + edges
    const skills = agent.skills ?? []
    const seenSkills = new Set<string>()
    skills.slice(0, 3).forEach((skillId, si) => {
      const skillNodeId = `skill-${skillId}`
      if (!seenSkills.has(skillNodeId)) {
        seenSkills.add(skillNodeId)
        if (!nodes.find(n => n.id === skillNodeId)) {
          nodes.push({
            id: skillNodeId,
            type: 'skill',
            label: SKILL_LABELS[skillId] ?? skillId,
            x: COL_SKILL,
            y: agentNode.y + si * 52,
            data: { skillId },
          })
        }
      }
      edges.push({
        id: `edge-${agentNodeId}-${skillNodeId}-${nextId()}`,
        sourceId: agentNodeId,
        targetId: skillNodeId,
      })
    })

    // Connect top functions to this agent
    topFunctions.slice(0, 3).forEach(fn => {
      const fnNode = nodes.find(n => n.label === `${fn.name}()` && n.type === 'function')
      if (fnNode) {
        edges.push({
          id: `edge-${fnNode.id}-${agentNodeId}-${nextId()}`,
          sourceId: fnNode.id,
          targetId: agentNodeId,
        })
      }
    })
  })

  return { nodes, edges }
}

function buildFlags(fn: { hasTests: boolean; hasJsDoc: boolean; isAsync: boolean }): string[] {
  const flags: string[] = []
  if (!fn.hasTests) flags.push('sem testes')
  if (!fn.hasJsDoc) flags.push('sem docs')
  if (fn.isAsync) flags.push('async')
  return flags
}
