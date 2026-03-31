/**
 * Command semantic analysis — understands what a command DOES,
 * not just pattern-matching against strings.
 */

export type CommandCategory = 'read' | 'write' | 'destroy' | 'network' | 'process' | 'system' | 'build' | 'unknown'
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface CommandAnalysis {
  command: string
  category: CommandCategory
  risk: RiskLevel
  isReadOnly: boolean
  modifiesFiles: boolean
  modifiesSystem: boolean
  usesNetwork: boolean
  usesElevation: boolean
  affectedPaths: string[]
  reason: string
}

// Maps first token to category & base risk
const COMMAND_DB: Record<string, { cat: CommandCategory; risk: RiskLevel; readOnly: boolean }> = {
  // Pure reads
  cat: { cat: 'read', risk: 'none', readOnly: true },
  head: { cat: 'read', risk: 'none', readOnly: true },
  tail: { cat: 'read', risk: 'none', readOnly: true },
  less: { cat: 'read', risk: 'none', readOnly: true },
  more: { cat: 'read', risk: 'none', readOnly: true },
  wc: { cat: 'read', risk: 'none', readOnly: true },
  file: { cat: 'read', risk: 'none', readOnly: true },
  stat: { cat: 'read', risk: 'none', readOnly: true },
  md5sum: { cat: 'read', risk: 'none', readOnly: true },
  sha256sum: { cat: 'read', risk: 'none', readOnly: true },
  xxd: { cat: 'read', risk: 'none', readOnly: true },
  hexdump: { cat: 'read', risk: 'none', readOnly: true },
  strings: { cat: 'read', risk: 'none', readOnly: true },
  od: { cat: 'read', risk: 'none', readOnly: true },
  diff: { cat: 'read', risk: 'none', readOnly: true },
  cmp: { cat: 'read', risk: 'none', readOnly: true },
  comm: { cat: 'read', risk: 'none', readOnly: true },
  // Dir listing
  ls: { cat: 'read', risk: 'none', readOnly: true },
  dir: { cat: 'read', risk: 'none', readOnly: true },
  tree: { cat: 'read', risk: 'none', readOnly: true },
  du: { cat: 'read', risk: 'none', readOnly: true },
  df: { cat: 'read', risk: 'none', readOnly: true },
  pwd: { cat: 'read', risk: 'none', readOnly: true },
  realpath: { cat: 'read', risk: 'none', readOnly: true },
  readlink: { cat: 'read', risk: 'none', readOnly: true },
  basename: { cat: 'read', risk: 'none', readOnly: true },
  dirname: { cat: 'read', risk: 'none', readOnly: true },
  // Search
  find: { cat: 'read', risk: 'none', readOnly: true },
  grep: { cat: 'read', risk: 'none', readOnly: true },
  egrep: { cat: 'read', risk: 'none', readOnly: true },
  fgrep: { cat: 'read', risk: 'none', readOnly: true },
  rg: { cat: 'read', risk: 'none', readOnly: true },
  ag: { cat: 'read', risk: 'none', readOnly: true },
  ack: { cat: 'read', risk: 'none', readOnly: true },
  fd: { cat: 'read', risk: 'none', readOnly: true },
  locate: { cat: 'read', risk: 'none', readOnly: true },
  which: { cat: 'read', risk: 'none', readOnly: true },
  whereis: { cat: 'read', risk: 'none', readOnly: true },
  type: { cat: 'read', risk: 'none', readOnly: true },
  // System info
  echo: { cat: 'read', risk: 'none', readOnly: true },
  printf: { cat: 'read', risk: 'none', readOnly: true },
  date: { cat: 'read', risk: 'none', readOnly: true },
  whoami: { cat: 'read', risk: 'none', readOnly: true },
  id: { cat: 'read', risk: 'none', readOnly: true },
  hostname: { cat: 'read', risk: 'none', readOnly: true },
  uname: { cat: 'read', risk: 'none', readOnly: true },
  arch: { cat: 'read', risk: 'none', readOnly: true },
  uptime: { cat: 'read', risk: 'none', readOnly: true },
  env: { cat: 'read', risk: 'none', readOnly: true },
  printenv: { cat: 'read', risk: 'none', readOnly: true },
  locale: { cat: 'read', risk: 'none', readOnly: true },
  groups: { cat: 'read', risk: 'none', readOnly: true },
  // Process info
  ps: { cat: 'process', risk: 'none', readOnly: true },
  top: { cat: 'process', risk: 'none', readOnly: true },
  htop: { cat: 'process', risk: 'none', readOnly: true },
  pgrep: { cat: 'process', risk: 'none', readOnly: true },
  lsof: { cat: 'process', risk: 'none', readOnly: true },
  // Network read
  ping: { cat: 'network', risk: 'none', readOnly: true },
  nslookup: { cat: 'network', risk: 'none', readOnly: true },
  dig: { cat: 'network', risk: 'none', readOnly: true },
  host: { cat: 'network', risk: 'none', readOnly: true },
  traceroute: { cat: 'network', risk: 'none', readOnly: true },
  netstat: { cat: 'network', risk: 'none', readOnly: true },
  ss: { cat: 'network', risk: 'none', readOnly: true },
  ifconfig: { cat: 'network', risk: 'none', readOnly: true },
  ip: { cat: 'network', risk: 'none', readOnly: true },
  // Help
  man: { cat: 'read', risk: 'none', readOnly: true },
  help: { cat: 'read', risk: 'none', readOnly: true },
  info: { cat: 'read', risk: 'none', readOnly: true },
  // No-ops
  true: { cat: 'read', risk: 'none', readOnly: true },
  false: { cat: 'read', risk: 'none', readOnly: true },
  sleep: { cat: 'read', risk: 'none', readOnly: true },
  wait: { cat: 'read', risk: 'none', readOnly: true },
  time: { cat: 'read', risk: 'none', readOnly: true },
  // File write
  touch: { cat: 'write', risk: 'low', readOnly: false },
  mkdir: { cat: 'write', risk: 'low', readOnly: false },
  cp: { cat: 'write', risk: 'low', readOnly: false },
  mv: { cat: 'write', risk: 'medium', readOnly: false },
  ln: { cat: 'write', risk: 'low', readOnly: false },
  install: { cat: 'write', risk: 'medium', readOnly: false },
  // File destroy
  rm: { cat: 'destroy', risk: 'high', readOnly: false },
  rmdir: { cat: 'destroy', risk: 'medium', readOnly: false },
  shred: { cat: 'destroy', risk: 'critical', readOnly: false },
  truncate: { cat: 'destroy', risk: 'high', readOnly: false },
  // Text processors (safe without -i)
  sed: { cat: 'read', risk: 'none', readOnly: true },
  awk: { cat: 'read', risk: 'none', readOnly: true },
  perl: { cat: 'read', risk: 'none', readOnly: true },
  sort: { cat: 'read', risk: 'none', readOnly: true },
  uniq: { cat: 'read', risk: 'none', readOnly: true },
  cut: { cat: 'read', risk: 'none', readOnly: true },
  tr: { cat: 'read', risk: 'none', readOnly: true },
  jq: { cat: 'read', risk: 'none', readOnly: true },
  yq: { cat: 'read', risk: 'none', readOnly: true },
  xargs: { cat: 'unknown', risk: 'medium', readOnly: false },
  // Permissions
  chmod: { cat: 'system', risk: 'medium', readOnly: false },
  chown: { cat: 'system', risk: 'medium', readOnly: false },
  chgrp: { cat: 'system', risk: 'medium', readOnly: false },
  // Process control
  kill: { cat: 'process', risk: 'high', readOnly: false },
  killall: { cat: 'process', risk: 'high', readOnly: false },
  pkill: { cat: 'process', risk: 'high', readOnly: false },
  // Network write
  curl: { cat: 'network', risk: 'low', readOnly: true },
  wget: { cat: 'network', risk: 'low', readOnly: true },
  ssh: { cat: 'network', risk: 'medium', readOnly: false },
  scp: { cat: 'network', risk: 'medium', readOnly: false },
  rsync: { cat: 'network', risk: 'medium', readOnly: false },
  // System
  sudo: { cat: 'system', risk: 'critical', readOnly: false },
  su: { cat: 'system', risk: 'critical', readOnly: false },
  doas: { cat: 'system', risk: 'critical', readOnly: false },
  systemctl: { cat: 'system', risk: 'high', readOnly: false },
  launchctl: { cat: 'system', risk: 'high', readOnly: false },
  service: { cat: 'system', risk: 'high', readOnly: false },
  crontab: { cat: 'system', risk: 'high', readOnly: false },
  iptables: { cat: 'system', risk: 'critical', readOnly: false },
  ufw: { cat: 'system', risk: 'high', readOnly: false },
  mount: { cat: 'system', risk: 'critical', readOnly: false },
  umount: { cat: 'system', risk: 'high', readOnly: false },
  mkfs: { cat: 'system', risk: 'critical', readOnly: false },
  dd: { cat: 'system', risk: 'critical', readOnly: false },
  shutdown: { cat: 'system', risk: 'critical', readOnly: false },
  reboot: { cat: 'system', risk: 'critical', readOnly: false },
  // Build tools (generally safe)
  make: { cat: 'build', risk: 'low', readOnly: false },
  cmake: { cat: 'build', risk: 'low', readOnly: false },
  ninja: { cat: 'build', risk: 'low', readOnly: false },
  gradle: { cat: 'build', risk: 'low', readOnly: false },
  mvn: { cat: 'build', risk: 'low', readOnly: false },
  ant: { cat: 'build', risk: 'low', readOnly: false },
  // Docker
  docker: { cat: 'system', risk: 'medium', readOnly: false },
  'docker-compose': { cat: 'system', risk: 'medium', readOnly: false },
  podman: { cat: 'system', risk: 'medium', readOnly: false },
  // Databases
  psql: { cat: 'write', risk: 'medium', readOnly: false },
  mysql: { cat: 'write', risk: 'medium', readOnly: false },
  sqlite3: { cat: 'write', risk: 'low', readOnly: false },
  redis: { cat: 'write', risk: 'medium', readOnly: false },
  mongo: { cat: 'write', risk: 'medium', readOnly: false },
  mongosh: { cat: 'write', risk: 'medium', readOnly: false },
  dropdb: { cat: 'destroy', risk: 'critical', readOnly: false },
  createdb: { cat: 'write', risk: 'medium', readOnly: false },
}

// Git sub-commands have their own risk profiles
const GIT_SUB: Record<string, { risk: RiskLevel; readOnly: boolean }> = {
  status: { risk: 'none', readOnly: true },
  log: { risk: 'none', readOnly: true },
  diff: { risk: 'none', readOnly: true },
  show: { risk: 'none', readOnly: true },
  branch: { risk: 'none', readOnly: true },
  tag: { risk: 'none', readOnly: true },
  remote: { risk: 'none', readOnly: true },
  'stash list': { risk: 'none', readOnly: true },
  blame: { risk: 'none', readOnly: true },
  shortlog: { risk: 'none', readOnly: true },
  describe: { risk: 'none', readOnly: true },
  'rev-parse': { risk: 'none', readOnly: true },
  'ls-files': { risk: 'none', readOnly: true },
  'ls-tree': { risk: 'none', readOnly: true },
  add: { risk: 'low', readOnly: false },
  commit: { risk: 'low', readOnly: false },
  pull: { risk: 'medium', readOnly: false },
  fetch: { risk: 'none', readOnly: true },
  push: { risk: 'medium', readOnly: false },
  merge: { risk: 'medium', readOnly: false },
  rebase: { risk: 'high', readOnly: false },
  'reset --hard': { risk: 'high', readOnly: false },
  'reset --soft': { risk: 'low', readOnly: false },
  'clean -f': { risk: 'high', readOnly: false },
  'stash drop': { risk: 'medium', readOnly: false },
  'branch -d': { risk: 'medium', readOnly: false },
  'branch -D': { risk: 'high', readOnly: false },
  checkout: { risk: 'medium', readOnly: false },
  switch: { risk: 'low', readOnly: false },
  restore: { risk: 'medium', readOnly: false },
  cherry: { risk: 'none', readOnly: true },
  'cherry-pick': { risk: 'medium', readOnly: false },
  clone: { risk: 'low', readOnly: false },
  init: { risk: 'low', readOnly: false },
  config: { risk: 'low', readOnly: false },
}

// Package manager sub-commands
const PKG_SAFE_SUBS = new Set([
  'list', 'ls', 'info', 'view', 'show', 'outdated', 'audit',
  'why', 'explain', 'pack --dry-run', 'check', 'tree', 'metadata',
  'version', '--version', '-v', '-V', 'help', '--help',
  'freeze', 'search', 'config get', 'config list',
])

const PKG_MANAGERS = new Set([
  'npm', 'yarn', 'pnpm', 'bun', 'pip', 'pip3', 'pipenv', 'poetry',
  'gem', 'bundle', 'cargo', 'go', 'composer', 'nuget', 'dotnet',
])

/**
 * Analyze a single command (not compound).
 */
export function analyzeCommandSemantics(cmd: string): CommandAnalysis {
  const trimmed = cmd.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return { command: trimmed, category: 'read', risk: 'none', isReadOnly: true, modifiesFiles: false, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: 'empty/comment' }
  }

  // Strip variable assignments at start
  const stripped = trimmed.replace(/^(\w+=\S*\s+)+/, '')
  const tokens = tokenize(stripped)
  const firstToken = tokens[0] ?? ''

  // Elevation wrapper — analyze the inner command but flag elevation
  if (firstToken === 'sudo' || firstToken === 'doas' || firstToken === 'su') {
    const inner = tokens.slice(firstToken === 'su' ? 3 : 1).join(' ')
    const innerAnalysis = analyzeCommandSemantics(inner)
    return {
      ...innerAnalysis,
      risk: escalateRisk(innerAnalysis.risk),
      usesElevation: true,
      reason: `elevated: ${innerAnalysis.reason}`,
    }
  }

  // Git
  if (firstToken === 'git') {
    return analyzeGit(tokens, trimmed)
  }

  // Package managers
  if (PKG_MANAGERS.has(firstToken)) {
    return analyzePackageManager(tokens, trimmed)
  }

  // Node/Python/Ruby runners
  if (['node', 'python', 'python3', 'ruby', 'php', 'perl', 'java', 'javac', 'rustc', 'go', 'swift', 'kotlin'].includes(firstToken)) {
    const sub = tokens[1] ?? ''
    if (sub === '--version' || sub === '-v' || sub === '-V' || sub === 'version') {
      return { command: trimmed, category: 'read', risk: 'none', isReadOnly: true, modifiesFiles: false, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: 'version check' }
    }
    return { command: trimmed, category: 'build', risk: 'low', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: 'script execution' }
  }

  // sed -i
  if (firstToken === 'sed' && tokens.some(t => t === '-i' || t.startsWith('-i.'))) {
    return { command: trimmed, category: 'write', risk: 'medium', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: extractFileArgs(tokens), reason: 'in-place sed edit' }
  }

  // awk -i inplace
  if (firstToken === 'awk' && tokens.includes('-i') && tokens.includes('inplace')) {
    return { command: trimmed, category: 'write', risk: 'medium', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: extractFileArgs(tokens), reason: 'in-place awk edit' }
  }

  // curl/wget with output
  if ((firstToken === 'curl' || firstToken === 'wget') && hasOutputFlag(tokens)) {
    return { command: trimmed, category: 'network', risk: 'medium', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: true, usesElevation: false, affectedPaths: [], reason: 'network download to file' }
  }

  // Pipe to shell
  if (trimmed.match(/\|\s*(ba)?sh\b/) || trimmed.match(/\|\s*zsh\b/)) {
    return { command: trimmed, category: 'system', risk: 'critical', isReadOnly: false, modifiesFiles: true, modifiesSystem: true, usesNetwork: trimmed.includes('curl') || trimmed.includes('wget'), usesElevation: false, affectedPaths: [], reason: 'pipe to shell' }
  }

  // Output redirection (overwrite)
  if (trimmed.match(/[^>]>\s*[^>|&\s]/)) {
    const db = COMMAND_DB[firstToken]
    return { command: trimmed, category: 'write', risk: 'medium', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: 'output redirect (overwrite)' }
  }

  // Lookup in DB
  const db = COMMAND_DB[firstToken]
  if (db) {
    const paths = db.readOnly ? [] : extractFileArgs(tokens)
    return { command: trimmed, category: db.cat, risk: db.risk, isReadOnly: db.readOnly, modifiesFiles: !db.readOnly, modifiesSystem: db.cat === 'system', usesNetwork: db.cat === 'network', usesElevation: false, affectedPaths: paths, reason: firstToken }
  }

  // Unknown — medium risk by default
  return { command: trimmed, category: 'unknown', risk: 'low', isReadOnly: false, modifiesFiles: false, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: 'unknown command' }
}

function analyzeGit(tokens: string[], full: string): CommandAnalysis {
  const sub = tokens[1] ?? ''
  const subArgs = tokens.slice(2).join(' ')

  // Check for force flags
  const hasForce = tokens.includes('--force') || tokens.includes('-f')

  // Two-word git sub-commands
  for (const [key, val] of Object.entries(GIT_SUB)) {
    if (key.includes(' ')) {
      if (`${sub} ${subArgs}`.startsWith(key)) {
        const risk = hasForce && sub === 'push' ? 'critical' as const : val.risk
        return { command: full, category: 'write', risk, isReadOnly: val.readOnly, modifiesFiles: !val.readOnly, modifiesSystem: false, usesNetwork: sub === 'push' || sub === 'pull' || sub === 'fetch', usesElevation: false, affectedPaths: [], reason: `git ${key}${hasForce ? ' --force' : ''}` }
      }
    }
  }

  const gitInfo = GIT_SUB[sub]
  if (gitInfo) {
    const risk = hasForce && sub === 'push' ? 'critical' as const : gitInfo.risk
    return { command: full, category: gitInfo.readOnly ? 'read' : 'write', risk, isReadOnly: gitInfo.readOnly, modifiesFiles: !gitInfo.readOnly, modifiesSystem: false, usesNetwork: ['push', 'pull', 'fetch', 'clone'].includes(sub), usesElevation: false, affectedPaths: [], reason: `git ${sub}${hasForce ? ' --force' : ''}` }
  }

  return { command: full, category: 'write', risk: 'medium', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: `git ${sub} (unknown)` }
}

function analyzePackageManager(tokens: string[], full: string): CommandAnalysis {
  const mgr = tokens[0]!
  const sub = tokens[1] ?? ''
  const isSafe = PKG_SAFE_SUBS.has(sub) || sub === '--version' || sub === '-v'
  const isRun = ['run', 'test', 'start', 'build', 'dev', 'lint', 'format', 'check', 'bench', 'doc'].includes(sub)
  const isInstall = ['install', 'add', 'update', 'upgrade', 'remove', 'uninstall'].includes(sub)
  const isPublish = sub === 'publish'

  if (isSafe) return { command: full, category: 'read', risk: 'none', isReadOnly: true, modifiesFiles: false, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: `${mgr} ${sub} (read-only)` }

  if (isRun) return { command: full, category: 'build', risk: 'low', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: `${mgr} ${sub}` }

  if (isInstall) return { command: full, category: 'network', risk: 'medium', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: true, usesElevation: false, affectedPaths: [], reason: `${mgr} ${sub}` }

  if (isPublish) return { command: full, category: 'network', risk: 'high', isReadOnly: false, modifiesFiles: false, modifiesSystem: false, usesNetwork: true, usesElevation: false, affectedPaths: [], reason: `${mgr} publish` }

  return { command: full, category: 'build', risk: 'low', isReadOnly: false, modifiesFiles: true, modifiesSystem: false, usesNetwork: false, usesElevation: false, affectedPaths: [], reason: `${mgr} ${sub}` }
}

function hasOutputFlag(tokens: string[]): boolean {
  return tokens.some(t => t === '-o' || t === '-O' || t === '--output' || t.startsWith('-o'))
}

function extractFileArgs(tokens: string[]): string[] {
  return tokens.slice(1).filter(t => !t.startsWith('-') && (t.includes('/') || t.includes('.')))
}

function tokenize(cmd: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingle = false, inDouble = false, escape = false

  for (const ch of cmd) {
    if (escape) { current += ch; escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current) tokens.push(current)
  return tokens
}

function escalateRisk(risk: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical']
  const idx = order.indexOf(risk)
  return order[Math.min(idx + 1, order.length - 1)]!
}
