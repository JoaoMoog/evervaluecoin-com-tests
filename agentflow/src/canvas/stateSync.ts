import { RepoContext } from '../scanner/index'
import { AgentSuggestion } from '../llm/parser'
import { AgentDefinition } from '../runtime/types'
import { CanvasNode, CanvasEdge } from './types'

let nodeIdCounter = 1

/**
 * Converts a scanned RepoContext + agent suggestions into canvas nodes and edges.
 */
export function buildCanvasNodes(
  ctx: RepoContext,
  suggestions: AgentSuggestion[],
  existingAgents: AgentDefinition[] = []
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  nodeIdCounter = 1
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []

  const GRID_X = 180
  const GRID_Y = 120
  const COL_FN = 60
  const COL_AGENT = 400
  const COL_SKILL = 720

  // Function nodes (top 10 by gap priority)
  const topFunctions = ctx.functions
    .filter(f => f.isExported)
    .sort((a, b) => {
      const sa = (!a.hasTests ? 2 : 0) + (!a.hasJsDoc ? 1 : 0)
      const sb = (!b.hasTests ? 2 : 0) + (!b.hasJsDoc ? 1 : 0)
      return sb - sa
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

  // Route nodes
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

  // Agent nodes (from suggestions + existing)
  const allAgents: (AgentSuggestion | AgentDefinition)[] = [
    ...existingAgents,
    ...suggestions.filter(s => !existingAgents.find(a => a.id === s.id)),
  ]

  allAgents.slice(0, 8).forEach((agent, i) => {
    const isExisting = 'active' in agent
    const agentNode: CanvasNode = {
      id: `agent-${agent.id}`,
      type: 'agent',
      label: agent.name,
      sublabel: agent.description,
      emoji: agent.emoji,
      x: isExisting ? (agent.canvasPosition?.x ?? COL_AGENT) : COL_AGENT,
      y: isExisting ? (agent.canvasPosition?.y ?? 60 + i * GRID_Y) : 60 + i * GRID_Y,
      data: agent,
    }
    nodes.push(agentNode)

    // Skills for this agent
    const skills = 'skills' in agent ? agent.skills : []
    skills.slice(0, 3).forEach((skillId, si) => {
      const skillNodeId = `skill-${skillId}-${agentNode.id}`
      if (!nodes.find(n => n.id === skillNodeId)) {
        nodes.push({
          id: skillNodeId,
          type: 'skill',
          label: formatSkillLabel(skillId),
          x: COL_SKILL,
          y: agentNode.y + si * 50,
          data: { skillId },
        })
      }
      edges.push({
        id: `edge-${agentNode.id}-${skillNodeId}`,
        sourceId: agentNode.id,
        targetId: skillNodeId,
      })
    })

    // Connect functions to agents based on description overlap
    topFunctions.slice(0, 3).forEach(fn => {
      const fnNode = nodes.find(n => n.id.startsWith(`fn-${fn.name}`))
      if (fnNode) {
        edges.push({
          id: `edge-${fnNode.id}-${agentNode.id}`,
          sourceId: fnNode.id,
          targetId: agentNode.id,
        })
      }
    })
  })

  return { nodes, edges }
}

function nextId(): number {
  return nodeIdCounter++
}

function buildFlags(fn: { hasTests: boolean; hasJsDoc: boolean; isAsync: boolean }): string[] {
  const flags: string[] = []
  if (!fn.hasTests) flags.push('sem testes')
  if (!fn.hasJsDoc) flags.push('sem docs')
  if (fn.isAsync) flags.push('async')
  return flags
}

function formatSkillLabel(id: string): string {
  const labels: Record<string, string> = {
    'read-file': '📂 Ler arquivo',
    'write-file': '✍️ Escrever',
    'run-terminal': '▷ Terminal',
    'search-code': '🔍 Buscar',
    'notify': '🔔 Notificar',
  }
  return labels[id] ?? id
}
