import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Tool, ToolResult, ToolContext } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

let activeWorktree: { path: string; branch: string; originalCwd: string } | null = null

export function getActiveWorktree() { return activeWorktree }

export const EnterWorktreeTool: Tool = {
  name: 'EnterWorktree',
  description: 'Create a git worktree for isolated work. Changes happen on a separate branch without affecting the main working directory.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'EnterWorktree',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch name for the worktree (default: auto-generated)' },
          baseBranch: { type: 'string', description: 'Base branch to create from (default: current HEAD)' },
        },
      },
    }
  },

  needsConfirm() { return true },

  async run(input, ctx): Promise<ToolResult> {
    if (activeWorktree) {
      return { output: `Already in worktree at ${activeWorktree.path} (branch: ${activeWorktree.branch}). ExitWorktree first.`, isError: true }
    }

    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: ctx.cwd, stdio: 'ignore' })
    } catch {
      return { output: 'Not a git repository. Worktree requires git.', isError: true }
    }

    const branch = String(input.branch ?? `ch-worktree-${Date.now()}`)
    const baseBranch = input.baseBranch ? String(input.baseBranch) : ''
    const wtPath = join(ctx.cwd, '.clawharness-worktrees', branch)

    try {
      mkdirSync(join(ctx.cwd, '.clawharness-worktrees'), { recursive: true })

      const createCmd = baseBranch
        ? `git worktree add -b "${branch}" "${wtPath}" "${baseBranch}"`
        : `git worktree add -b "${branch}" "${wtPath}"`

      execSync(createCmd, { cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe' })

      activeWorktree = { path: wtPath, branch, originalCwd: ctx.cwd }

      return {
        output: `Created worktree at ${wtPath} on branch "${branch}". All subsequent file operations will use this worktree.`,
        isError: false,
      }
    } catch (e: any) {
      return { output: `Worktree error: ${e.message}`, isError: true }
    }
  },
}

export const ExitWorktreeTool: Tool = {
  name: 'ExitWorktree',
  description: 'Exit the current git worktree and optionally merge changes back.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'ExitWorktree',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          merge: { type: 'boolean', description: 'Merge worktree branch back to original branch (default: false)' },
          cleanup: { type: 'boolean', description: 'Remove the worktree directory (default: true)' },
        },
      },
    }
  },

  needsConfirm() { return true },

  async run(input): Promise<ToolResult> {
    if (!activeWorktree) {
      return { output: 'Not in a worktree. Use EnterWorktree first.', isError: true }
    }

    const { path: wtPath, branch, originalCwd } = activeWorktree
    const shouldMerge = Boolean(input.merge)
    const shouldCleanup = input.cleanup !== false

    try {
      if (shouldMerge) {
        // Commit any uncommitted changes in worktree
        try {
          execSync('git add -A && git diff --cached --quiet || git commit -m "CodeHarness worktree changes"', {
            cwd: wtPath, encoding: 'utf-8', stdio: 'pipe',
          })
        } catch {}

        // Merge back
        const currentBranch = execSync('git branch --show-current', { cwd: originalCwd, encoding: 'utf-8' }).trim()
        execSync(`git merge "${branch}"`, { cwd: originalCwd, encoding: 'utf-8', stdio: 'pipe' })
      }

      if (shouldCleanup) {
        execSync(`git worktree remove "${wtPath}" --force`, { cwd: originalCwd, stdio: 'pipe' })
        try { execSync(`git branch -d "${branch}"`, { cwd: originalCwd, stdio: 'pipe' }) } catch {}
      }

      activeWorktree = null

      return {
        output: `Exited worktree.${shouldMerge ? ' Changes merged.' : ''}${shouldCleanup ? ' Worktree cleaned up.' : ''}`,
        isError: false,
      }
    } catch (e: any) {
      activeWorktree = null
      return { output: `Exit worktree error: ${e.message}`, isError: true }
    }
  },
}
