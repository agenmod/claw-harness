/**
 * Read-only mode validation for Bash commands.
 * In readonly/plan mode, only commands that provably don't modify state are allowed.
 */

import { analyzeCommandSemantics, type CommandAnalysis } from './commandSemantics.js'

/**
 * Check whether a command is safe to run in readonly mode.
 * Returns null if allowed, or an error message if blocked.
 */
export function validateReadOnly(command: string): string | null {
  // Split compound commands and check each
  const parts = splitPipeline(command)

  for (const part of parts) {
    const analysis = analyzeCommandSemantics(part.trim())

    if (!analysis.isReadOnly) {
      return `Blocked in readonly mode: "${part.trim().slice(0, 60)}..." is a ${analysis.category} operation (${analysis.reason})`
    }

    // Extra checks for edge cases
    const edgeCheck = checkEdgeCases(part.trim())
    if (edgeCheck) return edgeCheck
  }

  return null // allowed
}

function checkEdgeCases(cmd: string): string | null {
  // find -exec with write commands
  if (/\bfind\b.*-exec\b/.test(cmd)) {
    const execPart = cmd.match(/-exec\s+(.+?)(?:\s*[;+]|$)/)?.[1]
    if (execPart) {
      const innerAnalysis = analyzeCommandSemantics(execPart)
      if (!innerAnalysis.isReadOnly) {
        return `Blocked: find -exec contains write operation: ${execPart.slice(0, 50)}`
      }
    }
  }

  // xargs with write commands
  if (/\bxargs\b/.test(cmd)) {
    const xargsPart = cmd.match(/xargs\s+(?:-[^\s]+\s+)*(.+)/)?.[1]
    if (xargsPart) {
      const innerAnalysis = analyzeCommandSemantics(xargsPart)
      if (!innerAnalysis.isReadOnly) {
        return `Blocked: xargs contains write operation: ${xargsPart.slice(0, 50)}`
      }
    }
  }

  // Subshell with write commands
  if (/\$\(.*\)/.test(cmd)) {
    const subshell = cmd.match(/\$\((.+?)\)/)?.[1]
    if (subshell) {
      const innerAnalysis = analyzeCommandSemantics(subshell)
      if (!innerAnalysis.isReadOnly) {
        return `Blocked: subshell contains write operation: ${subshell.slice(0, 50)}`
      }
    }
  }

  // Output redirection (always writes)
  if (/[^>]>\s*[^>|&\s]/.test(cmd)) {
    return `Blocked: output redirection (file write)`
  }
  if (/>>/.test(cmd)) {
    return `Blocked: append redirection (file write)`
  }

  // tee (writes to files)
  if (/\btee\b/.test(cmd) && !/\btee\s+\/dev\/null\b/.test(cmd)) {
    return `Blocked: tee writes to files`
  }

  return null
}

/**
 * Split a pipeline into individual commands.
 * "cmd1 | cmd2 | cmd3" → ["cmd1", "cmd2", "cmd3"]
 * Also handles && and || and ;
 */
function splitPipeline(cmd: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0  // parentheses depth
  let inSingle = false, inDouble = false, escape = false

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!

    if (escape) { current += ch; escape = false; continue }
    if (ch === '\\') { escape = true; current += ch; continue }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue }

    if (!inSingle && !inDouble) {
      if (ch === '(' || ch === '{') { depth++; current += ch; continue }
      if (ch === ')' || ch === '}') { depth--; current += ch; continue }

      if (depth === 0) {
        if (ch === '|' && cmd[i + 1] !== '|') {
          parts.push(current); current = ''; continue
        }
        if (ch === '|' && cmd[i + 1] === '|') {
          parts.push(current); current = ''; i++; continue
        }
        if (ch === '&' && cmd[i + 1] === '&') {
          parts.push(current); current = ''; i++; continue
        }
        if (ch === ';') {
          parts.push(current); current = ''; continue
        }
      }
    }

    current += ch
  }

  if (current.trim()) parts.push(current)
  return parts
}
