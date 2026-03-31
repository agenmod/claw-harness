/**
 * Language Server Protocol client.
 * Connects to language servers for diagnostics, definitions, and completions.
 * Supports any LSP-compatible server (TypeScript, Python, Rust, Go, etc.)
 */

import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'

interface LSPDiagnostic {
  file: string
  line: number
  column: number
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
}

interface LSPDefinition {
  file: string
  line: number
  column: number
}

interface LSPConfig {
  command: string
  args?: string[]
  rootPath: string
  language: string
}

export class LSPClient {
  private proc: ChildProcess | null = null
  private requestId = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private contentLength = -1
  private config: LSPConfig
  private initialized = false

  constructor(config: LSPConfig) {
    this.config = config
  }

  async start(): Promise<boolean> {
    try {
      this.proc = spawn(this.config.command, this.config.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.rootPath,
      })

      this.proc.stdout!.on('data', (data: Buffer) => this.handleData(data))
      this.proc.on('error', () => this.initialized = false)

      // Initialize
      const initResult = await this.request('initialize', {
        processId: process.pid,
        capabilities: {
          textDocument: {
            publishDiagnostics: { relatedInformation: true },
            definition: { dynamicRegistration: false },
            hover: { dynamicRegistration: false },
            references: { dynamicRegistration: false },
          },
        },
        rootUri: `file://${this.config.rootPath}`,
        workspaceFolders: [{ uri: `file://${this.config.rootPath}`, name: 'workspace' }],
      })

      this.notify('initialized', {})
      this.initialized = true
      return true
    } catch {
      return false
    }
  }

  async getDiagnostics(filePath: string): Promise<LSPDiagnostic[]> {
    if (!this.initialized) return []
    const uri = `file://${resolve(this.config.rootPath, filePath)}`

    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.config.language,
        version: 1,
        text: require('fs').readFileSync(resolve(this.config.rootPath, filePath), 'utf-8'),
      },
    })

    // Wait briefly for diagnostics
    await new Promise(r => setTimeout(r, 2000))

    // Diagnostics come via notifications, not requests — return cached
    return [] // TODO: collect from notification handler
  }

  async getDefinition(filePath: string, line: number, column: number): Promise<LSPDefinition | null> {
    if (!this.initialized) return null
    const uri = `file://${resolve(this.config.rootPath, filePath)}`

    try {
      const result = await this.request('textDocument/definition', {
        textDocument: { uri },
        position: { line: line - 1, character: column - 1 },
      })

      if (!result) return null
      const loc = Array.isArray(result) ? result[0] : result
      if (!loc?.uri) return null

      return {
        file: loc.uri.replace('file://', ''),
        line: (loc.range?.start?.line ?? 0) + 1,
        column: (loc.range?.start?.character ?? 0) + 1,
      }
    } catch {
      return null
    }
  }

  async getHover(filePath: string, line: number, column: number): Promise<string | null> {
    if (!this.initialized) return null
    const uri = `file://${resolve(this.config.rootPath, filePath)}`

    try {
      const result = await this.request('textDocument/hover', {
        textDocument: { uri },
        position: { line: line - 1, character: column - 1 },
      })

      if (!result?.contents) return null
      if (typeof result.contents === 'string') return result.contents
      if (result.contents.value) return result.contents.value
      if (Array.isArray(result.contents)) return result.contents.map((c: any) => c.value ?? c).join('\n')
      return null
    } catch {
      return null
    }
  }

  async getReferences(filePath: string, line: number, column: number): Promise<LSPDefinition[]> {
    if (!this.initialized) return []
    const uri = `file://${resolve(this.config.rootPath, filePath)}`

    try {
      const result = await this.request('textDocument/references', {
        textDocument: { uri },
        position: { line: line - 1, character: column - 1 },
        context: { includeDeclaration: true },
      })

      if (!Array.isArray(result)) return []
      return result.map((loc: any) => ({
        file: loc.uri.replace('file://', ''),
        line: (loc.range?.start?.line ?? 0) + 1,
        column: (loc.range?.start?.character ?? 0) + 1,
      }))
    } catch {
      return []
    }
  }

  stop() {
    if (this.proc) {
      this.request('shutdown', null).catch(() => {})
      this.notify('exit', null)
      setTimeout(() => this.proc?.kill(), 2000)
    }
  }

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      this.pending.set(id, { resolve, reject })
      this.send({ jsonrpc: '2.0', id, method, params })
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`LSP timeout: ${method}`)) }
      }, 10_000)
    })
  }

  private notify(method: string, params: any) {
    this.send({ jsonrpc: '2.0', method, params })
  }

  private send(msg: object) {
    const body = JSON.stringify(msg)
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
    this.proc?.stdin?.write(header + body)
  }

  private handleData(data: Buffer) {
    this.buffer += data.toString()

    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) break
        const header = this.buffer.slice(0, headerEnd)
        const match = header.match(/Content-Length:\s*(\d+)/i)
        if (!match) { this.buffer = this.buffer.slice(headerEnd + 4); continue }
        this.contentLength = parseInt(match[1]!, 10)
        this.buffer = this.buffer.slice(headerEnd + 4)
      }

      if (this.buffer.length < this.contentLength) break

      const body = this.buffer.slice(0, this.contentLength)
      this.buffer = this.buffer.slice(this.contentLength)
      this.contentLength = -1

      try {
        const msg = JSON.parse(body)
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if (msg.error) p.reject(new Error(msg.error.message))
          else p.resolve(msg.result)
        }
      } catch {}
    }
  }
}

// ── Auto-detect language server for common languages ──

const LS_CONFIGS: Record<string, { cmd: string; args?: string[]; lang: string }> = {
  ts: { cmd: 'typescript-language-server', args: ['--stdio'], lang: 'typescript' },
  js: { cmd: 'typescript-language-server', args: ['--stdio'], lang: 'javascript' },
  py: { cmd: 'pylsp', lang: 'python' },
  rs: { cmd: 'rust-analyzer', lang: 'rust' },
  go: { cmd: 'gopls', args: ['serve'], lang: 'go' },
  java: { cmd: 'jdtls', lang: 'java' },
  c: { cmd: 'clangd', lang: 'c' },
  cpp: { cmd: 'clangd', lang: 'cpp' },
}

export function detectLanguageServer(filePath: string, rootPath: string): LSPConfig | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const config = LS_CONFIGS[ext]
  if (!config) return null
  return { command: config.cmd, args: config.args, rootPath, language: config.lang }
}
