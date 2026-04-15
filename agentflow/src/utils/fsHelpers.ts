import * as vscode from 'vscode'

/**
 * Returns the first workspace root folder path, or null if no folder is open.
 */
export function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) return null
  return folders[0].uri.fsPath
}
