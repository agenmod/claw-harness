#!/usr/bin/env node

import { createInterface } from 'readline'
import { execSync } from 'child_process'
import { AgentEngine } from './core/AgentEngine.js'
import { ContextManager } from './core/ContextManager.js'
import { OpenAICompatProvider } from './providers/OpenAICompat.js'
import { RetryProvider } from './providers/RetryProvider.js'
import { ModelRouter } from './providers/ModelRouter.js'
import { ToolRegistry } from './tools/ToolRegistry.js'
import { PromptBuilder } from './prompt/PromptBuilder.js'
import { PermissionSystem } from './permission/PermissionSystem.js'
import { CostTracker } from './utils/costTracker.js'
import { saveSession, loadSession, getLastSession } from './utils/session.js'
import { undoFile, getFileHistory } from './utils/fileHistory.js'
import { BashTool } from './tools/bash/BashTool.js'
import { ReadTool } from './tools/file/ReadTool.js'
import { WriteTool } from './tools/file/WriteTool.js'
import { EditTool } from './tools/file/EditTool.js'
import { GlobTool } from './tools/search/GlobTool.js'
import { GrepTool } from './tools/search/GrepTool.js'
import { WebFetchTool } from './tools/file/WebFetchTool.js'
import { WebSearchTool } from './tools/search/WebSearchTool.js'
import { NotebookEditTool } from './tools/file/NotebookEditTool.js'
import { TodoWriteTool } from './tools/TodoWriteTool.js'
import { AskUserTool } from './tools/AskUserTool.js'
import { AgentTool, setAgentFactory } from './tools/AgentTool.js'
import { EnterPlanModeTool, ExitPlanModeTool } from './tools/PlanModeTool.js'
import { ConfigTool } from './tools/ConfigTool.js'
import { ToolSearchTool, setToolSearchRegistry } from './tools/ToolSearchTool.js'
import { LSPTool } from './tools/LSPTool.js'
import { SkillTool } from './tools/SkillTool.js'
import { EnterWorktreeTool, ExitWorktreeTool } from './tools/WorktreeTool.js'
import { loadConfig, loadProjectFiles } from './config/settings.js'
import { extractAndSaveMemories, loadMemories } from './services/memory/AutoMemory.js'
import { printBanner } from './ui/banner.js'
import { Spinner, getToolIcon } from './ui/spinner.js'
import { formatToolStart, formatToolSuccess, formatToolError, formatCompressed, formatCost, highlightCodeBlocks, c } from './ui/format.js'
import type { ModelProvider } from './providers/ModelProvider.js'
import type { AppConfig, ProviderConfig } from './core/types.js'

// ── State that can change at runtime ──
let currentProviderName: string
let currentProviderCfg: ProviderConfig
let currentProvider: ModelProvider
let engine: AgentEngine
let costTracker: CostTracker
let config: AppConfig

function buildProvider(name: string, cfg: ProviderConfig): ModelProvider {
  return new RetryProvider({
    primary: new OpenAICompatProvider({
      name, endpoint: cfg.endpoint, apiKey: cfg.apiKey, model: cfg.model,
      supportsThinking: name === 'deepseek',
    }),
  })
}

async function main() {
  const args = process.argv.slice(2)

  // ── SDK / MCP modes (bypass normal CLI) ──
  if (args.includes('--mcp-server') || args.includes('--mcp')) {
    const { startMcpServer } = await import('./entrypoints/mcp-server.js')
    startMcpServer()
    return
  }
  if (args.includes('--pipe')) {
    const { runPipeMode } = await import('./entrypoints/sdk.js')
    await runPipeMode()
    return
  }
  if (args.includes('--print') || args.includes('-p')) {
    const prompt = args.filter(a => !a.startsWith('-')).join(' ')
    if (!prompt) { console.error('Usage: clh --print "your prompt"'); process.exit(1) }
    const { runPrintMode } = await import('./entrypoints/sdk.js')
    await runPrintMode(prompt)
    return
  }
  if (args.includes('--json')) {
    const prompt = args.filter(a => !a.startsWith('-')).join(' ')
    if (!prompt) { console.error('Usage: clh --json "your prompt"'); process.exit(1) }
    const { createSession } = await import('./entrypoints/sdk.js')
    const result = await createSession({ permissionMode: 'trust' }).run(prompt)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  const modelFlag = args.find(a => a.startsWith('--model='))?.split('=')[1]
  const routerFlag = args.find(a => a.startsWith('--router='))?.split('=')[1]
  const resumeFlag = args.find(a => a.startsWith('--resume'))
  const trustFlag = args.includes('--trust')
  const readonlyFlag = args.includes('--readonly') || args.includes('--plan')
  const verboseFlag = args.includes('--verbose') || args.includes('-v')
  const oneshot = args.filter(a => !a.startsWith('-')).join(' ')

  config = loadConfig()
  currentProviderName = modelFlag ?? config.defaultProvider
  currentProviderCfg = config.providers[currentProviderName]!

  if (!currentProviderCfg?.apiKey) {
    console.error(`\x1b[31m✗ No API key for "${currentProviderName}".\x1b[0m`)
    console.error(`  Set: DEEPSEEK_API_KEY / DOUBAO_API_KEY / OPENAI_API_KEY / QWEN_API_KEY`)
    process.exit(1)
  }

  // ── Provider ──
  currentProvider = buildProvider(currentProviderName, currentProviderCfg)

  if (routerFlag) {
    const cheapCfg = config.providers[routerFlag]
    if (cheapCfg?.apiKey) {
      const cheapProv = buildProvider(routerFlag, cheapCfg)
      currentProvider = new ModelRouter({ strong: currentProvider, cheap: cheapProv, strategy: 'complexity' })
      console.log(`\x1b[90mRouter: strong=${currentProviderCfg.model} cheap=${cheapCfg.model}\x1b[0m`)
    }
  }

  // ── All 17 tools ──
  const tools = new ToolRegistry()
  tools.add(BashTool)
  tools.add(ReadTool)
  tools.add(WriteTool)
  tools.add(EditTool)
  tools.add(GlobTool)
  tools.add(GrepTool)
  tools.add(WebFetchTool)
  tools.add(WebSearchTool)
  tools.add(NotebookEditTool)
  tools.add(TodoWriteTool)
  tools.add(AskUserTool)
  tools.add(AgentTool)
  tools.add(EnterPlanModeTool)
  tools.add(ExitPlanModeTool)
  tools.add(ConfigTool)
  tools.add(ToolSearchTool)
  tools.add(LSPTool)
  tools.add(SkillTool)
  tools.add(EnterWorktreeTool)
  tools.add(ExitWorktreeTool)
  setToolSearchRegistry(tools)

  // ── Prompt ──
  const prompt = new PromptBuilder()
  const cwd = process.cwd()
  const projectName = cwd.split('/').pop() ?? 'unknown'
  for (const pf of loadProjectFiles(cwd)) prompt.loadProject(pf)
  const memories = loadMemories(projectName)
  if (memories.trim()) prompt.loadProject(`## Memories from previous sessions\n${memories}`)

  // ── Permission ──
  const permMode = trustFlag ? 'trust' as const : readonlyFlag ? 'readonly' as const : config.permissionMode
  const perm = new PermissionSystem(permMode)

  // ── Context & cost ──
  const contextMgr = new ContextManager({ maxTokens: currentProviderCfg.maxContextTokens ?? 120_000 })
  costTracker = new CostTracker()

  let isGit = false
  try { execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' }); isGit = true } catch {}

  // ── Engine ──
  engine = new AgentEngine({
    provider: currentProvider, tools, prompt, perm, contextMgr, costTracker, cwd, isGit,
    modelName: currentProviderCfg.model,
  })

  setAgentFactory(() => new AgentEngine({
    provider: currentProvider, tools, prompt, perm, cwd, isGit,
    contextMgr: new ContextManager(), maxTurns: 15,
  }))

  // ── Resume ──
  if (resumeFlag) {
    const session = resumeFlag.includes('=') ? loadSession(resumeFlag.split('=')[1]!) : getLastSession(cwd)
    if (session) { engine.setMessages([...session.messages]); console.log(`\x1b[90mResumed ${session.id} (${session.messages.length} msgs)\x1b[0m`) }
  }

  // ── Banner ──
  printBanner({
    version: '0.1.0',
    model: currentProviderCfg.model,
    provider: currentProviderName,
    mode: permMode,
    cwd,
    toolCount: tools.all().length,
    isGit,
    compact: !!oneshot,
  })

  if (oneshot) { runOnce(engine, oneshot, cwd, verboseFlag).then(() => process.exit(0)); return }

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '\x1b[38;5;208m🦞\x1b[0m ' })
  rl.prompt()
  rl.on('line', async line => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }
    if (input.startsWith('/')) { handleSlash(input, cwd, perm, tools, prompt, verboseFlag); rl.prompt(); return }
    await runOnce(engine, input, cwd, verboseFlag)
    console.log()
    rl.prompt()
  })
}

function handleSlash(cmd: string, cwd: string, perm: PermissionSystem, tools: ToolRegistry, prompt: PromptBuilder, verbose: boolean) {
  const parts = cmd.split(/\s+/)
  const c = parts[0]!.toLowerCase()

  if (c === '/quit' || c === '/exit' || c === '/q') process.exit(0)
  if (c === '/clear') { engine.clear(); console.log('Cleared.\n'); return }
  if (c === '/cost' || c === '/usage') { console.log(costTracker.format() + '\n'); return }
  if (c === '/save') { const id = saveSession(cwd, [...engine.getMessages()]); console.log(`Saved: ${id}\n`); return }

  // /model — show or switch
  if (c === '/model') {
    if (!parts[1]) {
      console.log(`Current: ${currentProviderCfg.model} (${currentProviderName})`)
      console.log(`Available: ${Object.entries(config.providers).map(([k, v]) => `${k}(${v.model})`).join(', ')}`)
      console.log(`Switch: /model <provider-name>\n`)
      return
    }
    const newName = parts[1]
    const newCfg = config.providers[newName]
    if (!newCfg?.apiKey) { console.log(`\x1b[31mNo API key for "${newName}"\x1b[0m\n`); return }

    currentProviderName = newName
    currentProviderCfg = newCfg
    currentProvider = buildProvider(newName, newCfg)

    // Rebuild engine keeping conversation history
    const msgs = [...engine.getMessages()]
    const isGit = (() => { try { execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' }); return true } catch { return false } })()
    engine = new AgentEngine({
      provider: currentProvider, tools, prompt, perm,
      contextMgr: new ContextManager({ maxTokens: newCfg.maxContextTokens ?? 120_000 }),
      costTracker, cwd, isGit, modelName: newCfg.model,
    })
    engine.setMessages(msgs)
    setAgentFactory(() => new AgentEngine({
      provider: currentProvider, tools, prompt, perm, cwd, isGit,
      contextMgr: new ContextManager(), maxTurns: 15,
    }))

    console.log(`\x1b[32mSwitched to ${newCfg.model} (${newName})\x1b[0m\n`)
    return
  }

  if (c === '/messages' || c === '/ctx') { console.log(`${engine.getMessages().length} messages\n`); return }

  if (c === '/compact') {
    console.log('Context will be compressed on next turn.\n')
    return
  }

  if (c === '/undo' && parts[1]) {
    const result = undoFile(parts[1])
    console.log(result.restored ? `\x1b[32mRestored ${parts[1]} from ${result.from}\x1b[0m` : `No snapshot for ${parts[1]}`)
    console.log()
    return
  }

  if (c === '/history' && parts[1]) {
    const h = getFileHistory(parts[1])
    if (!h.length) console.log('No snapshots.')
    else h.forEach(e => console.log(`  ${new Date(e.timestamp).toLocaleTimeString()} → ${e.snapshotFile}`))
    console.log()
    return
  }

  if (c === '/tools') {
    const all = tools.all()
    console.log(`\n${all.length} tools:\n`)
    for (const t of all) console.log(`  \x1b[36m${t.name.padEnd(16)}\x1b[0m ${t.readOnly ? '(ro)' : '    '} ${t.description.slice(0, 70)}`)
    console.log()
    return
  }

  if (c === '/allow' && parts[1]) { perm.addAlwaysAllow(parts[1], parts.slice(2).join(' ') || undefined); console.log(`Allow: ${parts[1]}\n`); return }
  if (c === '/deny' && parts[1]) { perm.addAlwaysDeny(parts[1], parts.slice(2).join(' ') || undefined); console.log(`Deny: ${parts[1]}\n`); return }

  if (c === '/help') {
    console.log([
      '',
      '  \x1b[36mConversation\x1b[0m',
      '  /clear              — reset conversation',
      '  /compact            — compress context on next turn',
      '  /messages           — message count in context',
      '',
      '  \x1b[36mModel\x1b[0m',
      '  /model              — show current model & available providers',
      '  /model <name>       — switch model (e.g. /model deepseek)',
      '  /tools              — list all registered tools',
      '',
      '  \x1b[36mSession\x1b[0m',
      '  /save               — save session to disk',
      '  /cost               — token usage & estimated cost',
      '',
      '  \x1b[36mFile history\x1b[0m',
      '  /undo <path>        — restore file to pre-edit snapshot',
      '  /history <path>     — list snapshots',
      '',
      '  \x1b[36mPermissions\x1b[0m',
      '  /allow <tool> [pat] — always allow a tool',
      '  /deny <tool> [pat]  — always deny a tool',
      '',
      '  \x1b[36mOther\x1b[0m',
      '  /help               — this message',
      '  /quit               — exit',
      '',
    ].join('\n'))
    return
  }

  console.log(`Unknown: ${cmd}. /help\n`)
}

async function runOnce(eng: AgentEngine, input: string, cwd: string, verbose: boolean) {
  const spinner = new Spinner()
  let textBuffer = ''
  let activeToolName = ''

  for await (const ev of eng.run(input)) {
    switch (ev.type) {
      case 'text':
        textBuffer += ev.content
        process.stdout.write(ev.content)
        break

      case 'thinking':
        if (verbose) process.stdout.write(`${c.dim}💭 ${ev.content}${c.reset}`)
        break

      case 'tool_start': {
        // Flush any text before tool call
        if (textBuffer) { textBuffer = ''; process.stdout.write('\n') }

        const icon = getToolIcon(ev.call.name)
        const inp = ev.call.input
        let detail = ''
        if (ev.call.name === 'Bash') detail = String(inp.command ?? '').slice(0, 100)
        else if (inp.path) detail = String(inp.path)
        else if (inp.pattern) detail = String(inp.pattern)
        else if (inp.url) detail = String(inp.url).slice(0, 60)
        else if (inp.query) detail = String(inp.query).slice(0, 60)
        else if (inp.task) detail = String(inp.task).slice(0, 60)
        else if (inp.question) detail = String(inp.question).slice(0, 60)

        console.log(formatToolStart(ev.call.name, icon, detail))
        activeToolName = ev.call.name
        spinner.start(`${ev.call.name} running...`)
        break
      }

      case 'tool_done': {
        spinner.stop()
        if (ev.isError) {
          console.log(formatToolError(ev.output.slice(0, 400)))
        } else {
          const preview = ev.output.replace(/\n/g, ' ').slice(0, 160)
          console.log(formatToolSuccess(preview + (ev.output.length > 160 ? '…' : '')))
        }
        activeToolName = ''
        break
      }

      case 'compressed':
        spinner.stop()
        console.log(formatCompressed(ev.fromMessages, ev.toMessages))
        break

      case 'finished': {
        spinner.stop()
        // Apply code highlighting to accumulated text
        if (textBuffer.includes('```')) {
          // Already printed raw, but future: buffer and highlight
        }
        process.stdout.write('\n')
        if (verbose && ev.usage) {
          console.log(formatCost(costTracker.format()))
        }
        break
      }

      case 'error':
        spinner.stop()
        console.error(`\n  ${c.red}${c.bold}✗ Error:${c.reset} ${c.red}${ev.message}${c.reset}`)
        break
    }
  }

  try { saveSession(cwd, [...eng.getMessages()]) } catch {}
  extractAndSaveMemories([...eng.getMessages()], currentProvider, cwd.split('/').pop()).catch(() => {})
}

main()
