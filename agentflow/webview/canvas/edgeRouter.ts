import { CanvasNodeView } from './renderer'

/**
 * Computes a cubic bezier SVG path between two nodes.
 */
export function computeEdgePath(source: CanvasNodeView, target: CanvasNodeView): string {
  const sx = source.x + source.width
  const sy = source.y + source.height / 2
  const tx = target.x
  const ty = target.y + target.height / 2

  const dx = Math.abs(tx - sx)
  const cp1x = sx + dx * 0.5
  const cp1y = sy
  const cp2x = tx - dx * 0.5
  const cp2y = ty

  return `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`
}

/**
 * Computes a straight path as fallback for close nodes.
 */
export function computeStraightPath(source: CanvasNodeView, target: CanvasNodeView): string {
  const sx = source.x + source.width
  const sy = source.y + source.height / 2
  const tx = target.x
  const ty = target.y + target.height / 2
  return `M ${sx} ${sy} L ${tx} ${ty}`
}
