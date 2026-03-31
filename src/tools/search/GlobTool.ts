import { resolve } from 'path'
import { glob } from 'glob'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'

const MAX_RESULTS = 200

export const GlobTool: Tool = {
  name: 'Glob',
  description: 'Find files matching a glob pattern (e.g. "**/*.ts", "src/**/*.test.js").',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'Glob',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern like "**/*.tsx" or "src/**/test_*.py"' },
          path: { type: 'string', description: 'Directory to search in (default: cwd)' },
        },
        required: ['pattern'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input, ctx): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    if (!pattern) return { output: 'Error: empty pattern', isError: true }

    const searchDir = input.path ? resolve(ctx.cwd, String(input.path)) : ctx.cwd

    try {
      const files = await glob(pattern, {
        cwd: searchDir,
        nodir: true,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/__pycache__/**'],
        maxDepth: 20,
      })

      if (files.length === 0) {
        return { output: `No files matched pattern "${pattern}" in ${searchDir}`, isError: false }
      }

      const sorted = files.sort()
      const limited = sorted.slice(0, MAX_RESULTS)
      let output = limited.join('\n')

      if (sorted.length > MAX_RESULTS) {
        output += `\n\n(${sorted.length - MAX_RESULTS} more files not shown, ${sorted.length} total)`
      } else {
        output += `\n\n(${sorted.length} files)`
      }

      return { output, isError: false }
    } catch (e: any) {
      return { output: `Glob error: ${e.message}`, isError: true }
    }
  },
}
