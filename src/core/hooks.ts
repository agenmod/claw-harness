/**
 * Hook system for the agent engine.
 * Allows pre/post processing of tool calls, API requests, and completions.
 */
import type { Message, ToolCall } from './types.js'
import type { ToolResult } from '../tools/Tool.js'

export type HookPhase = 'preToolCall' | 'postToolCall' | 'preApiCall' | 'postApiCall' | 'onStop'

export interface PreToolCallHook {
  phase: 'preToolCall'
  handler: (call: ToolCall, messages: Message[]) => Promise<{
    action: 'allow' | 'deny' | 'modify'
    modifiedInput?: Record<string, unknown>
    reason?: string
  }>
}

export interface PostToolCallHook {
  phase: 'postToolCall'
  handler: (call: ToolCall, result: ToolResult, messages: Message[]) => Promise<{
    action: 'continue' | 'stop' | 'retry'
    modifiedResult?: ToolResult
    reason?: string
  }>
}

export interface PreApiCallHook {
  phase: 'preApiCall'
  handler: (messages: Message[]) => Promise<{
    action: 'continue' | 'abort'
    modifiedMessages?: Message[]
    reason?: string
  }>
}

export interface OnStopHook {
  phase: 'onStop'
  handler: (messages: Message[], lastAssistantText: string) => Promise<{
    action: 'accept' | 'retry'
    injectedMessage?: Message
    reason?: string
  }>
}

export type Hook = PreToolCallHook | PostToolCallHook | PreApiCallHook | OnStopHook

export class HookRegistry {
  private hooks: Hook[] = []

  register(hook: Hook) {
    this.hooks.push(hook)
  }

  async runPreToolCall(call: ToolCall, messages: Message[]): Promise<{
    allowed: boolean
    modifiedInput?: Record<string, unknown>
    reason?: string
  }> {
    for (const h of this.hooks) {
      if (h.phase !== 'preToolCall') continue
      const result = await h.handler(call, messages)
      if (result.action === 'deny') return { allowed: false, reason: result.reason }
      if (result.action === 'modify') return { allowed: true, modifiedInput: result.modifiedInput }
    }
    return { allowed: true }
  }

  async runPostToolCall(call: ToolCall, result: ToolResult, messages: Message[]): Promise<{
    action: 'continue' | 'stop' | 'retry'
    modifiedResult?: ToolResult
  }> {
    for (const h of this.hooks) {
      if (h.phase !== 'postToolCall') continue
      const res = await h.handler(call, result, messages)
      if (res.action !== 'continue') return res
    }
    return { action: 'continue' }
  }

  async runOnStop(messages: Message[], lastText: string): Promise<{
    action: 'accept' | 'retry'
    injectedMessage?: Message
  }> {
    for (const h of this.hooks) {
      if (h.phase !== 'onStop') continue
      const res = await h.handler(messages, lastText)
      if (res.action === 'retry') return res
    }
    return { action: 'accept' }
  }
}
