import { RouteInfo } from './types'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

// Matches: router.get('/path', ...) or app.post('/path', ...)
const ROUTE_RE = /(?:router|app|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi

// NestJS decorators: @Get('/path'), @Post(), etc.
const NEST_ROUTE_RE = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/gi

// Fastify: fastify.get('/path', ...) or fastify.route({ method: 'GET', url: '/path' })
const FASTIFY_ROUTE_RE = /fastify\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi

/**
 * Parses HTTP route definitions from Express/Fastify/NestJS source files.
 */
export function parseRoutes(content: string, filePath: string): RouteInfo[] {
  const results: RouteInfo[] = []

  // Express/Fastify-style routes
  let match: RegExpExecArray | null

  const expressRe = new RegExp(ROUTE_RE.source, 'gi')
  while ((match = expressRe.exec(content)) !== null) {
    const method = match[1].toUpperCase() as HttpMethod
    const path = match[2]
    const hasMiddleware = detectMiddleware(content, match.index)
    results.push({
      method,
      path,
      file: filePath,
      handler: extractHandlerName(content, match.index),
      hasMiddleware,
    })
  }

  const fastifyRe = new RegExp(FASTIFY_ROUTE_RE.source, 'gi')
  while ((match = fastifyRe.exec(content)) !== null) {
    const method = match[1].toUpperCase() as HttpMethod
    const path = match[2]
    if (!results.find(r => r.path === path && r.method === method)) {
      results.push({
        method,
        path,
        file: filePath,
        handler: extractHandlerName(content, match.index),
        hasMiddleware: false,
      })
    }
  }

  // NestJS decorators
  const nestRe = new RegExp(NEST_ROUTE_RE.source, 'gi')
  while ((match = nestRe.exec(content)) !== null) {
    const method = match[1].toUpperCase() as HttpMethod
    const path = match[2] ?? '/'
    results.push({
      method,
      path: path || '/',
      file: filePath,
      handler: extractNestHandler(content, match.index),
      hasMiddleware: false,
    })
  }

  return results
}

function detectMiddleware(content: string, index: number): boolean {
  // Check if there are more than 2 arguments (handler array = middleware)
  const slice = content.slice(index, index + 200)
  const commas = (slice.match(/,/g) ?? []).length
  return commas >= 2
}

function extractHandlerName(content: string, index: number): string {
  const slice = content.slice(index, index + 200)
  const fnMatch = slice.match(/,\s*(?:async\s+)?(?:function\s+)?(\w+)/)
  return fnMatch?.[1] ?? 'anonymous'
}

function extractNestHandler(content: string, index: number): string {
  // Find method name after decorator
  const slice = content.slice(index, index + 300)
  const methodMatch = slice.match(/(?:async\s+)?(\w+)\s*\(/)
  return methodMatch?.[1] ?? 'handler'
}
