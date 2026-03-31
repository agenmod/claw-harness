/**
 * Tracks token usage and estimated cost across the session.
 */
export class CostTracker {
  private inputTokens = 0
  private outputTokens = 0
  private pricePerMillionInput: number
  private pricePerMillionOutput: number

  constructor(opts?: { inputPrice?: number; outputPrice?: number }) {
    this.pricePerMillionInput = opts?.inputPrice ?? 1.0  // $/M tokens, default cheap
    this.pricePerMillionOutput = opts?.outputPrice ?? 2.0
  }

  add(input: number, output: number) {
    this.inputTokens += input
    this.outputTokens += output
  }

  get totalInput() { return this.inputTokens }
  get totalOutput() { return this.outputTokens }
  get totalTokens() { return this.inputTokens + this.outputTokens }

  get costUsd(): number {
    return (this.inputTokens / 1_000_000) * this.pricePerMillionInput
      + (this.outputTokens / 1_000_000) * this.pricePerMillionOutput
  }

  format(): string {
    return `Tokens: ${this.totalTokens.toLocaleString()} (in: ${this.inputTokens.toLocaleString()}, out: ${this.outputTokens.toLocaleString()}) ≈ $${this.costUsd.toFixed(4)}`
  }
}
