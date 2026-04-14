import * as vscode from 'vscode'
import * as path from 'path'

/**
 * Returns the absolute path to the .agentflow directory inside the workspace.
 */
export function getAgentFlowDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agentflow')
}

/**
 * Reads a file from the workspace using the VS Code filesystem API.
 */
export async function readWorkspaceFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri)
  return Buffer.from(bytes).toString('utf-8')
}

/**
 * Writes content to a workspace file using the VS Code filesystem API.
 */
export async function writeWorkspaceFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
}

/**
 * Ensures a directory exists (creates it recursively if it doesn't).
 */
export async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri)
  } catch {
    // Already exists — ignore
  }
}

/**
 * Returns the first workspace root folder path, or null if no folder is open.
 */
export function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) return null
  return folders[0].uri.fsPath
}

/**
 * Checks whether a file/directory exists.
 */
export async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}
