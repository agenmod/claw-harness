import type { Message } from './types.js'
import type { ModelProvider, ChatRequest } from '../providers/ModelProvider.js'

/**
 * Multi-strategy context manager:
 * 1. microCompact — trim large tool results in-place
 * 2. autoCompact — summarize old messages when approaching limit
 * 3. reactiveCompact — emergency compress on API 413 error
 */
export class ContextManager {
  private maxTokens: number
  private autoThreshold: number   // fraction (0-1) to trigger autoCompact
  private microMaxChars: number   // max chars per tool result before trimming

  constructor(opts?: { maxTokens?: number; autoThreshold?: number; microMaxChars?: number }) {
    this.maxTokens = opts?.maxTokens ?? 120_000
    this.autoThreshold = opts?.autoThreshold ?? 0.75
    this.microMaxChars = opts?.microMaxChars ?? 15_000
  }

  estimateTokens(messages: Message[]): number {
    let chars = 0
    for (const m of messages) chars += m.content.length
    return Math.ceil(chars / 4)
  }

  shouldCompress(messages: Message[]): boolean {
    return this.estimateTokens(messages) > this.maxTokens * this.autoThreshold
  }

  /**
   * Strategy 1: microCompact — trim oversized tool results.
   * Runs before autoCompact. Cheap, no API call.
   */
  microCompact(messages: Message[]): Message[] {
    return messages.map(m => {
      if (m.role !== 'tool' || m.content.length <= this.microMaxChars) return m

      const half = Math.floor(this.microMaxChars / 2)
      const head = m.content.slice(0, half)
      const tail = m.content.slice(-half)
      const omitted = m.content.length - this.microMaxChars
      return {
        ...m,
        content: `${head}\n\n... (${omitted.toLocaleString()} chars omitted) ...\n\n${tail}`,
      }
    })
  }

  /**
   * Strategy 2: autoCompact — summarize older messages.
   * Keeps recent context, replaces middle with a model-generated summary.
   */
  async autoCompact(messages: Message[], provider: ModelProvider): Promise<Message[]> {
    // Apply micro first
    let msgs = this.microCompact(messages)

    if (!this.shouldCompress(msgs)) return msgs
    if (msgs.length < 6) return msgs

    // Determine how many recent messages to keep (at least last 4 turns)
    const keepRecent = Math.min(8, Math.floor(msgs.length * 0.3))
    const keepStart = 2 // first user message + first assistant response

    const head = msgs.slice(0, keepStart)
    const middle = msgs.slice(keepStart, msgs.length - keepRecent)
    const tail = msgs.slice(msgs.length - keepRecent)

    if (middle.length < 2) return msgs

    // Build summary prompt
    const middleText = middle.map((m, i) => {
      const content = m.content.length > 600 ? m.content.slice(0, 600) + '...' : m.content
      return `[${m.role}] ${content}`
    }).join('\n\n')

    let summary = ''
    const req: ChatRequest = {
      systemPrompt: 'You summarize conversations. Output a concise summary preserving: key decisions made, files changed, errors encountered, and pending tasks. No preamble.',
      messages: [{ role: 'user', content: `Summarize this conversation segment (${middle.length} messages):\n\n${middleText}` }],
      maxTokens: 2048,
    }

    try {
      for await (const chunk of provider.chat(req)) {
        if (chunk.type === 'text') summary += chunk.text
      }
    } catch {
      // If summarization fails, just do aggressive micro-compact
      return this.aggressiveMicro(msgs)
    }

    const compactMsg: Message = {
      role: 'system',
      content: `[Context compressed — ${middle.length} messages summarized]\n\n${summary}`,
    }

    const result = [...head, compactMsg, ...tail]

    // Verify we actually reduced tokens
    if (this.estimateTokens(result) >= this.estimateTokens(msgs)) {
      return this.aggressiveMicro(msgs)
    }

    return result
  }

  /**
   * Strategy 3: reactiveCompact — emergency compress when API returns 413.
   * More aggressive than autoCompact.
   */
  async reactiveCompact(messages: Message[], provider: ModelProvider): Promise<Message[]> {
    // First try aggressive micro
    let msgs = this.aggressiveMicro(messages)
    if (this.estimateTokens(msgs) < this.maxTokens * 0.6) return msgs

    // Then do autoCompact with tighter params
    const keepRecent = 4
    const keepStart = 1

    if (msgs.length <= keepRecent + keepStart) {
      // Can't compress further — just truncate tool results
      return msgs.map(m => ({
        ...m,
        content: m.content.slice(0, 2000),
      }))
    }

    const head = msgs.slice(0, keepStart)
    const middle = msgs.slice(keepStart, msgs.length - keepRecent)
    const tail = msgs.slice(msgs.length - keepRecent)

    const middleText = middle.map(m => {
      return `[${m.role}] ${m.content.slice(0, 300)}`
    }).join('\n')

    let summary = ''
    try {
      for await (const chunk of provider.chat({
        systemPrompt: 'Summarize in ≤200 words. Preserve: files changed, errors, pending work.',
        messages: [{ role: 'user', content: `Emergency summary of ${middle.length} messages:\n${middleText}` }],
        maxTokens: 512,
      })) {
        if (chunk.type === 'text') summary += chunk.text
      }
    } catch {
      summary = `(${middle.length} messages removed to fit context window)`
    }

    return [...head, { role: 'system' as const, content: `[Emergency context compression]\n${summary}` }, ...tail]
  }

  /**
   * Aggressive micro-compact: much smaller limits per tool result.
   */
  private aggressiveMicro(messages: Message[]): Message[] {
    return messages.map(m => {
      if (m.role !== 'tool' || m.content.length <= 3000) return m
      const head = m.content.slice(0, 1500)
      const tail = m.content.slice(-1000)
      return { ...m, content: `${head}\n... (trimmed) ...\n${tail}` }
    })
  }
}
