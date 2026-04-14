// Webview bridge — the ONLY point of contact with the VS Code API from the webview

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
  setState(state: unknown): void
  getState(): unknown
}

const vscode = acquireVsCodeApi()

type Listener = (payload: unknown) => void
const listeners = new Map<string, Listener[]>()

// Receive messages from the extension host
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string; payload: unknown }
  const fns = listeners.get(msg.type) ?? []
  fns.forEach(fn => fn(msg.payload))
})

export const bridge = {
  /** Send a message to the extension host */
  send(type: string, payload?: unknown): void {
    vscode.postMessage({ type, payload })
  },

  /** Listen for messages from the extension host. Returns an unsubscribe function. */
  on(type: string, fn: Listener): () => void {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type)!.push(fn)
    return () => {
      const arr = listeners.get(type) ?? []
      listeners.set(type, arr.filter(f => f !== fn))
    }
  },

  /** Persist UI state across webview reloads */
  setState(state: unknown): void {
    vscode.setState(state)
  },

  getState(): unknown {
    return vscode.getState()
  },
}
