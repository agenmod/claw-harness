// ── Message types (enriched from CC's ~1,200 line message system, simplified) ──

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface Message {
  role: Role
  content: string
  toolCallId?: string
  /** Internal metadata */
  meta?: MessageMeta
}

export interface MessageMeta {
  uuid?: string
  timestamp?: number
  /** For assistant messages: the tool calls that were made */
  toolCalls?: ToolCall[]
  /** Whether this is a synthetic/injected message (compression summary, error, etc.) */
  synthetic?: boolean
  /** Source: 'user_input' | 'tool_result' | 'compact_summary' | 'system_inject' | 'recovery' */
  source?: string
  /** If tool result was truncated, the original size */
  originalSize?: number
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

// ── Stream chunks from provider ──

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall }
  | { type: 'thinking'; text: string }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'error'; message: string }

// ── Events emitted by AgentEngine ──

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; call: ToolCall }
  | { type: 'tool_done'; call: ToolCall; output: string; isError: boolean }
  | { type: 'compressed'; fromMessages: number; toMessages: number }
  | { type: 'finished'; usage?: TokenUsage }
  | { type: 'error'; message: string }

// ── Token tracking ──

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

// ── Config ──

export interface ProviderConfig {
  endpoint: string
  apiKey: string
  model: string
  maxTokens?: number
  maxContextTokens?: number
}

export interface AppConfig {
  defaultProvider: string
  providers: Record<string, ProviderConfig>
  permissionMode: 'trust' | 'confirm' | 'readonly'
}

// ── Serialization helpers ──

export function serializeMessages(messages: Message[]): string {
  return JSON.stringify(messages.map(m => ({
    role: m.role,
    content: m.content,
    toolCallId: m.toolCallId,
    meta: m.meta,
  })))
}

export function deserializeMessages(json: string): Message[] {
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}
