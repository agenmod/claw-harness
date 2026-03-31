import type { FunctionSchema } from '../providers/ModelProvider.js'

export interface ToolResult {
  output: string
  isError: boolean
}

export interface ToolContext {
  cwd: string
  permissionMode: 'trust' | 'confirm' | 'readonly'
}

export interface Tool {
  readonly name: string
  readonly description: string
  readonly readOnly: boolean
  schema(): FunctionSchema
  needsConfirm(input: Record<string, unknown>): boolean
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}
