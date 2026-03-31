/**
 * Path validation and sandboxing for shell commands.
 * Prevents access to sensitive system paths and paths outside the project.
 */

import { resolve, relative, isAbsolute, normalize } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'

export interface PathCheckResult {
  allowed: boolean
  reason?: string
}

const HOME = homedir()

// Paths that should NEVER be written to
const SYSTEM_BLOCKED_WRITE = [
  '/etc', '/boot', '/sbin', '/usr/sbin', '/lib', '/usr/lib',
  '/System', '/Library/LaunchDaemons', '/Library/LaunchAgents',
  '/var/root',
]

// Paths that should never be accessed at all
const ABSOLUTE_BLOCKED = [
  `${HOME}/.ssh/id_rsa`, `${HOME}/.ssh/id_ed25519`, `${HOME}/.ssh/id_dsa`,
  `${HOME}/.ssh/authorized_keys`,
  `${HOME}/.gnupg`,
  `${HOME}/.aws/credentials`, `${HOME}/.aws/config`,
  `${HOME}/.config/gcloud/credentials.db`,
  `${HOME}/.azure`,
  `${HOME}/.kube/config`,
  '/etc/shadow', '/etc/passwd', '/etc/sudoers',
  '/etc/master.passwd',
]

// Files that should warn (might contain secrets)
const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\.\w+$/i,
  /credentials\.json$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /secrets?\.\w+$/i,
  /token\.json$/i,
  /\.netrc$/i,
]

/**
 * Check if a path is safe to access given the project root.
 */
export function validatePathAccess(
  targetPath: string,
  projectRoot: string,
  mode: 'read' | 'write' = 'read',
): PathCheckResult {
  const abs = isAbsolute(targetPath) ? normalize(targetPath) : resolve(projectRoot, targetPath)
  const rel = relative(projectRoot, abs)

  // Absolute blocked (never access)
  for (const blocked of ABSOLUTE_BLOCKED) {
    if (abs === blocked || abs.startsWith(blocked + '/')) {
      return { allowed: false, reason: `blocked: ${blocked} (sensitive credential file)` }
    }
  }

  // System paths (never write)
  if (mode === 'write') {
    for (const sys of SYSTEM_BLOCKED_WRITE) {
      if (abs.startsWith(sys + '/') || abs === sys) {
        return { allowed: false, reason: `blocked: cannot write to system path ${sys}` }
      }
    }
  }

  // Check if outside project (warn but allow for read, block for write to system)
  if (rel.startsWith('..')) {
    // Inside home dir is usually OK (e.g. ~/.config/project-name)
    if (abs.startsWith(HOME)) {
      // But warn for sensitive patterns
      for (const p of SENSITIVE_PATTERNS) {
        if (p.test(abs)) {
          return { allowed: false, reason: `blocked: ${abs} matches sensitive file pattern` }
        }
      }
      return { allowed: true, reason: `outside project but inside home dir` }
    }
    // Outside both project and home
    if (mode === 'write') {
      return { allowed: false, reason: `blocked: cannot write outside project root (${abs})` }
    }
    return { allowed: true, reason: `read outside project (${abs})` }
  }

  // Inside project — check for .env files on write
  if (mode === 'write') {
    for (const p of SENSITIVE_PATTERNS) {
      if (p.test(abs)) {
        return { allowed: true, reason: `warning: writing to potentially sensitive file ${rel}` }
      }
    }
  }

  return { allowed: true }
}

/**
 * Extract all file paths mentioned in a command string.
 * Handles quotes, flags, and common patterns.
 */
export function extractCommandPaths(command: string): string[] {
  const paths: string[] = []

  // Output redirections: > file, >> file
  const redirects = command.matchAll(/>{1,2}\s*([^\s;|&]+)/g)
  for (const m of redirects) {
    if (m[1] && !m[1].startsWith('/dev/')) paths.push(m[1])
  }

  // Common file operation commands
  const fileOps = command.matchAll(
    /\b(?:rm|rmdir|mkdir|touch|cp|mv|ln|chmod|chown|cat|head|tail|less|more|nano|vi|vim)\s+(?:-[^\s]+\s+)*(.+?)(?:\s*[;|&]|$)/g
  )
  for (const m of fileOps) {
    if (!m[1]) continue
    const args = m[1].match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
    for (const arg of args) {
      const clean = arg.replace(/^['"]|['"]$/g, '')
      if (!clean.startsWith('-') && (clean.includes('/') || clean.includes('.') || existsSync(clean))) {
        paths.push(clean)
      }
    }
  }

  return [...new Set(paths)]
}
