import { execSync } from 'child_process'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'

export const GrepTool: Tool = {
  name: 'Grep',
  description: 'Search file contents for a regex pattern. Uses ripgrep (rg) if available, otherwise grep -rn.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'Grep',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory or file to search in (default: cwd)' },
          include: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
        },
        required: ['pattern'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input, ctx): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    const searchPath = String(input.path ?? '.')
    const include = input.include ? String(input.include) : ''
    if (!pattern) return { output: 'Empty pattern', isError: true }

    const hasRg = (() => { try { execSync('which rg', { encoding: 'utf-8' }); return true } catch { return false } })()

    let cmd: string
    if (hasRg) {
      cmd = `rg -n --max-count=200 ${include ? `--glob '${include}'` : ''} -- ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)}`
    } else {
      cmd = `grep -rn ${include ? `--include='${include}'` : ''} -E ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} | head -200`
    }

    try {
      const out = execSync(cmd, { cwd: ctx.cwd, timeout: 15_000, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }).trim()
      return { output: out || 'No matches found', isError: false }
    } catch (e: any) {
      if (e.status === 1) return { output: 'No matches found', isError: false }
      return { output: `Grep error: ${e.message?.slice(0, 300)}`, isError: true }
    }
  },
}
