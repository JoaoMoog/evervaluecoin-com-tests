import * as vscode from 'vscode'

export interface ProjectConfig {
  name: string
  scripts: Record<string, string>
  framework: string | null
  testFramework: string | null
  language: 'typescript' | 'javascript' | 'python' | 'unknown'
}

/**
 * Reads package.json and tsconfig to determine project configuration.
 */
export async function parseProjectConfig(workspaceRoot: string): Promise<ProjectConfig> {
  const pkgUri = vscode.Uri.file(`${workspaceRoot}/package.json`)

  let pkg: Record<string, unknown> = {}
  try {
    const bytes = await vscode.workspace.fs.readFile(pkgUri)
    pkg = JSON.parse(Buffer.from(bytes).toString('utf-8'))
  } catch {
    // No package.json — try to detect Python project
    const hasPyFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 1)
    if (hasPyFiles.length) {
      return { name: 'unknown', scripts: {}, framework: null, testFramework: null, language: 'python' }
    }
    return { name: 'unknown', scripts: {}, framework: null, testFramework: null, language: 'unknown' }
  }

  const deps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  }

  return {
    name: (pkg.name as string) ?? 'unknown',
    scripts: (pkg.scripts as Record<string, string>) ?? {},
    framework: detectFramework(deps),
    testFramework: detectTestFramework(deps),
    language: detectLanguage(deps),
  }
}

function detectFramework(deps: Record<string, string>): string | null {
  if ('next' in deps) return 'nextjs'
  if ('@nestjs/core' in deps) return 'nestjs'
  if ('express' in deps) return 'express'
  if ('fastify' in deps) return 'fastify'
  if ('koa' in deps) return 'koa'
  if ('hono' in deps) return 'hono'
  if ('react' in deps) return 'react'
  if ('vue' in deps) return 'vue'
  if ('svelte' in deps) return 'svelte'
  return null
}

function detectTestFramework(deps: Record<string, string>): string | null {
  if ('vitest' in deps) return 'vitest'
  if ('jest' in deps || '@jest/core' in deps) return 'jest'
  if ('mocha' in deps) return 'mocha'
  if ('jasmine' in deps) return 'jasmine'
  if ('ava' in deps) return 'ava'
  return null
}

function detectLanguage(deps: Record<string, string>): 'typescript' | 'javascript' | 'python' | 'unknown' {
  if ('typescript' in deps || '@types/node' in deps) return 'typescript'
  return 'javascript'
}
