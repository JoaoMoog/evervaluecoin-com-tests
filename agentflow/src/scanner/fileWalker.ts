import * as vscode from 'vscode'

const SCAN_INCLUDE = '**/*.{ts,tsx,js,jsx,py,go}'
const SCAN_EXCLUDE = '{node_modules,dist,build,.git,coverage,__pycache__,.agentflow}/**'

/**
 * Returns all source files in the workspace up to maxDepth.
 */
export async function walkFiles(maxDepth = 3): Promise<vscode.Uri[]> {
  const allFiles = await vscode.workspace.findFiles(SCAN_INCLUDE, SCAN_EXCLUDE)

  // Filter by depth (count path separators relative to workspace root)
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  return allFiles.filter(uri => {
    const rel = uri.fsPath.startsWith(root)
      ? uri.fsPath.slice(root.length + 1)
      : uri.fsPath
    const depth = rel.split(/[\\/]/).length - 1
    return depth <= maxDepth
  })
}

/**
 * Returns test file URIs (files with .test. or .spec. in name, or inside __tests__).
 */
export async function walkTestFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(
    '**/*.{test,spec}.{ts,tsx,js,jsx}',
    SCAN_EXCLUDE
  )
}
