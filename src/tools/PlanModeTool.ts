import type { Tool, ToolResult } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

/**
 * Plan mode tools — let the model switch between planning (readonly)
 * and execution modes within a conversation.
 */

let planModeActive = false

export function isPlanMode(): boolean { return planModeActive }

export const EnterPlanModeTool: Tool = {
  name: 'EnterPlanMode',
  description: 'Switch to plan/read-only mode. In this mode, write operations are blocked. Use when you want to analyze and plan before making changes.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'EnterPlanMode',
      description: this.description,
      parameters: { type: 'object', properties: {} },
    }
  },

  needsConfirm() { return false },

  async run(): Promise<ToolResult> {
    planModeActive = true
    return { output: 'Switched to plan mode. Write operations are now blocked. Use ExitPlanMode when ready to execute.', isError: false }
  },
}

export const ExitPlanModeTool: Tool = {
  name: 'ExitPlanMode',
  description: 'Exit plan mode and return to normal execution mode where write operations are allowed.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'ExitPlanMode',
      description: this.description,
      parameters: { type: 'object', properties: {} },
    }
  },

  needsConfirm() { return false },

  async run(): Promise<ToolResult> {
    planModeActive = false
    return { output: 'Exited plan mode. Write operations are now allowed.', isError: false }
  },
}
