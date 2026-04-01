/**
 * SDK / pipe mode — lets external tools call ClawHarness programmatically.
 *
 * Usage:
 *   echo "create hello.py" | clh --pipe          # stdin/stdout JSON
 *   clh --print "create hello.py"                 # one-shot, text output
 *   clh --json "create hello.py"                  # one-shot, JSON output
 *
 * For integrations: import { createSession } from 'clawharness/sdk'
 */

import { AgentEngine, type EngineConfig } from '../core/AgentEngine.js'
import { ContextManager } from '../core/ContextManager.js'
import { OpenAICompatProvider } from '../providers/OpenAICompat.js'
import { RetryProvider } from '../providers/RetryProvider.js'
import { ToolRegistry } from '../tools/ToolRegistry.js'
import { PromptBuilder } from '../prompt/PromptBuilder.js'
import { PermissionSystem } from '../permission/PermissionSystem.js'
import { BashTool } from '../tools/bash/BashTool.js'
import { ReadTool } from '../tools/file/ReadTool.js'
import { WriteTool } from '../tools/file/WriteTool.js'
import { EditTool } from '../tools/file/EditTool.js'
import { GlobTool } from '../tools/search/GlobTool.js'
import { GrepTool } from '../tools/search/GrepTool.js'
import { WebFetchTool } from '../tools/file/WebFetchTool.js'
import { WebSearchTool } from '../tools/search/WebSearchTool.js'
import { loadConfig, loadProjectFiles } from '../config/settings.js'
import type { AgentEvent, Message } from '../core/types.js'

export interface SessionConfig {
  provider?: string
  model?: string
  apiKey?: string
  endpoint?: string
  cwd?: string
  permissionMode?: 'trust' | 'confirm' | 'readonly'
  maxTurns?: number
  maxContextTokens?: number
}

export interface SessionResult {
  text: string
  toolCalls: Array<{ name: string; input: any; output: string; isError: boolean }>
  events: AgentEvent[]
  error?: string
}

/**
 * Create a ClawHarness session programmatically.
 * This is the main SDK entry point.
 *
 * ```typescript
 * import { createSession } from 'clawharness/sdk'
 *
 * const session = createSession({
 *   provider: 'deepseek',
 *   apiKey: process.env.DEEPSEEK_API_KEY,
 * })
 *
 * const result = await session.run("create hello.py that prints hello world")
 * console.log(result.text)
 * ```
 */
export function createSession(cfg?: SessionConfig) {
  const config = loadConfig()
  const provName = cfg?.provider ?? config.defaultProvider
  const provCfg = config.providers[provName]

  const apiKey = cfg?.apiKey ?? provCfg?.apiKey ?? ''
  const endpoint = cfg?.endpoint ?? provCfg?.endpoint ?? 'https://api.openai.com/v1'
  const model = cfg?.model ?? provCfg?.model ?? 'gpt-4o'

  if (!apiKey) throw new Error(`No API key for provider "${provName}"`)

  const provider = new RetryProvider({
    primary: new OpenAICompatProvider({ name: provName, endpoint, apiKey, model }),
  })

  const tools = new ToolRegistry()
  tools.add(BashTool); tools.add(ReadTool); tools.add(WriteTool); tools.add(EditTool)
  tools.add(GlobTool); tools.add(GrepTool); tools.add(WebFetchTool); tools.add(WebSearchTool)

  const prompt = new PromptBuilder()
  const cwd = cfg?.cwd ?? process.cwd()
  for (const pf of loadProjectFiles(cwd)) prompt.loadProject(pf)

  const perm = new PermissionSystem(cfg?.permissionMode ?? 'trust')
  const contextMgr = new ContextManager({ maxTokens: cfg?.maxContextTokens ?? 120_000 })

  const engine = new AgentEngine({ provider, tools, prompt, perm, contextMgr, cwd })

  return {
    /** Run a prompt and collect all results */
    async run(input: string): Promise<SessionResult> {
      const events: AgentEvent[] = []
      const toolCalls: SessionResult['toolCalls'] = []
      let text = ''
      let error: string | undefined

      for await (const ev of engine.run(input)) {
        events.push(ev)
        if (ev.type === 'text') text += ev.content
        if (ev.type === 'tool_done') toolCalls.push({ name: ev.call.name, input: ev.call.input, output: ev.output, isError: ev.isError })
        if (ev.type === 'error') error = ev.message
      }

      return { text, toolCalls, events, error }
    },

    /** Stream events as they happen */
    async *stream(input: string): AsyncGenerator<AgentEvent> {
      yield* engine.run(input)
    },

    /** Get conversation history */
    getMessages(): readonly Message[] {
      return engine.getMessages()
    },

    /** Set conversation history (for resume) */
    setMessages(msgs: Message[]) {
      engine.setMessages(msgs)
    },

    /** Clear conversation */
    clear() {
      engine.clear()
    },
  }
}

/**
 * Pipe mode: read JSON from stdin, run, output JSON to stdout.
 * Used by external tools for programmatic integration.
 */
export async function runPipeMode() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk

  let request: { prompt: string; config?: SessionConfig }
  try {
    request = JSON.parse(input)
  } catch {
    request = { prompt: input.trim() }
  }

  const session = createSession(request.config)
  const result = await session.run(request.prompt)

  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

/**
 * Print mode: one-shot, text-only output (like CC's -p flag)
 */
export async function runPrintMode(prompt: string, cfg?: SessionConfig) {
  const session = createSession({ ...cfg, permissionMode: 'trust' })

  for await (const ev of session.stream(prompt)) {
    if (ev.type === 'text') process.stdout.write(ev.content)
    if (ev.type === 'error') process.stderr.write(`Error: ${ev.message}\n`)
  }
  process.stdout.write('\n')
}
