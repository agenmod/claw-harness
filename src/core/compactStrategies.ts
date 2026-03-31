/**
 * Advanced compaction strategies beyond basic autoCompact.
 */
import type { Message } from './types.js'

/**
 * snipCompact — selectively trim tool results in the middle of conversation.
 * Keeps structure (tool call names + error status) but removes large outputs.
 * Much cheaper than full summarization — no API call needed.
 */
export function snipCompact(messages: Message[], maxToolResultChars = 500): {
  messages: Message[]
  tokensFreed: number
} {
  const protectedTailCount = 6 // keep recent messages intact
  const cutoff = messages.length - protectedTailCount
  let tokensFreed = 0

  const result = messages.map((m, i) => {
    if (i >= cutoff) return m // protected tail
    if (m.role !== 'tool') return m
    if (m.content.length <= maxToolResultChars) return m

    const originalSize = m.content.length
    const preview = m.content.slice(0, Math.floor(maxToolResultChars / 2))
    const tail = m.content.slice(-Math.floor(maxToolResultChars / 4))
    const snipped = `${preview}\n[... ${originalSize - maxToolResultChars} chars snipped ...]\n${tail}`

    tokensFreed += Math.ceil((originalSize - snipped.length) / 4)

    return { ...m, content: snipped, meta: { ...m.meta, originalSize } }
  })

  return { messages: result, tokensFreed }
}

/**
 * groupCompact — groups consecutive tool call/result pairs and summarizes them.
 * E.g., 5 Read calls → "Read 5 files: a.ts, b.ts, c.ts, d.ts, e.ts"
 */
export function groupCompact(messages: Message[]): Message[] {
  const result: Message[] = []
  let i = 0

  while (i < messages.length) {
    // Look for consecutive assistant+tool pairs
    if (messages[i]!.role === 'assistant' && messages[i]!.meta?.toolCalls) {
      const groupStart = i
      const toolNames: string[] = []
      const toolSummaries: string[] = []

      // Collect the assistant message's tool calls
      const toolCalls = messages[i]!.meta!.toolCalls!
      toolNames.push(...toolCalls.map(tc => tc.name))
      i++

      // Collect corresponding tool results
      while (i < messages.length && messages[i]!.role === 'tool') {
        const content = messages[i]!.content
        const truncated = content.length > 100 ? content.slice(0, 100) + '...' : content
        toolSummaries.push(truncated)
        i++
      }

      // If this is just 1-2 tool calls, keep as-is
      if (toolNames.length <= 2) {
        for (let j = groupStart; j < i; j++) result.push(messages[j]!)
        continue
      }

      // Group into a summary
      const summary = toolNames.map((name, idx) => {
        const res = toolSummaries[idx] ?? ''
        return `${name}: ${res}`
      }).join('\n')

      result.push({
        role: 'system',
        content: `[Grouped ${toolNames.length} tool calls: ${[...new Set(toolNames)].join(', ')}]\n${summary}`,
        meta: { synthetic: true, source: 'group_compact' },
      })
      continue
    }

    result.push(messages[i]!)
    i++
  }

  return result
}

/**
 * preservedSegment — identifies messages that should survive compaction.
 * These are: the original user request, the most recent user message,
 * and any messages with critical context (errors, file changes).
 */
export function identifyPreservedSegment(messages: Message[]): {
  headCount: number
  tailCount: number
} {
  // Always keep first user message
  let headCount = 1
  for (let i = 0; i < Math.min(3, messages.length); i++) {
    if (messages[i]!.role === 'user' || messages[i]!.role === 'system') headCount = i + 1
    else break
  }

  // Keep recent context: at least 4 messages, up to 8
  let tailCount = 4
  const recent = messages.slice(-8)
  // If recent messages include tool errors, keep more context
  const hasErrors = recent.some(m => m.role === 'tool' && m.content.toLowerCase().includes('error'))
  if (hasErrors) tailCount = Math.min(8, messages.length - headCount)

  return { headCount, tailCount }
}
