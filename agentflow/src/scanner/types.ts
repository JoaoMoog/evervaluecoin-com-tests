export interface FunctionInfo {
  name: string
  file: string        // relative to workspace root
  line: number
  isExported: boolean
  isAsync: boolean
  hasTests: boolean
  hasJsDoc: boolean
  params: string[]
  returnType: string | null
}

export interface RouteInfo {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  file: string
  handler: string
  hasMiddleware: boolean
}

export interface ModelInfo {
  name: string
  file: string
  orm: 'prisma' | 'typeorm' | 'mongoose' | 'sequelize' | 'unknown'
  fields: string[]
}

export interface GapInfo {
  type: 'no-tests' | 'no-docs' | 'no-error-handling' | 'outdated-deps'
  file: string
  detail: string
}

export interface RepoStats {
  totalFiles: number
  totalFunctions: number
  testCoverage: number | null   // 0-100 or null if not calculated
  filesScanned: number
}

export interface RepoContext {
  projectName: string
  language: 'typescript' | 'javascript' | 'python' | 'unknown'
  framework: string | null       // 'express' | 'nestjs' | 'nextjs' | null
  testFramework: string | null   // 'jest' | 'vitest' | 'mocha' | null
  functions: FunctionInfo[]
  routes: RouteInfo[]
  models: ModelInfo[]
  scripts: Record<string, string>
  gaps: GapInfo[]
  stats: RepoStats
}
