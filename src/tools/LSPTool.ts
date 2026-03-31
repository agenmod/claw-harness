import type { Tool, ToolResult, ToolContext } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'
import { LSPClient, detectLanguageServer } from '../services/lsp/LSPClient.js'

let clients = new Map<string, LSPClient>()

export const LSPTool: Tool = {
  name: 'LSP',
  description: 'Use Language Server Protocol for code intelligence: go-to-definition, find references, hover info. Supports TypeScript, Python, Rust, Go, etc.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'LSP',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['definition', 'references', 'hover'], description: 'LSP action' },
          file: { type: 'string', description: 'File path' },
          line: { type: 'number', description: 'Line number (1-based)' },
          column: { type: 'number', description: 'Column number (1-based)' },
        },
        required: ['action', 'file', 'line', 'column'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input, ctx): Promise<ToolResult> {
    const action = String(input.action ?? '')
    const file = String(input.file ?? '')
    const line = Number(input.line ?? 1)
    const column = Number(input.column ?? 1)

    if (!file) return { output: 'Error: file is required', isError: true }

    // Auto-detect and start language server
    const config = detectLanguageServer(file, ctx.cwd)
    if (!config) return { output: `No language server found for ${file}. Supported: .ts, .js, .py, .rs, .go, .java, .c, .cpp`, isError: true }

    const key = config.language
    if (!clients.has(key)) {
      const client = new LSPClient(config)
      const ok = await client.start()
      if (!ok) return { output: `Failed to start ${config.command}. Is it installed?`, isError: true }
      clients.set(key, client)
    }
    const client = clients.get(key)!

    try {
      if (action === 'definition') {
        const def = await client.getDefinition(file, line, column)
        if (!def) return { output: `No definition found at ${file}:${line}:${column}`, isError: false }
        return { output: `Definition: ${def.file}:${def.line}:${def.column}`, isError: false }
      }

      if (action === 'references') {
        const refs = await client.getReferences(file, line, column)
        if (refs.length === 0) return { output: 'No references found', isError: false }
        const list = refs.map(r => `  ${r.file}:${r.line}:${r.column}`).join('\n')
        return { output: `${refs.length} references:\n${list}`, isError: false }
      }

      if (action === 'hover') {
        const info = await client.getHover(file, line, column)
        return { output: info ?? 'No hover info available', isError: false }
      }

      return { output: `Unknown action: ${action}`, isError: true }
    } catch (e: any) {
      return { output: `LSP error: ${e.message}`, isError: true }
    }
  },
}
