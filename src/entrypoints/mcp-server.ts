/**
 * MCP Server mode — expose ClawHarness as an MCP server.
 *
 * Any MCP-compatible client (Cursor, Cherry Studio, Claude Desktop)
 * can connect and use ClawHarness's multi-model coding capabilities.
 *
 * Usage:
 *   clh --mcp-server                    # stdio transport
 *   clh --mcp-server --port 3100        # HTTP transport (future)
 *
 * Cursor config (~/.cursor/mcp.json):
 *   {
 *     "mcpServers": {
 *       "clawharness": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/clawharness/src/entrypoints/mcp-server.ts"]
 *       }
 *     }
 *   }
 */

import { createSession } from './sdk.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: any
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: any
  error?: { code: number; message: string; data?: any }
}

const SERVER_INFO = {
  name: 'clawharness',
  version: '0.1.0',
}

const CAPABILITIES = {
  tools: { listChanged: false },
}

// Available MCP tools that ClawHarness exposes
const MCP_TOOLS = [
  {
    name: 'claw_run',
    description: 'Run a coding task using ClawHarness multi-model agent. The agent can read/write files, run commands, search code, and more. Uses smart model routing for cost optimization.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The coding task to perform' },
        provider: { type: 'string', description: 'Model provider (deepseek/doubao/qwen/openai). Default: auto-detected from env.' },
        cwd: { type: 'string', description: 'Working directory. Default: server CWD.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'claw_search',
    description: 'Search code in the project using ripgrep.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory to search in (default: cwd)' },
        include: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'claw_read',
    description: 'Read a file with line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
        offset: { type: 'number', description: 'Start line (1-based)' },
        limit: { type: 'number', description: 'Max lines to return' },
      },
      required: ['path'],
    },
  },
  {
    name: 'claw_edit',
    description: 'Edit a file by replacing an exact string.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File to edit' },
        old_string: { type: 'string', description: 'Exact text to replace (must be unique)' },
        new_string: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'claw_bash',
    description: 'Run a shell command.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
]

// Persistent session for multi-turn conversations
let session: ReturnType<typeof createSession> | null = null

function getSession(provider?: string, cwd?: string) {
  if (!session) {
    session = createSession({
      provider,
      cwd: cwd ?? process.cwd(),
      permissionMode: 'trust',
    })
  }
  return session
}

async function handleToolCall(name: string, args: any): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const s = getSession(args.provider, args.cwd)

  if (name === 'claw_run') {
    const result = await s.run(args.prompt)
    const output = result.text || result.toolCalls.map(tc => `[${tc.name}] ${tc.output.slice(0, 200)}`).join('\n') || '(completed)'
    return { content: [{ type: 'text', text: output }] }
  }

  // Direct tool calls bypass the agent loop
  if (name === 'claw_search') {
    const { GrepTool } = await import('../tools/search/GrepTool.js')
    const result = await GrepTool.run(args, { cwd: process.cwd(), permissionMode: 'trust' })
    return { content: [{ type: 'text', text: result.output }] }
  }

  if (name === 'claw_read') {
    const { ReadTool } = await import('../tools/file/ReadTool.js')
    const result = await ReadTool.run(args, { cwd: process.cwd(), permissionMode: 'trust' })
    return { content: [{ type: 'text', text: result.output }] }
  }

  if (name === 'claw_edit') {
    const { EditTool } = await import('../tools/file/EditTool.js')
    const result = await EditTool.run(args, { cwd: process.cwd(), permissionMode: 'trust' })
    return { content: [{ type: 'text', text: result.output }] }
  }

  if (name === 'claw_bash') {
    const { BashTool } = await import('../tools/bash/BashTool.js')
    const result = await BashTool.run(args, { cwd: process.cwd(), permissionMode: 'trust' })
    return { content: [{ type: 'text', text: result.output }] }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
}

function handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
  const { id, method, params } = req

  switch (method) {
    case 'initialize':
      return { jsonrpc: '2.0', id: id!, result: { protocolVersion: '2024-11-05', capabilities: CAPABILITIES, serverInfo: SERVER_INFO } }

    case 'notifications/initialized':
      return null // no response for notifications

    case 'tools/list':
      return { jsonrpc: '2.0', id: id!, result: { tools: MCP_TOOLS } }

    case 'tools/call':
      // Async — handled separately
      return null

    default:
      return { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } }
  }
}

// ── Stdio transport ──

export async function startMcpServer() {
  let buffer = ''

  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const req: JsonRpcRequest = JSON.parse(line)

        // Handle async tool calls
        if (req.method === 'tools/call' && req.id) {
          try {
            const result = await handleToolCall(req.params.name, req.params.arguments ?? {})
            send({ jsonrpc: '2.0', id: req.id, result })
          } catch (err: any) {
            send({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: err.message } })
          }
          continue
        }

        const resp = handleRequest(req)
        if (resp) send(resp)
      } catch {}
    }
  })

  // Signal ready
  process.stderr.write('🦞 ClawHarness MCP Server running on stdio\n')
}

function send(msg: JsonRpcResponse) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

// If run directly
if (process.argv[1]?.endsWith('mcp-server.ts') || process.argv[1]?.endsWith('mcp-server.js')) {
  startMcpServer()
}
