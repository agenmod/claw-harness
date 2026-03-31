import { spawn } from 'child_process'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'
import { analyzeCommand, isCommandBlocked, validatePath, extractPaths } from './security.js'

const DEFAULT_TIMEOUT = 30_000
const MAX_OUTPUT = 100_000 // chars

export const BashTool: Tool = {
  name: 'Bash',
  description: 'Run a shell command and return stdout/stderr. Use for: running scripts, git operations, installing packages, building, testing, etc.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'Bash',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
          cwd: { type: 'string', description: 'Working directory override (optional)' },
        },
        required: ['command'],
      },
    }
  },

  needsConfirm(input) {
    const cmd = String(input.command ?? '')
    const result = analyzeCommand(cmd)
    return result.level === 'confirm' || result.level === 'block'
  },

  async run(input, ctx): Promise<ToolResult> {
    const command = String(input.command ?? '').trim()
    const timeout = Number(input.timeout) || DEFAULT_TIMEOUT
    const workDir = input.cwd ? String(input.cwd) : ctx.cwd

    if (!command) return { output: 'Error: empty command', isError: true }

    // Readonly mode blocks everything except explicitly safe reads
    if (ctx.permissionMode === 'readonly') {
      const analysis = analyzeCommand(command, ctx.cwd)
      if (analysis.category !== 'read') {
        return { output: `Blocked in readonly mode: ${analysis.reason ?? 'not a read command'}`, isError: true }
      }
    }

    // Hard block on catastrophic commands
    const blocked = isCommandBlocked(command, ctx.cwd)
    if (blocked) {
      return { output: `BLOCKED: ${blocked}. This command is too dangerous.`, isError: true }
    }

    // Validate paths
    const paths = extractPaths(command)
    for (const p of paths) {
      const pathCheck = validatePath(p, ctx.cwd)
      if (pathCheck.level === 'block') {
        return { output: `BLOCKED: ${pathCheck.reason}`, isError: true }
      }
    }

    return new Promise(resolve => {
      let stdout = ''
      let stderr = ''
      let killed = false

      const proc = spawn('sh', ['-c', command], {
        cwd: workDir,
        timeout,
        env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout.on('data', (d: Buffer) => {
        const chunk = d.toString()
        if (stdout.length < MAX_OUTPUT) stdout += chunk
      })

      proc.stderr.on('data', (d: Buffer) => {
        const chunk = d.toString()
        if (stderr.length < MAX_OUTPUT) stderr += chunk
      })

      const timer = setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 2000)
      }, timeout)

      proc.on('close', (code) => {
        clearTimeout(timer)

        if (killed) {
          resolve({ output: `Command timed out after ${timeout}ms. Partial output:\n${(stdout + stderr).slice(0, 2000)}`, isError: true })
          return
        }

        let output = ''
        if (stdout.trim()) output += stdout.trim()
        if (stderr.trim()) {
          if (output) output += '\n'
          output += stderr.trim()
        }

        // Truncate very long output
        if (output.length > MAX_OUTPUT) {
          const half = Math.floor(MAX_OUTPUT / 2)
          output = output.slice(0, half) + `\n\n... (${output.length - MAX_OUTPUT} chars omitted) ...\n\n` + output.slice(-half)
        }

        if (!output) output = code === 0 ? '(no output)' : `Exit code: ${code}`

        resolve({ output, isError: code !== 0 })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({ output: `Spawn error: ${err.message}`, isError: true })
      })
    })
  },
}
