/**
 * Bash command security analysis — comprehensive version.
 * Classifies commands and validates paths to prevent damage.
 */

import { resolve, relative, isAbsolute } from 'path'
import { existsSync } from 'fs'

// ── Types ──

export type SecurityLevel = 'safe' | 'confirm' | 'block'

export interface SecurityResult {
  level: SecurityLevel
  reason?: string
  category?: 'read' | 'write' | 'destroy' | 'network' | 'system' | 'unknown'
}

// ── Blocked: never allowed ──

const BLOCKED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bmkfs\b/, reason: 'filesystem format' },
  { pattern: /\bdd\s+if=.*of=\/dev\//, reason: 'raw disk write' },
  { pattern: />\s*\/dev\/sd/, reason: 'raw device write' },
  { pattern: /\bshutdown\b/, reason: 'system shutdown' },
  { pattern: /\breboot\b/, reason: 'system reboot' },
  { pattern: /\binit\s+[06]\b/, reason: 'system halt/reboot' },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'fork bomb' },
  { pattern: /\bchmod\s+.*777\s+\/($|\s)/, reason: 'chmod 777 on root' },
  { pattern: /\brm\s+(-[^\s]*\s+)*\/$/, reason: 'rm on root directory' },
  { pattern: /\brm\s+(-[^\s]*\s+)*\/\s/, reason: 'rm on root directory' },
  { pattern: />\s*\/etc\/passwd/, reason: 'overwrite passwd' },
  { pattern: />\s*\/etc\/shadow/, reason: 'overwrite shadow' },
  { pattern: /\bcrontab\s+-r\b/, reason: 'remove all crontabs' },
  { pattern: /\blaunchctl\s+unload\b.*-w/, reason: 'disable system service' },
]

// ── Needs confirmation ──

const CONFIRM: Array<{ pattern: RegExp; reason: string; category: SecurityResult['category'] }> = [
  // File destruction
  { pattern: /\brm\s+/, reason: 'file deletion', category: 'destroy' },
  { pattern: /\brmdir\b/, reason: 'directory removal', category: 'destroy' },
  { pattern: /\btruncate\b/, reason: 'file truncation', category: 'destroy' },
  { pattern: /\bshred\b/, reason: 'secure file deletion', category: 'destroy' },

  // Git dangerous ops
  { pattern: /\bgit\s+push\s+.*--force/, reason: 'force push', category: 'destroy' },
  { pattern: /\bgit\s+push\s+.*-f\b/, reason: 'force push', category: 'destroy' },
  { pattern: /\bgit\s+reset\s+--hard/, reason: 'hard reset', category: 'destroy' },
  { pattern: /\bgit\s+clean\s+-[^\s]*f/, reason: 'git clean (removes files)', category: 'destroy' },
  { pattern: /\bgit\s+checkout\s+--\s+\./, reason: 'discard all changes', category: 'destroy' },
  { pattern: /\bgit\s+stash\s+drop/, reason: 'drop stash', category: 'destroy' },
  { pattern: /\bgit\s+branch\s+-[dD]\b/, reason: 'delete branch', category: 'write' },
  { pattern: /\bgit\s+rebase\b/, reason: 'rebase', category: 'write' },

  // Elevated privileges
  { pattern: /\bsudo\b/, reason: 'elevated privileges', category: 'system' },
  { pattern: /\bsu\s+-?\s*\w/, reason: 'switch user', category: 'system' },
  { pattern: /\bdoas\b/, reason: 'elevated privileges', category: 'system' },

  // File modification via tools
  { pattern: /\bsed\s+-i/, reason: 'in-place edit via sed', category: 'write' },
  { pattern: /\bawk\s+-i\s+inplace\b/, reason: 'in-place edit via awk', category: 'write' },
  { pattern: /\bperl\s+-[^\s]*i/, reason: 'in-place edit via perl', category: 'write' },
  { pattern: /\bmv\s+/, reason: 'move/rename', category: 'write' },
  { pattern: /\bcp\s+-[^\s]*r/, reason: 'recursive copy', category: 'write' },

  // Output redirection (overwrite)
  { pattern: /[^>]>\s*[^>|&\s]/, reason: 'file overwrite redirect', category: 'write' },

  // Permissions
  { pattern: /\bchmod\b/, reason: 'permission change', category: 'system' },
  { pattern: /\bchown\b/, reason: 'ownership change', category: 'system' },
  { pattern: /\bchgrp\b/, reason: 'group change', category: 'system' },

  // Process management
  { pattern: /\bkill\s+-9\b/, reason: 'force kill', category: 'system' },
  { pattern: /\bkillall\b/, reason: 'kill by name', category: 'system' },
  { pattern: /\bpkill\b/, reason: 'kill by pattern', category: 'system' },

  // Network
  { pattern: /\bcurl\b.*\|\s*(ba)?sh/, reason: 'pipe URL to shell', category: 'network' },
  { pattern: /\bwget\b.*\|\s*(ba)?sh/, reason: 'pipe URL to shell', category: 'network' },
  { pattern: /\bcurl\b.*-[^\s]*o/, reason: 'download file', category: 'network' },

  // Package management (can install arbitrary code)
  { pattern: /\bnpm\s+publish\b/, reason: 'npm publish', category: 'network' },
  { pattern: /\bnpm\s+exec\b/, reason: 'npm exec', category: 'system' },
  { pattern: /\bnpx\b/, reason: 'npx execution', category: 'system' },
  { pattern: /\bpip\s+install\b/, reason: 'pip install', category: 'network' },
  { pattern: /\bgem\s+install\b/, reason: 'gem install', category: 'network' },
  { pattern: /\bcargo\s+install\b/, reason: 'cargo install', category: 'network' },

  // Docker
  { pattern: /\bdocker\s+rm\b/, reason: 'docker remove', category: 'destroy' },
  { pattern: /\bdocker\s+rmi\b/, reason: 'docker remove image', category: 'destroy' },
  { pattern: /\bdocker\s+system\s+prune/, reason: 'docker prune', category: 'destroy' },
  { pattern: /\bdocker\s+run\b.*--privileged/, reason: 'privileged container', category: 'system' },

  // Database
  { pattern: /\bdropdb\b/, reason: 'drop database', category: 'destroy' },
  { pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA)/i, reason: 'SQL drop', category: 'destroy' },
  { pattern: /\bTRUNCATE\s+TABLE/i, reason: 'SQL truncate', category: 'destroy' },
  { pattern: /\bDELETE\s+FROM\b/i, reason: 'SQL delete', category: 'destroy' },

  // Service management
  { pattern: /\bsystemctl\s+(stop|restart|disable|mask)/, reason: 'service management', category: 'system' },
  { pattern: /\blaunchctl\b/, reason: 'macOS service management', category: 'system' },
  { pattern: /\biptables\b/, reason: 'firewall rules', category: 'system' },
  { pattern: /\bufw\b/, reason: 'firewall rules', category: 'system' },

  // Env/config danger
  { pattern: /\bexport\s+PATH=/, reason: 'PATH modification', category: 'system' },
  { pattern: /\bunset\b/, reason: 'unset variable', category: 'system' },
]

// ── Safe read-only patterns (bypass confirmation) ──

const SAFE_READS: RegExp[] = [
  // Info commands
  /^\s*(echo|printf|date|whoami|hostname|uname|arch|id|groups|locale|uptime)\b/,
  /^\s*(pwd|realpath|dirname|basename)\b/,

  // File reading
  /^\s*(cat|head|tail|less|more|bat|wc|file|stat|md5|shasum|sha256sum|xxd)\b/,
  /^\s*(ls|tree|du|df|lsof|mount)\b/,

  // Search
  /^\s*(grep|rg|ag|ack|find|fd|locate|which|where|whereis|type|command\s+-v)\b/,

  // Git read-only
  /^\s*git\s+(status|log|diff|show|branch|tag|remote|stash\s+list|ls-files|ls-tree|blame|shortlog|describe|rev-parse|config\s+--get)\b/,

  // Language version checks
  /^\s*(node|python|python3|ruby|go|java|javac|rustc|cargo|npm|yarn|pnpm|pip|pip3|gem|bundle|dotnet|php|perl|swift|kotlin)\s+(--version|-[vV]|version)\b/,

  // Package info (read-only)
  /^\s*npm\s+(list|ls|outdated|audit|info|view|explain|why|pack\s+--dry-run)\b/,
  /^\s*pip\s+(list|show|freeze|check)\b/,
  /^\s*cargo\s+(tree|metadata|pkgid)\b/,

  // Build/test (generally safe)
  /^\s*(make|cmake|ninja|gradle|mvn|ant)\b/,
  /^\s*npm\s+(run|test|start|build)\b/,
  /^\s*yarn\s+(run|test|start|build)\b/,
  /^\s*pnpm\s+(run|test|start|build)\b/,
  /^\s*cargo\s+(build|test|check|clippy|bench|doc)\b/,
  /^\s*go\s+(build|test|vet|fmt)\b/,
  /^\s*python\s+-m\s+(pytest|unittest|mypy|flake8|black|isort)\b/,

  // Env/config reading
  /^\s*(env|printenv|set)\s*$/,
  /^\s*(cat|less)\s+.*\.(env|json|yaml|yml|toml|ini|cfg|conf|config|rc)\b/,

  // Process info
  /^\s*(ps|top|htop|pgrep)\b/,
  /^\s*(lsof|netstat|ss|nslookup|dig|ping|traceroute|curl\s+-I|curl\s+--head)\b/,

  // Helpers
  /^\s*(man|help|info)\b/,
  /^\s*(true|false|sleep|wait|time)\b/,
  /^\s*#/,  // comments
  /^\s*$/,  // empty
]

// ── sed command analysis ──

interface SedOperation {
  isInPlace: boolean
  hasBackup: boolean
  pattern: string
  isDestructive: boolean
}

function analyzeSed(command: string): SedOperation | null {
  const sedMatch = command.match(/\bsed\s+(.+)/)
  if (!sedMatch) return null

  const args = sedMatch[1]!
  const isInPlace = /\s-i\b/.test(args) || /^-i\b/.test(args)
  const hasBackup = /\s-i\s*['"][^'"]+['"]/.test(args) || /\s-i\.\w+/.test(args)

  // Check for destructive patterns (delete all, replace everything)
  const isDestructive =
    /\bd\s*$/.test(args) || // delete lines
    /\bs\/\.\*\/\//.test(args) || // replace everything with nothing
    /\bs\/\^\//.test(args) // replace from start (potentially all content)

  return { isInPlace, hasBackup, pattern: args, isDestructive }
}

// ── Path validation ──

export interface PathPolicy {
  allowedRoots: string[]  // directories the tool is allowed to access
  blockedPaths: string[]  // always blocked
}

const DEFAULT_BLOCKED_PATHS = [
  '/etc/passwd', '/etc/shadow', '/etc/sudoers',
  '/boot', '/sbin', '/usr/sbin',
  '~/.ssh/id_rsa', '~/.ssh/id_ed25519',
  '~/.gnupg', '~/.aws/credentials', '~/.config/gcloud',
]

export function validatePath(targetPath: string, cwd: string, policy?: PathPolicy): SecurityResult {
  const absPath = isAbsolute(targetPath) ? targetPath : resolve(cwd, targetPath)
  const rel = relative(cwd, absPath)

  // Block paths outside CWD that go to sensitive locations
  const blocked = policy?.blockedPaths ?? DEFAULT_BLOCKED_PATHS
  for (const bp of blocked) {
    const expanded = bp.replace('~', process.env.HOME ?? '')
    if (absPath.startsWith(expanded)) {
      return { level: 'block', reason: `access to ${bp} is blocked`, category: 'system' }
    }
  }

  // Warn if path is outside the project
  if (rel.startsWith('..')) {
    return { level: 'confirm', reason: `path ${absPath} is outside project root`, category: 'write' }
  }

  return { level: 'safe' }
}

// ── Extract paths from command ──

export function extractPaths(command: string): string[] {
  const paths: string[] = []

  // Common file operation patterns
  const ops = [
    /\b(?:rm|rmdir|mkdir|touch|chmod|chown|chgrp|mv|cp|ln)\s+(?:-[^\s]+\s+)*(.+)/,
    /\b(?:cat|head|tail|less|more|wc)\s+(?:-[^\s]+\s+)*(.+)/,
    />\s*(\S+)/,
    />>\s*(\S+)/,
  ]

  for (const op of ops) {
    const m = command.match(op)
    if (m?.[1]) {
      // Split on spaces but respect quotes
      const tokens = m[1].match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
      for (const tok of tokens) {
        const clean = tok.replace(/^['"]|['"]$/g, '')
        if (clean.startsWith('-')) continue // skip flags
        if (clean.includes('/') || clean.includes('.')) {
          paths.push(clean)
        }
      }
    }
  }

  return paths
}

// ── Main analysis function ──

export function analyzeCommand(command: string, cwd?: string): SecurityResult {
  const trimmed = command.trim()

  // Handle command chaining (&&, ||, ;, |)
  const subCommands = splitCommands(trimmed)
  let worstLevel: SecurityLevel = 'safe'
  let worstResult: SecurityResult = { level: 'safe', category: 'read' }

  for (const sub of subCommands) {
    const result = analyzeSingle(sub.trim(), cwd)
    if (LEVEL_ORDER[result.level] > LEVEL_ORDER[worstLevel]) {
      worstLevel = result.level
      worstResult = result
    }
  }

  return worstResult
}

const LEVEL_ORDER: Record<SecurityLevel, number> = { safe: 0, confirm: 1, block: 2 }

function analyzeSingle(command: string, cwd?: string): SecurityResult {
  if (!command || command.startsWith('#')) return { level: 'safe', category: 'read' }

  // Check blocked first
  for (const { pattern, reason } of BLOCKED) {
    if (pattern.test(command)) return { level: 'block', reason, category: 'destroy' }
  }

  // Check if it's an obviously safe read-only command
  for (const p of SAFE_READS) {
    if (p.test(command)) return { level: 'safe', category: 'read' }
  }

  // Analyze sed specifically
  const sed = analyzeSed(command)
  if (sed) {
    if (sed.isInPlace && sed.isDestructive && !sed.hasBackup) {
      return { level: 'confirm', reason: 'destructive in-place sed without backup', category: 'destroy' }
    }
    if (sed.isInPlace) {
      return { level: 'confirm', reason: 'in-place sed edit', category: 'write' }
    }
    return { level: 'safe', category: 'read' } // sed without -i just prints
  }

  // Check path safety if cwd provided
  if (cwd) {
    const paths = extractPaths(command)
    for (const p of paths) {
      const pathResult = validatePath(p, cwd)
      if (pathResult.level !== 'safe') return pathResult
    }
  }

  // Check against confirmation patterns
  for (const { pattern, reason, category } of CONFIRM) {
    if (pattern.test(command)) return { level: 'confirm', reason, category }
  }

  return { level: 'safe', category: 'unknown' }
}

// ── Split compound commands ──

function splitCommands(cmd: string): string[] {
  const results: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let escape = false

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!

    if (escape) { current += ch; escape = false; continue }
    if (ch === '\\') { escape = true; current += ch; continue }

    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue }

    if (!inSingle && !inDouble) {
      if (ch === ';' || (ch === '&' && cmd[i + 1] === '&') || (ch === '|' && cmd[i + 1] === '|')) {
        results.push(current)
        current = ''
        if (ch !== ';') i++ // skip second & or |
        continue
      }
      if (ch === '|' && cmd[i + 1] !== '|') {
        results.push(current)
        current = ''
        continue
      }
    }

    current += ch
  }

  if (current.trim()) results.push(current)
  return results
}

export function isCommandBlocked(command: string, cwd?: string): string | null {
  const result = analyzeCommand(command, cwd)
  if (result.level === 'block') return result.reason ?? 'blocked'
  return null
}

export function commandNeedsConfirm(command: string, cwd?: string): SecurityResult | null {
  const result = analyzeCommand(command, cwd)
  if (result.level === 'confirm') return result
  return null
}
