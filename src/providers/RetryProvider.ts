import type { ChatRequest, ModelProvider } from './ModelProvider.js'
import type { StreamChunk } from '../core/types.js'

/**
 * Wraps a ModelProvider with retry + exponential backoff + optional fallback.
 */
export class RetryProvider implements ModelProvider {
  readonly name: string
  private primary: ModelProvider
  private fallback?: ModelProvider
  private maxRetries: number
  private baseDelayMs: number

  constructor(opts: {
    primary: ModelProvider
    fallback?: ModelProvider
    maxRetries?: number
    baseDelayMs?: number
  }) {
    this.primary = opts.primary
    this.fallback = opts.fallback
    this.maxRetries = opts.maxRetries ?? 3
    this.baseDelayMs = opts.baseDelayMs ?? 1000
    this.name = opts.primary.name
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const provider = (attempt === this.maxRetries && this.fallback) ? this.fallback : this.primary
      try {
        for await (const chunk of provider.chat(req)) {
          yield chunk
        }
        return
      } catch (err: any) {
        lastError = err
        // Don't retry on 4xx client errors (except 429 rate limit)
        const status = err?.status ?? err?.statusCode
        if (status && status >= 400 && status < 500 && status !== 429) {
          break
        }
        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }

    yield { type: 'error', message: `API failed after ${this.maxRetries + 1} attempts: ${lastError?.message ?? 'unknown'}` }
  }
}
