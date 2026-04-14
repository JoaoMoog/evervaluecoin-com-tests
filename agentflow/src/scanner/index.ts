import * as vscode from 'vscode'
import * as path from 'path'
import { walkFiles, walkTestFiles } from './fileWalker'
import { parseFunctions } from './tsParser'
import { parseRoutes } from './routeParser'
import { parseModels } from './modelParser'
import { parseProjectConfig } from './configParser'
import { RepoContext, FunctionInfo, RouteInfo, ModelInfo, GapInfo } from './types'

export { RepoContext, FunctionInfo, RouteInfo, ModelInfo, GapInfo }
export { buildContext } from './contextBuilder'

type ProgressFn = (step: string, pct: number) => void

/**
 * Orchestrates a full workspace scan and returns a RepoContext.
 */
export async function scanWorkspace(
  _context: vscode.ExtensionContext,
  onProgress: ProgressFn
): Promise<RepoContext> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  const config = vscode.workspace.getConfiguration('agentflow')
  const maxDepth: number = config.get('scanDepth') ?? 3

  onProgress('Conhecendo seu projeto...', 5)
  const projectConfig = await parseProjectConfig(root)

  onProgress('Encontrando seus arquivos de código...', 10)
  const files = await walkFiles(maxDepth)
  const testFiles = await walkTestFiles()
  const testFilePaths = new Set(testFiles.map(u => u.fsPath))

  onProgress('Lendo como seu código está organizado...', 30)
  const functions: FunctionInfo[] = []
  const routes: RouteInfo[] = []
  const models: ModelInfo[] = []

  let scanned = 0
  for (const uri of files) {
    const relPath = path.relative(root, uri.fsPath)
    let content = ''
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      content = Buffer.from(bytes).toString('utf-8')
    } catch {
      continue
    }

    // Parse functions from TS/JS files
    if (/\.[tj]sx?$/.test(uri.fsPath)) {
      const fns = parseFunctions(content, relPath)
      // Check if a test file covers this file
      const hasTestFile = testFilePaths.has(uri.fsPath.replace(/\.[tj]sx?$/, '.test.ts')) ||
        testFilePaths.has(uri.fsPath.replace(/\.[tj]sx?$/, '.spec.ts'))
      fns.forEach(f => { f.hasTests = hasTestFile })
      functions.push(...fns)
      routes.push(...parseRoutes(content, relPath))
    }

    // Parse models from Prisma/TS files
    if (uri.fsPath.endsWith('.prisma') || /\.[tj]s$/.test(uri.fsPath)) {
      models.push(...parseModels(content, relPath))
    }

    scanned++
    const pct = 30 + Math.floor((scanned / files.length) * 40)
    if (scanned % 10 === 0) {
      onProgress(`Lendo arquivos... (${scanned} de ${files.length})`, pct)
    }
  }

  onProgress('Procurando onde um agente pode te ajudar...', 75)
  const gaps = detectGaps(functions, routes, root, projectConfig)

  onProgress('Preparando o canvas...', 90)

  return {
    projectName: projectConfig.name,
    language: projectConfig.language,
    framework: projectConfig.framework,
    testFramework: projectConfig.testFramework,
    functions,
    routes,
    models,
    scripts: projectConfig.scripts,
    gaps,
    stats: {
      totalFiles: files.length,
      totalFunctions: functions.length,
      testCoverage: null,
      filesScanned: scanned,
    },
  }
}

function detectGaps(
  functions: FunctionInfo[],
  _routes: RouteInfo[],
  _root: string,
  projectConfig: ReturnType<typeof Object.assign>
): GapInfo[] {
  const gaps: GapInfo[] = []

  // Functions without tests
  const noTestFns = functions.filter(f => !f.hasTests && f.isExported)
  if (noTestFns.length > 0) {
    const uniqueFiles = [...new Set(noTestFns.map(f => f.file))].slice(0, 5)
    uniqueFiles.forEach(file => {
      const count = noTestFns.filter(f => f.file === file).length
      gaps.push({
        type: 'no-tests',
        file,
        detail: `${count} funções exportadas sem testes detectados`,
      })
    })
  }

  // Functions without JSDoc
  const noDocFns = functions.filter(f => !f.hasJsDoc && f.isExported)
  if (noDocFns.length > 5) {
    gaps.push({
      type: 'no-docs',
      file: '(múltiplos arquivos)',
      detail: `${noDocFns.length} funções exportadas sem JSDoc`,
    })
  }

  // No test framework configured
  if (!projectConfig.testFramework) {
    gaps.push({
      type: 'no-tests',
      file: 'package.json',
      detail: 'Nenhum framework de testes detectado no projeto',
    })
  }

  return gaps
}
