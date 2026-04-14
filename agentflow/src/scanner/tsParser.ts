import { FunctionInfo } from './types'

// Regex patterns for detecting exported functions/classes
const EXPORT_FUNCTION_RE = /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g
const EXPORT_CONST_ARROW_RE = /export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s*)?\s*(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?::\s*[^=]+)?\s*=>/gm
const EXPORT_CLASS_RE = /export\s+(?:abstract\s+)?class\s+(\w+)/g
const JSDOC_RE = /\/\*\*[\s\S]*?\*\//

/**
 * Parses TypeScript/JavaScript source to extract function/class information.
 */
export function parseFunctions(content: string, filePath: string): FunctionInfo[] {
  const results: FunctionInfo[] = []
  const lines = content.split('\n')

  // Extract export function declarations
  let match: RegExpExecArray | null
  const fnRe = new RegExp(EXPORT_FUNCTION_RE.source, 'g')
  while ((match = fnRe.exec(content)) !== null) {
    const name = match[2]
    const isAsync = !!match[1]
    const paramsRaw = match[3] ?? ''
    const returnType = match[4]?.trim() ?? null
    const lineNum = lineOf(content, match.index)
    const hasJsDoc = checkJsDoc(content, match.index)

    results.push({
      name,
      file: filePath,
      line: lineNum,
      isExported: true,
      isAsync,
      hasTests: false,   // set later by scanner/index
      hasJsDoc,
      params: parseParams(paramsRaw),
      returnType,
    })
  }

  // Extract export const arrow functions
  const arrowRe = new RegExp(EXPORT_CONST_ARROW_RE.source, 'gm')
  while ((match = arrowRe.exec(content)) !== null) {
    const name = match[1]
    const isAsync = !!match[2]
    const lineNum = lineOf(content, match.index)
    const hasJsDoc = checkJsDoc(content, match.index)

    // Avoid duplicates
    if (!results.find(r => r.name === name && r.line === lineNum)) {
      results.push({
        name,
        file: filePath,
        line: lineNum,
        isExported: true,
        isAsync,
        hasTests: false,
        hasJsDoc,
        params: [],
        returnType: null,
      })
    }
  }

  // Extract exported classes as pseudo-functions
  const classRe = new RegExp(EXPORT_CLASS_RE.source, 'g')
  while ((match = classRe.exec(content)) !== null) {
    const name = match[1]
    const lineNum = lineOf(content, match.index)
    const hasJsDoc = checkJsDoc(content, match.index)
    results.push({
      name,
      file: filePath,
      line: lineNum,
      isExported: true,
      isAsync: false,
      hasTests: false,
      hasJsDoc,
      params: [],
      returnType: null,
    })
  }

  void lines // referenced for potential future use
  return results
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

function checkJsDoc(content: string, index: number): boolean {
  const before = content.slice(Math.max(0, index - 500), index)
  return JSDOC_RE.test(before)
}

function parseParams(raw: string): string[] {
  return raw
    .split(',')
    .map(p => p.trim().split(':')[0].trim().replace(/[?=].*/, '').trim())
    .filter(p => p.length > 0)
}
