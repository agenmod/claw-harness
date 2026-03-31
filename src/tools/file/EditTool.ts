import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'
import { snapshotBefore } from '../../utils/fileHistory.js'
import { isPlanMode } from '../PlanModeTool.js'

export const EditTool: Tool = {
  name: 'Edit',
  description: 'Replace an exact string in a file. old_string must appear exactly once (unless replace_all). Include 3+ lines of context for uniqueness.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'Edit',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File to edit' },
          old_string: { type: 'string', description: 'Exact text to find (must be unique unless replace_all=true)' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    }
  },

  needsConfirm() { return true },

  async run(input, ctx): Promise<ToolResult> {
    if (ctx.permissionMode === 'readonly' || isPlanMode()) {
      return { output: 'Blocked: readonly/plan mode', isError: true }
    }

    const p = resolve(ctx.cwd, String(input.path ?? ''))
    const old = String(input.old_string ?? '')
    const rep = String(input.new_string ?? '')
    const replaceAll = Boolean(input.replace_all)

    if (!old) return { output: 'Error: old_string is empty', isError: true }
    if (old === rep) return { output: 'Error: old_string and new_string are identical', isError: true }

    try {
      const src = await readFile(p, 'utf-8')
      const count = countOccurrences(src, old)

      if (count === 0) {
        // Try to help debug: fuzzy match
        const hint = findFuzzyMatch(src, old)
        return {
          output: `old_string not found in ${p}.${hint ? `\n\nDid you mean:\n${hint}` : '\nCheck whitespace and indentation match exactly.'}`,
          isError: true,
        }
      }

      if (count > 1 && !replaceAll) {
        // Show where the duplicates are
        const locations = findLocations(src, old)
        return {
          output: `old_string found ${count} times at lines: ${locations.join(', ')}. Add more context to make it unique, or set replace_all=true.`,
          isError: true,
        }
      }

      // Snapshot before editing
      snapshotBefore(p)

      const updated = replaceAll ? src.split(old).join(rep) : src.replace(old, rep)
      await writeFile(p, updated, 'utf-8')

      // Generate mini-diff for confirmation
      const oldLines = old.split('\n').length
      const newLines = rep.split('\n').length
      const detail = replaceAll ? ` (${count} occurrences)` : ''

      // Show context of what changed
      const changePreview = generateChangePreview(src, updated, old, rep)

      return {
        output: `Edited ${p}: ${oldLines}→${newLines} lines${detail}\n${changePreview}`,
        isError: false,
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') return { output: `File not found: ${p}. Use Write to create new files.`, isError: true }
      return { output: `Edit error: ${e.message}`, isError: true }
    }
  },
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

function findLocations(src: string, needle: string): number[] {
  const lines: number[] = []
  let pos = 0
  while ((pos = src.indexOf(needle, pos)) !== -1) {
    const lineNum = src.substring(0, pos).split('\n').length
    lines.push(lineNum)
    pos += needle.length
  }
  return lines
}

function findFuzzyMatch(src: string, needle: string): string | null {
  // Try matching first and last line of the needle
  const needleLines = needle.split('\n')
  if (needleLines.length < 1) return null

  const firstLine = needleLines[0]!.trim()
  if (!firstLine) return null

  const srcLines = src.split('\n')
  for (let i = 0; i < srcLines.length; i++) {
    if (srcLines[i]!.trim() === firstLine) {
      // Found first line match — show surrounding context
      const start = Math.max(0, i - 1)
      const end = Math.min(srcLines.length, i + needleLines.length + 1)
      return srcLines.slice(start, end).map((l, j) => `  ${start + j + 1}| ${l}`).join('\n')
    }
  }
  return null
}

function generateChangePreview(before: string, after: string, old: string, rep: string): string {
  const oldPreview = old.split('\n').slice(0, 5).map(l => `  - ${l}`).join('\n')
  const newPreview = rep.split('\n').slice(0, 5).map(l => `  + ${l}`).join('\n')
  const omittedOld = old.split('\n').length > 5 ? `\n  ... (${old.split('\n').length - 5} more lines)` : ''
  const omittedNew = rep.split('\n').length > 5 ? `\n  ... (${rep.split('\n').length - 5} more lines)` : ''
  return `${oldPreview}${omittedOld}\n${newPreview}${omittedNew}`
}
