import * as vscode from 'vscode'
import { ExtensionToWebview } from './types'

export class CanvasPanel {
  public static currentPanel: CanvasPanel | undefined
  private readonly _panel: vscode.WebviewPanel
  private _disposables: vscode.Disposable[] = []

  private _onMessage: ((msg: unknown) => void) | null = null

  static create(context: vscode.ExtensionContext, onMessage: (msg: unknown) => void): CanvasPanel {
    if (CanvasPanel.currentPanel) {
      CanvasPanel.currentPanel._panel.reveal(vscode.ViewColumn.One)
      CanvasPanel.currentPanel._onMessage = onMessage
      return CanvasPanel.currentPanel
    }

    const panel = vscode.window.createWebviewPanel(
      'agentflow.canvas',
      'AgentFlow Canvas',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(context.extensionUri, 'assets'),
        ],
      }
    )

    return new CanvasPanel(panel, context, onMessage)
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext,
    onMessage: (msg: unknown) => void
  ) {
    this._panel = panel
    this._onMessage = onMessage

    this._panel.webview.html = this._getHtml()

    this._panel.webview.onDidReceiveMessage(
      msg => this._onMessage?.(msg),
      null,
      this._disposables
    )

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)
    CanvasPanel.currentPanel = this
  }

  send(msg: ExtensionToWebview): void {
    this._panel.webview.postMessage(msg)
  }

  private _getHtml(): string {
    const webview = this._panel.webview

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview', 'bundle.js')
    )
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'assets', 'webview', 'styles.css')
    )

    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${cssUri}">
  <title>AgentFlow Canvas</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  dispose(): void {
    CanvasPanel.currentPanel = undefined
    this._panel.dispose()
    this._disposables.forEach(d => d.dispose())
    this._disposables = []
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}
