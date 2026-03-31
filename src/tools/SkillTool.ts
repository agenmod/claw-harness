import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import type { Tool, ToolResult, ToolContext } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

/**
 * Skill system — loads markdown "skill files" that provide domain-specific
 * instructions to the model. Skills are reusable prompt templates.
 *
 * Skill locations:
 * 1. ~/.codeharness/skills/       (global)
 * 2. .codeharness/skills/         (project-level)
 */

const GLOBAL_SKILLS_DIR = join(homedir(), '.clawharness', 'skills')

interface SkillDef {
  name: string
  path: string
  content: string
  source: 'global' | 'project'
}

function discoverSkills(cwd: string): SkillDef[] {
  const skills: SkillDef[] = []

  const loadDir = (dir: string, source: 'global' | 'project') => {
    if (!existsSync(dir)) return
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md') && !file.endsWith('.txt')) continue
      const p = join(dir, file)
      try {
        const content = readFileSync(p, 'utf-8')
        const name = file.replace(/\.(md|txt)$/, '')
        skills.push({ name, path: p, content, source })
      } catch {}
    }
  }

  loadDir(GLOBAL_SKILLS_DIR, 'global')
  loadDir(join(cwd, '.clawharness', 'skills'), 'project')

  return skills
}

export const SkillTool: Tool = {
  name: 'Skill',
  description: 'Load a skill file for domain-specific instructions. Use "list" to see available skills, or provide a skill name to load it.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'Skill',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'load'], description: 'list available skills, or load one' },
          name: { type: 'string', description: 'Skill name to load (for action=load)' },
        },
        required: ['action'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input, ctx): Promise<ToolResult> {
    const action = String(input.action ?? 'list')
    const skills = discoverSkills(ctx.cwd)

    if (action === 'list') {
      if (skills.length === 0) {
        return {
          output: 'No skills found. Create .md files in ~/.codeharness/skills/ or .codeharness/skills/',
          isError: false,
        }
      }
      const list = skills.map(s => `  ${s.name} (${s.source})`).join('\n')
      return { output: `Available skills:\n${list}`, isError: false }
    }

    if (action === 'load') {
      const name = String(input.name ?? '')
      if (!name) return { output: 'Error: skill name is required', isError: true }

      const skill = skills.find(s => s.name.toLowerCase() === name.toLowerCase())
      if (!skill) {
        return { output: `Skill "${name}" not found. Available: ${skills.map(s => s.name).join(', ')}`, isError: true }
      }

      return { output: `[Skill: ${skill.name}]\n\n${skill.content}`, isError: false }
    }

    return { output: `Unknown action: ${action}`, isError: true }
  },
}
