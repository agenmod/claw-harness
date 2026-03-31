import { createInterface } from 'readline'
import type { Tool, ToolResult, ToolContext } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

export const AskUserTool: Tool = {
  name: 'AskUser',
  description: 'Ask the user a question and wait for their response. Use when you need clarification or confirmation.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'AskUser',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask the user' },
        },
        required: ['question'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input): Promise<ToolResult> {
    const question = String(input.question ?? '')
    if (!question) return { output: 'Error: empty question', isError: true }

    return new Promise(resolve => {
      const rl = createInterface({ input: process.stdin, output: process.stderr })
      process.stderr.write(`\n\x1b[33m? ${question}\x1b[0m\n`)
      rl.question('> ', answer => {
        rl.close()
        resolve({ output: answer.trim() || '(no response)', isError: false })
      })
    })
  },
}
