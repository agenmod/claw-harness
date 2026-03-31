import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'

const STORE_DIR = join(homedir(), '.clawharness', 'tool-results')
const MAX_INLINE_CHARS = 30_000  // results larger than this are stored on disk

/**
 * If a tool result is too large to include inline (would waste context window),
 * save it to disk and return a reference instead.
 */
export function budgetToolResult(output: string, toolName: string): { content: string; stored: boolean } {
  if (output.length <= MAX_INLINE_CHARS) {
    return { content: output, stored: false }
  }

  // Store full result on disk
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })
  const id = randomUUID().slice(0, 8)
  const filename = `${toolName}-${id}.txt`
  const filepath = join(STORE_DIR, filename)
  writeFileSync(filepath, output, 'utf-8')

  // Return preview + reference
  const lines = output.split('\n')
  const headLines = lines.slice(0, 50).join('\n')
  const tailLines = lines.slice(-20).join('\n')

  const preview = [
    `[Result too large (${(output.length / 1024).toFixed(0)}KB, ${lines.length} lines) — saved to ${filepath}]`,
    ``,
    `First 50 lines:`,
    headLines,
    ``,
    `... (${lines.length - 70} lines omitted) ...`,
    ``,
    `Last 20 lines:`,
    tailLines,
  ].join('\n')

  return { content: preview, stored: true }
}
