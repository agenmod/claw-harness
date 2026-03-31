import type { Tool, ToolResult } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'
import type { ToolRegistry } from './ToolRegistry.js'

let registryRef: ToolRegistry | null = null

export function setToolSearchRegistry(reg: ToolRegistry) { registryRef = reg }

/**
 * Tool for discovering available tools by keyword search.
 * Useful when the model isn't sure which tool to use.
 */
export const ToolSearchTool: Tool = {
  name: 'ToolSearch',
  description: 'Search for available tools by keyword. Use when you need to find the right tool for a task.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'ToolSearch',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword to search for (e.g. "edit file", "search code", "notebook")' },
        },
        required: ['query'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input): Promise<ToolResult> {
    const query = String(input.query ?? '').toLowerCase()
    if (!query || !registryRef) return { output: 'Error: empty query or registry not available', isError: true }

    const all = registryRef.all()
    const matches = all.filter(t => {
      const text = `${t.name} ${t.description}`.toLowerCase()
      return query.split(/\s+/).some(word => text.includes(word))
    })

    if (matches.length === 0) {
      return { output: `No tools match "${query}". Available: ${all.map(t => t.name).join(', ')}`, isError: false }
    }

    const result = matches.map(t => `- **${t.name}**: ${t.description}`).join('\n')
    return { output: `Tools matching "${query}":\n${result}`, isError: false }
  },
}
