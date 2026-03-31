/**
 * Output formatting — colored boxes, tool results, code blocks.
 */

// ── Colors ──

export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
}

// ── Tool call formatting ──

export function formatToolStart(toolName: string, icon: string, detail: string): string {
  return `\n  ${icon} ${c.cyan}${c.bold}${toolName}${c.reset}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`
}

export function formatToolSuccess(preview: string): string {
  return `  ${c.green}✓${c.reset} ${c.dim}${preview}${c.reset}`
}

export function formatToolError(message: string): string {
  return `  ${c.red}✗ ${message}${c.reset}`
}

export function formatCompressed(from: number, to: number): string {
  return `  ${c.dim}♻ Context compressed: ${from} → ${to} messages${c.reset}`
}

export function formatCost(text: string): string {
  return `  ${c.dim}${text}${c.reset}`
}

// ── Code block detection and highlighting ──

export function highlightCodeBlocks(text: string): string {
  // Simple code block highlighting: ```lang ... ```
  return text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const header = lang ? `${c.dim}── ${lang} ──${c.reset}\n` : ''
    const highlighted = code
      .split('\n')
      .map((line: string) => `  ${c.dim}│${c.reset} ${highlightLine(line, lang)}`)
      .join('\n')
    return `\n${header}${highlighted}\n${c.dim}──${c.reset}`
  })
}

function highlightLine(line: string, lang: string): string {
  if (!lang) return line

  // Basic keyword highlighting for common languages
  let result = line

  // Strings
  result = result.replace(/(["'`])(?:(?!\1).)*\1/g, `${c.green}$&${c.reset}`)

  // Comments
  result = result.replace(/(\/\/.*)$/gm, `${c.dim}$1${c.reset}`)
  result = result.replace(/(#.*)$/gm, `${c.dim}$1${c.reset}`)

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, `${c.yellow}$1${c.reset}`)

  // Keywords (JS/TS/Python)
  const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|def|self|True|False|None|try|except|raise)\b/g
  result = result.replace(keywords, `${c.magenta}$1${c.reset}`)

  return result
}

// ── Box drawing ──

export function box(content: string, title?: string, color = c.cyan): string {
  const cols = Math.min(process.stdout.columns ?? 80, 80)
  const inner = cols - 4
  const top = title
    ? `${color}╭─ ${title} ${'─'.repeat(Math.max(0, inner - title.length - 3))}╮${c.reset}`
    : `${color}╭${'─'.repeat(inner + 2)}╮${c.reset}`
  const bot = `${color}╰${'─'.repeat(inner + 2)}╯${c.reset}`

  const lines = content.split('\n').map(l => {
    const visible = stripAnsi(l)
    const pad = Math.max(0, inner - visible.length)
    return `${color}│${c.reset} ${l}${' '.repeat(pad)} ${color}│${c.reset}`
  })

  return [top, ...lines, bot].join('\n')
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// ── Diff preview ──

export function formatDiff(removed: string, added: string): string {
  const rmLines = removed.split('\n').slice(0, 5).map(l => `  ${c.red}- ${l}${c.reset}`)
  const addLines = added.split('\n').slice(0, 5).map(l => `  ${c.green}+ ${l}${c.reset}`)
  return [...rmLines, ...addLines].join('\n')
}
