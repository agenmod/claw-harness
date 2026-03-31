/**
 * ASCII art banner and startup display.
 */

const LOGO = `
\x1b[38;5;196m   ██████╗██╗      █████╗ ██╗    ██╗\x1b[0m
\x1b[38;5;202m  ██╔════╝██║     ██╔══██╗██║    ██║\x1b[0m
\x1b[38;5;208m  ██║     ██║     ███████║██║ █╗ ██║\x1b[0m
\x1b[38;5;214m  ██║     ██║     ██╔══██║██║███╗██║\x1b[0m
\x1b[38;5;220m  ╚██████╗███████╗██║  ██║╚███╔███╔╝\x1b[0m
\x1b[38;5;226m   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝\x1b[0m
\x1b[38;5;203m  ██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗\x1b[0m
\x1b[38;5;204m  ██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝\x1b[0m
\x1b[38;5;205m  ███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗\x1b[0m
\x1b[38;5;206m  ██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║\x1b[0m
\x1b[38;5;207m  ██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║\x1b[0m
\x1b[38;5;208m  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝\x1b[0m`

const LOGO_SMALL = `\x1b[38;5;208m🦞 ClawHarness\x1b[0m`

export function printBanner(opts: {
  version: string
  model: string
  provider: string
  mode: string
  cwd: string
  toolCount: number
  isGit: boolean
  compact?: boolean
}) {
  const cols = process.stdout.columns ?? 80

  if (cols >= 70 && !opts.compact) {
    console.log(LOGO)
  } else {
    console.log(`\n  ${LOGO_SMALL}`)
  }

  const line = '\x1b[90m' + '─'.repeat(Math.min(cols - 4, 66)) + '\x1b[0m'
  console.log(`  ${line}`)

  const tag = (label: string, value: string, color = '36') =>
    `  \x1b[90m${label}:\x1b[0m \x1b[${color}m${value}\x1b[0m`

  console.log(tag('Model', `${opts.model}`, '33'))
  console.log(tag('Provider', opts.provider))
  console.log(tag('Mode', opts.mode, opts.mode === 'trust' ? '31' : opts.mode === 'readonly' ? '34' : '32'))
  console.log(tag('Tools', `${opts.toolCount}`))
  console.log(tag('CWD', shortenPath(opts.cwd)))

  if (opts.isGit) {
    const branch = getGitBranch(opts.cwd)
    if (branch) console.log(tag('Git', `${branch}`, '35'))
  }

  console.log(`  ${line}`)
  console.log(`  \x1b[90m💡 Type \x1b[36m/help\x1b[90m for commands · \x1b[36m/model\x1b[90m to switch · \x1b[36m/quit\x1b[90m to exit\x1b[0m`)
  console.log()
}

function shortenPath(p: string): string {
  const home = process.env.HOME ?? ''
  if (home && p.startsWith(home)) return '~' + p.slice(home.length)
  return p
}

function getGitBranch(cwd: string): string | null {
  try {
    const { execSync } = require('child_process')
    return execSync('git branch --show-current', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch { return null }
}
