import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Tool, ToolResult } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

const CONFIG_DIR = join(homedir(), '.clawharness')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export const ConfigTool: Tool = {
  name: 'Config',
  description: 'View or modify ClawHarness configuration settings.',
  readOnly: false,

  schema(): FunctionSchema {
    return {
      name: 'Config',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'list'], description: 'Action: get, set, or list' },
          key: { type: 'string', description: 'Config key (dot notation, e.g. "providers.deepseek.model")' },
          value: { type: 'string', description: 'Value to set (for set action)' },
        },
        required: ['action'],
      },
    }
  },

  needsConfirm(input) { return input.action === 'set' },

  async run(input): Promise<ToolResult> {
    const action = String(input.action ?? 'list')

    let config: Record<string, any> = {}
    if (existsSync(CONFIG_FILE)) {
      try { config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } catch {}
    }

    if (action === 'list') {
      return { output: JSON.stringify(config, null, 2) || '{}', isError: false }
    }

    const key = String(input.key ?? '')
    if (!key) return { output: 'Error: key is required', isError: true }

    if (action === 'get') {
      const val = getNestedValue(config, key)
      return { output: val !== undefined ? JSON.stringify(val, null, 2) : `Key "${key}" not found`, isError: val === undefined }
    }

    if (action === 'set') {
      const value = input.value
      if (value === undefined) return { output: 'Error: value is required for set', isError: true }
      setNestedValue(config, key, value)
      if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
      return { output: `Set ${key} = ${JSON.stringify(value)}`, isError: false }
    }

    return { output: `Unknown action: ${action}`, isError: true }
  },
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function setNestedValue(obj: any, path: string, value: any) {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i]! in current)) current[keys[i]!] = {}
    current = current[keys[i]!]
  }
  current[keys[keys.length - 1]!] = value
}
