import OpenAI from 'openai'
import type { ChatRequest, ModelProvider, FunctionSchema } from './ModelProvider.js'
import type { Message, StreamChunk, ToolCall, TokenUsage } from '../core/types.js'

/**
 * OpenAI-compatible provider — full implementation with:
 * - Proper tool_calls protocol (assistant messages carry tool_calls array)
 * - Streaming with usage extraction
 * - Thinking/reasoning token support (DeepSeek-R1 style)
 * - Error categorization for retry decisions
 */
export class OpenAICompatProvider implements ModelProvider {
  readonly name: string
  private client: OpenAI
  private model: string
  private supportsThinking: boolean

  constructor(opts: {
    name: string
    endpoint: string
    apiKey: string
    model: string
    supportsThinking?: boolean
  }) {
    this.name = opts.name
    this.model = opts.model
    this.supportsThinking = opts.supportsThinking ?? false
    this.client = new OpenAI({ baseURL: opts.endpoint, apiKey: opts.apiKey })
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const messages = this.buildMessages(req.systemPrompt, req.messages)
    const tools = req.tools?.length ? this.buildTools(req.tools) : undefined

    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>

    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools,
        stream: true,
        max_tokens: req.maxTokens ?? 8192,
        temperature: 0,
        stream_options: { include_usage: true },
      })
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      const status = err?.status ?? err?.statusCode
      if (status === 413 || msg.includes('too long') || msg.includes('context length')) {
        yield { type: 'error', message: `Context too long (${status ?? '413'}): ${msg}` }
        return
      }
      throw err
    }

    const pendingCalls = new Map<number, { id: string; name: string; args: string }>()
    let usage: TokenUsage | undefined

    for await (const chunk of stream) {
      // Usage (comes with the final chunk when stream_options.include_usage is set)
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        }
      }

      const choice = chunk.choices?.[0]
      if (!choice) continue
      const delta = choice.delta

      // Text content
      if (delta.content) {
        yield { type: 'text', text: delta.content }
      }

      // Reasoning/thinking content (DeepSeek-R1, etc.)
      const reasoning = (delta as any).reasoning_content
      if (reasoning) {
        yield { type: 'thinking', text: reasoning }
      }

      // Tool calls (streamed incrementally)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!pendingCalls.has(tc.index)) {
            pendingCalls.set(tc.index, { id: tc.id ?? `call_${tc.index}`, name: '', args: '' })
          }
          const p = pendingCalls.get(tc.index)!
          if (tc.id) p.id = tc.id
          if (tc.function?.name) p.name = tc.function.name
          if (tc.function?.arguments) p.args += tc.function.arguments
        }
      }

      // Finish: emit accumulated tool calls
      if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
        for (const [, tc] of pendingCalls) {
          let input: Record<string, unknown> = {}
          try { input = JSON.parse(tc.args) } catch { input = { _raw: tc.args } }
          yield { type: 'tool_use', toolCall: { id: tc.id, name: tc.name, input } }
        }
      }

      // Length limit hit
      if (choice.finish_reason === 'length') {
        // Signal that output was truncated
        yield { type: 'text', text: '' } // empty text to trigger truncation detection
      }
    }

    yield { type: 'done', usage }
  }

  /**
   * Build proper OpenAI message format.
   * Assistant messages with tool_calls get the tool_calls array.
   */
  private buildMessages(system: string, messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    const out: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
    ]

    for (const m of messages) {
      if (m.role === 'tool') {
        out.push({ role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content })
        continue
      }

      if (m.role === 'assistant') {
        const toolCalls = m.meta?.toolCalls
        if (toolCalls?.length) {
          out.push({
            role: 'assistant',
            content: m.content || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          })
        } else {
          out.push({ role: 'assistant', content: m.content })
        }
        continue
      }

      if (m.role === 'system') {
        // Mid-conversation system messages → inject as user message
        out.push({ role: 'user', content: `[System note: ${m.content}]` })
        continue
      }

      out.push({ role: 'user', content: m.content })
    }

    return out
  }

  private buildTools(schemas: FunctionSchema[]): OpenAI.Chat.ChatCompletionTool[] {
    return schemas.map(s => ({
      type: 'function' as const,
      function: {
        name: s.name,
        description: s.description,
        parameters: s.parameters,
      },
    }))
  }
}
