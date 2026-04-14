import * as vscode from 'vscode'

export class Logger {
  private channel: vscode.OutputChannel

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name)
  }

  info(msg: string): void {
    const line = `[${timestamp()}] INFO  ${msg}`
    this.channel.appendLine(line)
  }

  success(msg: string): void {
    const line = `[${timestamp()}] OK    ${msg}`
    this.channel.appendLine(line)
  }

  warn(msg: string): void {
    const line = `[${timestamp()}] WARN  ${msg}`
    this.channel.appendLine(line)
  }

  error(msg: string): void {
    const line = `[${timestamp()}] ERROR ${msg}`
    this.channel.appendLine(line)
  }

  show(): void {
    this.channel.show(true)
  }

  dispose(): void {
    this.channel.dispose()
  }
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19)
}
