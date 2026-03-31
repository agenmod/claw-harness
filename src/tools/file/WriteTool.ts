import { writeFile, mkdir, readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { existsSync } from 'fs'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'
import { snapshotBefore } from '../../utils/fileHistory.js'
import { isPlanMode } from '../PlanModeTool.js'

export const WriteTool: Tool = {
  name: 'Write',
  description: 'Create a new file or replace all contents of an existing file. For modifying part of a file, prefer Edit.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'Write',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          contents: { type: 'string', description: 'Full file contents' },
        },
        required: ['path', 'contents'],
      },
    }
  },

  needsConfirm() { return true },

  async run(input, ctx): Promise<ToolResult> {
    if (ctx.permissionMode === 'readonly' || isPlanMode()) {
      return { output: 'Blocked: readonly/plan mode', isError: true }
    }

    const p = resolve(ctx.cwd, String(input.path ?? ''))
    const contents = String(input.contents ?? '')

    try {
      // Snapshot existing file before overwriting
      if (existsSync(p)) snapshotBefore(p)

      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, contents, 'utf-8')

      const lines = contents.split('\n').length
      const isNew = !existsSync(p) ? ' (new file)' : ''
      return { output: `Wrote ${lines} lines to ${p}${isNew}`, isError: false }
    } catch (e: any) {
      return { output: `Write error: ${e.message}`, isError: true }
    }
  },
}
