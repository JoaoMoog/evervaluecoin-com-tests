import * as vscode from 'vscode'

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  text: string
  done: boolean
}

export class CopilotBridge {
  private model: vscode.LanguageModelChat | null = null

  /**
   * Tries to connect to GitHub Copilot. Returns false if not available.
   */
  async initialize(): Promise<boolean> {
    try {
      // Try gpt-4o first, then fallback to any available copilot model
      const families = ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'claude-3.5-sonnet']
      for (const family of families) {
        const models = await vscode.lm.selectChatModels({
          vendor: 'copilot',
          family,
        })
        if (models.length) {
          this.model = models[0]
          return true
        }
      }

      // Last resort: any copilot model
      const any = await vscode.lm.selectChatModels({ vendor: 'copilot' })
      if (any.length) {
        this.model = any[0]
        return true
      }

      return false
    } catch {
      return false
    }
  }

  /**
   * Sends messages to Copilot and yields text chunks via AsyncGenerator.
   */
  async *sendStream(
    messages: LLMMessage[],
    cancelToken?: vscode.CancellationToken
  ): AsyncGenerator<StreamChunk> {
    if (!this.model) throw new Error('Copilot não inicializado. Chame initialize() primeiro.')

    const vsMessages = messages.map(m =>
      m.role === 'user'
        ? vscode.LanguageModelChatMessage.User(m.content)
        : vscode.LanguageModelChatMessage.Assistant(m.content)
    )

    const cts = cancelToken ? null : new vscode.CancellationTokenSource()
    const token = cancelToken ?? cts!.token

    try {
      const response = await this.model.sendRequest(vsMessages, {}, token)
      let full = ''
      for await (const chunk of response.text) {
        full += chunk
        yield { text: chunk, done: false }
      }
      yield { text: full, done: true }
    } finally {
      cts?.dispose()
    }
  }

  /**
   * Sends messages and returns the complete response string.
   */
  async send(messages: LLMMessage[]): Promise<string> {
    let result = ''
    for await (const chunk of this.sendStream(messages)) {
      if (chunk.done) result = chunk.text
    }
    return result
  }

  isAvailable(): boolean {
    return this.model !== null
  }

  getModelName(): string {
    return this.model?.name ?? 'none'
  }
}
