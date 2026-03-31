import { readFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { homedir } from 'os'
import type { AppConfig } from '../core/types.js'

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    defaultProvider: 'openai',
    providers: {},
    permissionMode: 'confirm',
  }

  const cfgPath = join(homedir(), '.clawharness', 'config.json')
  if (existsSync(cfgPath)) {
    try { Object.assign(config, JSON.parse(readFileSync(cfgPath, 'utf-8'))) } catch {}
  }

  const add = (name: string, endpoint: string, keyEnv: string, modelEnv: string, defaultModel: string) => {
    const key = process.env[keyEnv]
    if (!key) return
    config.providers[name] = {
      endpoint: process.env[`${name.toUpperCase()}_ENDPOINT`] ?? endpoint,
      apiKey: key,
      model: process.env[modelEnv] ?? defaultModel,
    }
    if (!config.providers[config.defaultProvider]?.apiKey) config.defaultProvider = name
  }

  add('deepseek', 'https://api.deepseek.com', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'deepseek-chat')
  add('doubao', 'https://ark.cn-beijing.volces.com/api/v3', 'DOUBAO_API_KEY', 'DOUBAO_MODEL', 'doubao-seed-code-latest')
  add('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'QWEN_API_KEY', 'QWEN_MODEL', 'qwen-max')
  add('openai', 'https://api.openai.com/v1', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'gpt-4o')

  if (process.env.CODEHARNESS_PROVIDER) config.defaultProvider = process.env.CODEHARNESS_PROVIDER

  return config
}

/**
 * Multi-level HARNESS.md loading (like CC's multi-level CLAUDE.md):
 * 1. ~/.codeharness/HARNESS.md  (global)
 * 2. project root/HARNESS.md    (project)
 * 3. cwd/HARNESS.md             (directory, if different from root)
 */
export function loadProjectFiles(cwd: string): string[] {
  const results: string[] = []
  const seen = new Set<string>()

  const tryLoad = (dir: string) => {
    for (const name of ['HARNESS.md', 'harness.md', 'CLAWHARNESS.md']) {
      const p = resolve(dir, name)
      if (seen.has(p)) continue
      seen.add(p)
      if (existsSync(p)) {
        try { results.push(readFileSync(p, 'utf-8')) } catch {}
      }
    }
  }

  // Global
  tryLoad(join(homedir(), '.codeharness'))

  // Walk up from cwd to find project root (look for .git, package.json, etc.)
  let dir = resolve(cwd)
  const root = findProjectRoot(dir)
  if (root && root !== dir) tryLoad(root)

  // CWD itself
  tryLoad(dir)

  return results
}

function findProjectRoot(from: string): string | null {
  const markers = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml']
  let dir = from
  while (true) {
    for (const m of markers) {
      if (existsSync(join(dir, m))) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
