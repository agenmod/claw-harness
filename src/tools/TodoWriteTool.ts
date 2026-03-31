import type { Tool, ToolResult, ToolContext } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

type TodoItem = { id: string; content: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }

const todos: TodoItem[] = []

export const TodoWriteTool: Tool = {
  name: 'TodoWrite',
  description: 'Create or update a structured task list to track progress on complex tasks.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'TodoWrite',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'Array of todo items with id, content, status',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                content: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
              },
              required: ['id', 'content', 'status'],
            },
          },
        },
        required: ['todos'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input): Promise<ToolResult> {
    const items = input.todos as TodoItem[] | undefined
    if (!Array.isArray(items)) return { output: 'Error: todos must be an array', isError: true }

    for (const item of items) {
      const idx = todos.findIndex(t => t.id === item.id)
      if (idx >= 0) {
        todos[idx] = { ...todos[idx], ...item }
      } else {
        todos.push(item)
      }
    }

    const display = todos.map(t => {
      const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : t.status === 'cancelled' ? '✗' : '○'
      return `  ${icon} [${t.id}] ${t.content}`
    }).join('\n')

    return { output: `Todo list (${todos.length} items):\n${display}`, isError: false }
  },
}
