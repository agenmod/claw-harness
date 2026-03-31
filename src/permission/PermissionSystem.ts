import { createInterface } from 'readline'
import type { Tool } from '../tools/Tool.js'
import { analyzeCommand, type SecurityResult } from '../tools/bash/security.js'

export type PermMode = 'trust' | 'confirm' | 'readonly'

interface PermissionRule {
  tool: string        // tool name or '*'
  pattern?: string    // for Bash: command prefix pattern, for file tools: path glob
  action: 'allow' | 'deny' | 'ask'
}

/**
 * Permission system with rule-based overrides.
 * Supports always-allow and always-deny rules for specific tools/commands.
 */
export class PermissionSystem {
  readonly mode: PermMode
  private allowRules: PermissionRule[] = []
  private denyRules: PermissionRule[] = []
  private sessionAllowed = new Set<string>()  // commands approved this session

  constructor(mode: PermMode) {
    this.mode = mode
  }

  addAlwaysAllow(tool: string, pattern?: string) {
    this.allowRules.push({ tool, pattern, action: 'allow' })
  }

  addAlwaysDeny(tool: string, pattern?: string) {
    this.denyRules.push({ tool, pattern, action: 'deny' })
  }

  async check(tool: Tool, input: Record<string, unknown>): Promise<boolean> {
    // Readonly blocks all writes
    if (this.mode === 'readonly' && !tool.readOnly) return false

    // Check deny rules first
    for (const rule of this.denyRules) {
      if (this.ruleMatches(rule, tool, input)) return false
    }

    // Check allow rules
    for (const rule of this.allowRules) {
      if (this.ruleMatches(rule, tool, input)) return true
    }

    // Trust mode: allow everything
    if (this.mode === 'trust') return true

    // Confirm mode: check if tool needs confirmation
    if (!tool.needsConfirm(input)) return true

    // Enhanced Bash analysis
    if (tool.name === 'Bash') {
      const cmd = String(input.command ?? '')
      const analysis = analyzeCommand(cmd)
      if (analysis.level === 'block') return false
      if (analysis.level === 'safe') return true
    }

    // Check session memory (previously approved similar action)
    const fingerprint = this.fingerprint(tool, input)
    if (this.sessionAllowed.has(fingerprint)) return true

    // Ask user
    const desc = this.describe(tool, input)
    const granted = await this.askUser(desc)
    if (granted) this.sessionAllowed.add(fingerprint)
    return granted
  }

  private ruleMatches(rule: PermissionRule, tool: Tool, input: Record<string, unknown>): boolean {
    if (rule.tool !== '*' && rule.tool !== tool.name) return false
    if (!rule.pattern) return true

    if (tool.name === 'Bash') {
      const cmd = String(input.command ?? '')
      return cmd.startsWith(rule.pattern) || new RegExp(rule.pattern).test(cmd)
    }
    if (input.path) {
      const path = String(input.path)
      return path.includes(rule.pattern) || new RegExp(rule.pattern).test(path)
    }
    return false
  }

  private describe(tool: Tool, input: Record<string, unknown>): string {
    if (tool.name === 'Bash') {
      const cmd = String(input.command ?? '').slice(0, 150)
      const analysis = analyzeCommand(cmd)
      const tag = analysis.reason ? ` [${analysis.reason}]` : ''
      return `Run command${tag}: ${cmd}`
    }
    if (tool.name === 'Write') return `Write file: ${input.path}`
    if (tool.name === 'Edit') return `Edit file: ${input.path}`
    if (tool.name === 'NotebookEdit') return `Edit notebook: ${input.path} cell ${input.cell_index}`
    return `${tool.name}: ${JSON.stringify(input).slice(0, 120)}`
  }

  private fingerprint(tool: Tool, input: Record<string, unknown>): string {
    if (tool.name === 'Bash') {
      // Fingerprint by command prefix (first word + first arg)
      const cmd = String(input.command ?? '')
      const parts = cmd.split(/\s+/).slice(0, 2)
      return `bash:${parts.join(':')}`
    }
    return `${tool.name}:${input.path ?? ''}`
  }

  private askUser(description: string): Promise<boolean> {
    return new Promise(resolve => {
      const rl = createInterface({ input: process.stdin, output: process.stderr })
      process.stderr.write(`\n\x1b[33m⚠  Permission required\x1b[0m\n`)
      process.stderr.write(`   ${description}\n`)
      rl.question('   Allow? [\x1b[32my\x1b[0m/\x1b[31mN\x1b[0m/\x1b[36ma\x1b[0mlways] ', answer => {
        rl.close()
        const a = answer.trim().toLowerCase()
        if (a === 'a' || a === 'always') {
          // TODO: persist always-allow
          resolve(true)
        } else {
          resolve(a.startsWith('y'))
        }
      })
    })
  }
}
