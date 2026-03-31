import { readFile, stat } from 'fs/promises'
import { resolve, extname } from 'path'
import { execSync } from 'child_process'
import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'

const MAX_SIZE = 2 * 1024 * 1024
const MAX_LINES = 5000

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg', '.avif',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.zst',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.o', '.obj',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.sqlite', '.db', '.mdb',
  '.pyc', '.pyo', '.class', '.wasm',
  '.DS_Store', '.ico',
])

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'])

export const ReadTool: Tool = {
  name: 'Read',
  description: 'Read the contents of a text file with line numbers. For large files use offset/limit. Detects binary files.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'Read',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          offset: { type: 'number', description: 'Start line (1-based, default: 1)' },
          limit: { type: 'number', description: 'Max lines to return (default: all, max 5000)' },
        },
        required: ['path'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input, ctx): Promise<ToolResult> {
    const p = resolve(ctx.cwd, String(input.path ?? ''))
    const ext = extname(p).toLowerCase()

    // Image files — describe instead of reading
    if (IMAGE_EXT.has(ext)) {
      try {
        const s = await stat(p)
        const sizeKB = (s.size / 1024).toFixed(0)
        // Try to get dimensions via file command
        let dims = ''
        try {
          const info = execSync(`file "${p}"`, { encoding: 'utf-8', timeout: 3000 }).trim()
          const m = info.match(/(\d+)\s*x\s*(\d+)/)
          if (m) dims = `, ${m[1]}x${m[2]}`
        } catch {}
        return { output: `Image file: ${ext} (${sizeKB}KB${dims}). Cannot display text content. Use Bash to manipulate if needed.`, isError: false }
      } catch (e: any) {
        return { output: `Error: ${e.message}`, isError: true }
      }
    }

    // PDF — try to extract text
    if (ext === '.pdf') {
      return this.readPdf(p)
    }

    // Known binary
    if (BINARY_EXT.has(ext)) {
      return { output: `Binary file (${ext}). Use "file" or "xxd" via Bash to inspect.`, isError: true }
    }

    try {
      const s = await stat(p)
      if (s.isDirectory()) return { output: `"${p}" is a directory. Use Glob to list or Bash "ls -la".`, isError: true }
      if (!s.isFile()) return { output: `Not a regular file: ${p}`, isError: true }
      if (s.size > MAX_SIZE) return { output: `File too large (${(s.size / 1024 / 1024).toFixed(1)}MB). Use offset+limit, or Bash "head -100 '${p}'"`, isError: true }
      if (s.size === 0) return { output: '(empty file)', isError: false }

      const raw = await readFile(p, 'utf-8')

      // Detect binary (null bytes in first 8KB)
      if (raw.slice(0, 8192).includes('\0')) {
        return { output: `Binary content (contains null bytes). Use Bash "xxd" or "file" to inspect.`, isError: true }
      }

      const allLines = raw.split('\n')
      const totalLines = allLines.length
      const off = Math.max(1, Number(input.offset) || 1)
      const requestedLimit = Number(input.limit) || 0
      const lim = requestedLimit > 0 ? Math.min(requestedLimit, MAX_LINES) : Math.min(totalLines, MAX_LINES)
      const slice = allLines.slice(off - 1, off - 1 + lim)

      const numbered = slice.map((line, i) => `${String(off + i).padStart(6)}|${line}`).join('\n')

      let header = ''
      if (totalLines > lim || off > 1) {
        header = `[Lines ${off}–${off + slice.length - 1} of ${totalLines}]\n`
      }

      let footer = ''
      if (totalLines > MAX_LINES && !requestedLimit) {
        footer = `\n\n(Showing first ${MAX_LINES} of ${totalLines} lines. Use offset/limit for more.)`
      }

      return { output: `${header}${numbered}${footer}`, isError: false }
    } catch (e: any) {
      if (e.code === 'ENOENT') return { output: `File not found: ${p}`, isError: true }
      if (e.code === 'EACCES') return { output: `Permission denied: ${p}`, isError: true }
      if (e.code === 'EISDIR') return { output: `"${p}" is a directory.`, isError: true }
      return { output: `Read error: ${e.message}`, isError: true }
    }
  },

  async readPdf(p: string): Promise<ToolResult> {
    // Try pdftotext (poppler)
    try {
      const text = execSync(`pdftotext "${p}" - 2>/dev/null | head -500`, {
        encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024,
      }).trim()
      if (text) return { output: `[PDF extracted text]\n${text}`, isError: false }
    } catch {}

    // Try python pdfminer
    try {
      const text = execSync(`python3 -c "from pdfminer.high_level import extract_text; print(extract_text('${p}')[:20000])" 2>/dev/null`, {
        encoding: 'utf-8', timeout: 15_000,
      }).trim()
      if (text) return { output: `[PDF extracted text]\n${text}`, isError: false }
    } catch {}

    const s = await stat(p)
    return { output: `PDF file (${(s.size / 1024).toFixed(0)}KB). Install pdftotext for text extraction: brew install poppler`, isError: false }
  },
} as Tool & { readPdf: (p: string) => Promise<ToolResult> }
