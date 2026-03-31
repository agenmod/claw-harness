import type { ModelProvider } from '../providers/ModelProvider.js'
import type { ToolRegistry } from '../tools/ToolRegistry.js'
import type { PromptBuilder, PromptOptions } from '../prompt/PromptBuilder.js'
import type { PermissionSystem } from '../permission/PermissionSystem.js'
import type { ContextManager } from './ContextManager.js'
import type { CostTracker } from '../utils/costTracker.js'
import type { HookRegistry } from './hooks.js'
import { executeTools } from './toolOrchestration.js'
import { snipCompact, groupCompact, identifyPreservedSegment } from './compactStrategies.js'
import { budgetToolResult } from '../utils/toolResultBudget.js'
import { isPlanMode } from '../tools/PlanModeTool.js'
import type { Message, AgentEvent, ToolCall, TokenUsage } from './types.js'

// ── State machine transitions (inspired by CC's query.ts) ──

type TransitionReason =
  | 'next_turn'            // normal: tool results → call API again
  | 'output_truncated'     // model output was cut off mid-sentence
  | 'reactive_compact'     // API returned 413, emergency compress
  | 'auto_compact'         // proactive compression at threshold
  | 'stop_hook_retry'      // onStop hook requested retry
  | 'max_turns'            // hit turn limit
  | 'completed'            // model finished (no tool calls)
  | 'error'                // unrecoverable error

interface LoopState {
  messages: Message[]
  turn: number
  outputRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  lastTransition?: TransitionReason
}

const MAX_OUTPUT_RECOVERY = 3
const MAX_REACTIVE_COMPACT_ATTEMPTS = 2

export interface EngineConfig {
  provider: ModelProvider
  tools: ToolRegistry
  prompt: PromptBuilder
  perm: PermissionSystem
  contextMgr: ContextManager
  costTracker?: CostTracker
  hooks?: HookRegistry
  cwd: string
  maxTurns?: number
  isGit?: boolean
  modelName?: string
}

export class AgentEngine {
  private messages: Message[] = []
  private provider: ModelProvider
  private tools: ToolRegistry
  private prompt: PromptBuilder
  private perm: PermissionSystem
  private contextMgr: ContextManager
  private costTracker?: CostTracker
  private hooks?: HookRegistry
  private cwd: string
  private maxTurns: number
  private promptOpts: PromptOptions

  constructor(cfg: EngineConfig) {
    this.provider = cfg.provider
    this.tools = cfg.tools
    this.prompt = cfg.prompt
    this.perm = cfg.perm
    this.contextMgr = cfg.contextMgr
    this.costTracker = cfg.costTracker
    this.hooks = cfg.hooks
    this.cwd = cfg.cwd
    this.maxTurns = cfg.maxTurns ?? 30

    this.promptOpts = {
      tools: this.tools.schemas(),
      cwd: this.cwd,
      isGit: cfg.isGit,
      permissionMode: this.perm.mode,
      modelName: cfg.modelName,
    }
  }

  /**
   * Main agent loop — state machine with explicit transitions.
   *
   * Each iteration: compress? → call API → stream → tools → decide next transition.
   */
  async *run(userInput: string): AsyncGenerator<AgentEvent> {
    this.messages.push({
      role: 'user', content: userInput,
      meta: { timestamp: Date.now(), source: 'user_input' },
    })

    const systemPrompt = this.prompt.build(this.promptOpts)

    const state: LoopState = {
      messages: this.messages,
      turn: 0,
      outputRecoveryCount: 0,
      hasAttemptedReactiveCompact: false,
    }

    while (state.turn < this.maxTurns) {
      state.turn++

      // ── Phase 1: Context management ──
      const compactEvent = yield* this.phaseCompress(state, systemPrompt)
      if (compactEvent) yield compactEvent

      // ── Phase 2: Call model ──
      const apiResult = yield* this.phaseCallModel(state, systemPrompt)

      if (apiResult.type === 'error_413') {
        // Reactive compact and retry
        if (!state.hasAttemptedReactiveCompact) {
          state.hasAttemptedReactiveCompact = true
          state.messages = await this.contextMgr.reactiveCompact(state.messages, this.provider)
          this.messages = state.messages
          yield { type: 'compressed', fromMessages: state.messages.length + 5, toMessages: state.messages.length }
          state.lastTransition = 'reactive_compact'
          continue
        }
        yield { type: 'error', message: 'Context too long even after compression' }
        return
      }

      if (apiResult.type === 'error') {
        yield { type: 'error', message: apiResult.message }
        return
      }

      // Save assistant message
      if (apiResult.text) {
        state.messages.push({
          role: 'assistant', content: apiResult.text,
          meta: { timestamp: Date.now(), toolCalls: apiResult.toolCalls.length ? apiResult.toolCalls : undefined },
        })
      }

      // ── Phase 3: No tools → check if done ──
      if (apiResult.toolCalls.length === 0) {
        // Truncation recovery
        if (this.looksLikeTruncated(apiResult.text) && state.outputRecoveryCount < MAX_OUTPUT_RECOVERY) {
          state.outputRecoveryCount++
          state.messages.push({
            role: 'user', content: 'Continue from where you left off. No recap.',
            meta: { synthetic: true, source: 'recovery' },
          })
          state.lastTransition = 'output_truncated'
          continue
        }

        // onStop hook
        if (this.hooks) {
          const hookResult = await this.hooks.runOnStop(state.messages, apiResult.text)
          if (hookResult.action === 'retry' && hookResult.injectedMessage) {
            state.messages.push(hookResult.injectedMessage)
            state.lastTransition = 'stop_hook_retry'
            continue
          }
        }

        yield { type: 'finished', usage: this.costTracker ? {
          inputTokens: this.costTracker.totalInput,
          outputTokens: this.costTracker.totalOutput,
        } : undefined }
        state.lastTransition = 'completed'
        return
      }

      // ── Phase 4: Execute tools ──
      if (!apiResult.text) {
        state.messages.push({
          role: 'assistant',
          content: apiResult.toolCalls.map(c => `[tool: ${c.name}]`).join(' '),
          meta: { timestamp: Date.now(), toolCalls: apiResult.toolCalls },
        })
      }

      yield* this.phaseExecuteTools(state, apiResult.toolCalls)

      state.outputRecoveryCount = 0
      state.hasAttemptedReactiveCompact = false
      state.lastTransition = 'next_turn'
    }

    yield { type: 'error', message: `Reached max turns (${this.maxTurns})` }
  }

  // ── Phase implementations ──

  private async *phaseCompress(
    state: LoopState,
    _systemPrompt: string,
  ): AsyncGenerator<AgentEvent, AgentEvent | null> {
    // Step 1: snip large old tool results (cheap, no API)
    if (state.turn > 3) {
      const { messages: snipped, tokensFreed } = snipCompact(state.messages)
      if (tokensFreed > 0) {
        state.messages = snipped
        this.messages = snipped
      }
    }

    // Step 2: auto compact if approaching limit
    if (this.contextMgr.shouldCompress(state.messages)) {
      const prevLen = state.messages.length
      // Group consecutive tool calls first (cheap)
      const grouped = groupCompact(state.messages)
      // Then summarize if still too long
      state.messages = await this.contextMgr.autoCompact(grouped, this.provider)
      this.messages = state.messages
      if (state.messages.length < prevLen) {
        return { type: 'compressed', fromMessages: prevLen, toMessages: state.messages.length }
      }
    }

    return null
  }

  private async *phaseCallModel(
    state: LoopState,
    systemPrompt: string,
  ): AsyncGenerator<AgentEvent, { type: 'ok' | 'error' | 'error_413'; text: string; toolCalls: ToolCall[]; message: string }> {
    const toolCalls: ToolCall[] = []
    let text = ''

    try {
      for await (const chunk of this.provider.chat({
        systemPrompt,
        messages: state.messages,
        tools: this.tools.schemas(),
      })) {
        switch (chunk.type) {
          case 'text':
            text += chunk.text
            yield { type: 'text', content: chunk.text }
            break
          case 'thinking':
            yield { type: 'thinking', content: chunk.text }
            break
          case 'tool_use':
            toolCalls.push(chunk.toolCall)
            yield { type: 'tool_start', call: chunk.toolCall }
            break
          case 'error':
            if (chunk.message.includes('too long') || chunk.message.includes('413') || chunk.message.includes('context')) {
              return { type: 'error_413', text, toolCalls, message: chunk.message }
            }
            return { type: 'error', text, toolCalls, message: chunk.message }
          case 'done':
            if (chunk.usage) this.costTracker?.add(chunk.usage.inputTokens, chunk.usage.outputTokens)
            break
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      if (msg.includes('too long') || msg.includes('413')) {
        return { type: 'error_413', text, toolCalls, message: msg }
      }
      return { type: 'error', text, toolCalls, message: msg }
    }

    return { type: 'ok', text, toolCalls, message: '' }
  }

  private async *phaseExecuteTools(state: LoopState, toolCalls: ToolCall[]): AsyncGenerator<AgentEvent> {
    const ctx = { cwd: this.cwd, permissionMode: this.perm.mode }

    for await (const { call, result } of executeTools(toolCalls, this.tools, this.perm, ctx)) {
      // Pre-hook
      if (this.hooks) {
        const hookRes = await this.hooks.runPreToolCall(call, state.messages)
        if (!hookRes.allowed) {
          const msg = `Blocked by hook: ${hookRes.reason}`
          state.messages.push({ role: 'tool', content: msg, toolCallId: call.id })
          yield { type: 'tool_done', call, output: msg, isError: true }
          continue
        }
        if (hookRes.modifiedInput) Object.assign(call.input, hookRes.modifiedInput)
      }

      // Budget large results
      const budgeted = budgetToolResult(result.output, call.name)

      state.messages.push({
        role: 'tool', content: budgeted.content, toolCallId: call.id,
        meta: { timestamp: Date.now(), source: 'tool_result', originalSize: budgeted.stored ? result.output.length : undefined },
      })

      yield { type: 'tool_done', call, output: budgeted.content, isError: result.isError }

      // Post-hook
      if (this.hooks) {
        const postRes = await this.hooks.runPostToolCall(call, result, state.messages)
        if (postRes.action === 'stop') return
      }
    }

    this.messages = state.messages
  }

  // ── Helpers ──

  private looksLikeTruncated(text: string): boolean {
    if (!text || text.length < 200) return false
    const trimmed = text.trim()
    const lastChar = trimmed.slice(-1)
    if (['.', '!', '?', '`', '"', "'", ')', ']', '}', '\n'].includes(lastChar)) return false
    // Unclosed code block
    if ((trimmed.match(/```/g)?.length ?? 0) % 2 !== 0) return true
    return true
  }

  getMessages(): readonly Message[] { return this.messages }
  setMessages(msgs: Message[]) { this.messages = msgs }
  clear() { this.messages = [] }
}
