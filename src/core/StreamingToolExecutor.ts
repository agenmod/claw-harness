import type { ToolCall } from './types.js'
import type { Tool, ToolResult, ToolContext } from '../tools/Tool.js'
import type { ToolRegistry } from '../tools/ToolRegistry.js'
import type { PermissionSystem } from '../permission/PermissionSystem.js'

/**
 * Starts executing tools as soon as their input is available,
 * while the model is still streaming. Results are collected and
 * returned in order after streaming completes.
 */
export class StreamingToolExecutor {
  private pending = new Map<string, Promise<{ call: ToolCall; result: ToolResult }>>()
  private registry: ToolRegistry
  private perm: PermissionSystem
  private ctx: ToolContext

  constructor(registry: ToolRegistry, perm: PermissionSystem, ctx: ToolContext) {
    this.registry = registry
    this.perm = perm
    this.ctx = ctx
  }

  /** Start executing a tool immediately (called during streaming) */
  submit(call: ToolCall): void {
    const promise = this.executeSingle(call)
    this.pending.set(call.id, promise)
  }

  /** Collect all results (called after streaming completes) */
  async *collect(): AsyncGenerator<{ call: ToolCall; result: ToolResult }> {
    for (const [, promise] of this.pending) {
      yield await promise
    }
    this.pending.clear()
  }

  private async executeSingle(call: ToolCall): Promise<{ call: ToolCall; result: ToolResult }> {
    const tool = this.registry.get(call.name)
    if (!tool) {
      return { call, result: { output: `Unknown tool: ${call.name}`, isError: true } }
    }

    // Only start read-only tools eagerly; write tools wait
    if (!tool.readOnly) {
      const ok = await this.perm.check(tool, call.input)
      if (!ok) return { call, result: { output: 'Permission denied', isError: true } }
    }

    try {
      const result = await tool.run(call.input, this.ctx)
      return { call, result }
    } catch (e: any) {
      return { call, result: { output: `Tool error: ${e.message}`, isError: true } }
    }
  }
}
