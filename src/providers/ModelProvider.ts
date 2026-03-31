import type { Message, StreamChunk } from '../core/types.js'

/** JSON Schema for a tool parameter, sent to the model */
export interface FunctionSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Chat request params */
export interface ChatRequest {
  systemPrompt: string
  messages: Message[]
  tools?: FunctionSchema[]
  maxTokens?: number
  signal?: AbortSignal
}

/** Every LLM backend implements this interface */
export interface ModelProvider {
  readonly name: string
  chat(req: ChatRequest): AsyncGenerator<StreamChunk>
}
