import { spawn, type ChildProcess } from 'child_process'
import type { Tool, ToolResult, ToolContext } from '../tools/Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

/**
 * Minimal MCP (Model Context Protocol) client.
 * Connects to an MCP server via stdio transport and discovers its tools.
 *
 * MCP protocol basics:
 * - Client sends JSON-RPC 2.0 over stdin
 * - Server responds over stdout
 * - Tools are discovered via "tools/list" method
 * - Tools are called via "tools/call" method
 */

interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export class McpClient {
  private proc: ChildProcess | null = null
  private serverName: string
  private command: string
  private args: string[]
  private requestId = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private discoveredTools: McpTool[] = []

  constructor(opts: { name: string; command: string; args?: string[] }) {
    this.serverName = opts.name
    this.command = opts.command
    this.args = opts.args ?? []
  }

  async connect(): Promise<void> {
    this.proc = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.proc.on('error', (err) => {
      for (const [, p] of this.pending) p.reject(err)
      this.pending.clear()
    })

    // Initialize
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'clawharness', version: '0.1.0' },
    })

    // Send initialized notification
    this.notify('notifications/initialized', {})

    // Discover tools
    const result = await this.send('tools/list', {})
    this.discoveredTools = result?.tools ?? []
  }

  getTools(): Tool[] {
    return this.discoveredTools.map(mt => this.wrapTool(mt))
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.send('tools/call', { name, arguments: args })
    if (result?.content) {
      return result.content
        .map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c))
        .join('\n')
    }
    return JSON.stringify(result)
  }

  disconnect() {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
  }

  private wrapTool(mt: McpTool): Tool {
    const client = this
    const fullName = `mcp__${this.serverName}__${mt.name}`

    return {
      name: fullName,
      description: `[MCP: ${this.serverName}] ${mt.description}`,
      readOnly: false,
      schema(): FunctionSchema {
        return {
          name: fullName,
          description: mt.description,
          parameters: mt.inputSchema,
        }
      },
      needsConfirm() { return true },
      async run(input: Record<string, unknown>): Promise<ToolResult> {
        try {
          const output = await client.callTool(mt.name, input)
          return { output, isError: false }
        } catch (e: any) {
          return { output: `MCP error: ${e.message}`, isError: true }
        }
      },
    }
  }

  private send(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      this.pending.set(id, { resolve, reject })

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      this.proc?.stdin?.write(msg)

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP request timed out: ${method}`))
        }
      }, 30_000)
    })
  }

  private notify(method: string, params: any) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    this.proc?.stdin?.write(msg)
  }

  private processBuffer() {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
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
