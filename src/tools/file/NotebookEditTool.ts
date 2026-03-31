import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'

export const NotebookEditTool: Tool = {
  name: 'NotebookEdit',
  description: 'Edit a Jupyter notebook cell. Can replace content of an existing cell or insert a new cell.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'NotebookEdit',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the .ipynb file' },
          cell_index: { type: 'number', description: 'Cell index (0-based)' },
          new_source: { type: 'string', description: 'New cell source content' },
          cell_type: { type: 'string', description: 'Cell type: "code" or "markdown" (default: code)' },
          insert: { type: 'boolean', description: 'If true, insert a new cell at cell_index instead of replacing' },
        },
        required: ['path', 'cell_index', 'new_source'],
      },
    }
  },

  needsConfirm() { return true },

  async run(input, ctx): Promise<ToolResult> {
    if (ctx.permissionMode === 'readonly') return { output: 'Blocked: readonly mode', isError: true }

    const p = resolve(ctx.cwd, String(input.path ?? ''))
    const idx = Number(input.cell_index ?? 0)
    const src = String(input.new_source ?? '')
    const cellType = String(input.cell_type ?? 'code')
    const insert = Boolean(input.insert)

    try {
      const raw = JSON.parse(await readFile(p, 'utf-8'))
      if (!Array.isArray(raw.cells)) return { output: 'Invalid notebook: no cells array', isError: true }

      const newCell = {
        cell_type: cellType,
        metadata: {},
        source: src.split('\n').map((l, i, a) => i < a.length - 1 ? l + '\n' : l),
        ...(cellType === 'code' ? { outputs: [], execution_count: null } : {}),
      }

      if (insert) {
        raw.cells.splice(idx, 0, newCell)
      } else {
        if (idx >= raw.cells.length) return { output: `Cell index ${idx} out of range (${raw.cells.length} cells)`, isError: true }
        raw.cells[idx] = { ...raw.cells[idx], ...newCell }
      }

      await writeFile(p, JSON.stringify(raw, null, 1) + '\n', 'utf-8')
      return { output: `${insert ? 'Inserted' : 'Updated'} cell ${idx} in ${p}`, isError: false }
    } catch (e: any) {
      return { output: `Notebook error: ${e.message}`, isError: true }
    }
  },
}
