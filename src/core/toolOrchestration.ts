import type { ToolCall, Message } from './types.js'
import type { Tool, ToolResult, ToolContext } from '../tools/Tool.js'
import type { ToolRegistry } from '../tools/ToolRegistry.js'
import type { PermissionSystem } from '../permission/PermissionSystem.js'

export interface ToolExecResult {
  call: ToolCall
  result: ToolResult
}

/**
 * Executes tool calls with concurrency support.
 * Read-only tools run in parallel; write tools run sequentially.
 */
export async function* executeTools(
  calls: ToolCall[],
  registry: ToolRegistry,
  perm: PermissionSystem,
  ctx: ToolContext,
): AsyncGenerator<ToolExecResult> {
  // Partition into batches: consecutive read-only tools can run in parallel
  const batches = partitionCalls(calls, registry)

  for (const batch of batches) {
    if (batch.concurrent) {
      const promises = batch.calls.map(call => executeSingle(call, registry, perm, ctx))
      const results = await Promise.all(promises)
      for (const r of results) yield r
    } else {
      for (const call of batch.calls) {
        yield await executeSingle(call, registry, perm, ctx)
      }
    }
  }
}

async function executeSingle(
  call: ToolCall,
  registry: ToolRegistry,
  perm: PermissionSystem,
  ctx: ToolContext,
): Promise<ToolExecResult> {
  const tool = registry.get(call.name)
  if (!tool) {
    return { call, result: { output: `Unknown tool: ${call.name}`, isError: true } }
  }

  const ok = await perm.check(tool, call.input)
  if (!ok) {
    return { call, result: { output: 'Permission denied', isError: true } }
  }

  try {
    const result = await tool.run(call.input, ctx)
    return { call, result }
  } catch (e: any) {
    return { call, result: { output: `Tool error: ${e.message}`, isError: true } }
  }
}

interface Batch {
  concurrent: boolean
  calls: ToolCall[]
}

function partitionCalls(calls: ToolCall[], registry: ToolRegistry): Batch[] {
  const batches: Batch[] = []
  let currentReadOnly: ToolCall[] = []

  const flushReadOnly = () => {
    if (currentReadOnly.length > 0) {
      batches.push({ concurrent: true, calls: currentReadOnly })
      currentReadOnly = []
    }
  }

  for (const call of calls) {
    const tool = registry.get(call.name)
    if (tool?.readOnly) {
      currentReadOnly.push(call)
    } else {
      flushReadOnly()
      batches.push({ concurrent: false, calls: [call] })
    }
  }
  flushReadOnly()

  return batches
}
