import { randomUUID } from 'crypto'
import type { Tool, ToolResult, ToolContext } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'
import type { AgentEngine } from '../core/AgentEngine.js'

/**
 * Sub-agent tool — spawns independent child agents for subtasks.
 * Each sub-agent has its own conversation context, isolated from parent.
 * Supports both sync (wait for result) and fire-and-forget modes.
 */

let engineFactory: ((task: string) => AgentEngine) | null = null
const runningAgents = new Map<string, { engine: AgentEngine; task: string; startTime: number }>()

export function setAgentFactory(factory: (task: string) => AgentEngine) {
  engineFactory = factory
}

export function getRunningAgents() {
  return [...runningAgents.entries()].map(([id, a]) => ({
    id, task: a.task, runningMs: Date.now() - a.startTime,
  }))
}

export const AgentTool: Tool = {
  name: 'Agent',
  description: [
    'Spawn a sub-agent to handle an independent subtask.',
    'The sub-agent has its own context and can use all tools.',
    'Use for tasks that can be done in isolation: refactoring a module, writing tests, researching a topic.',
    'Write a DETAILED task description — the sub-agent has NO prior context from this conversation.',
  ].join(' '),
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'Agent',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Detailed task description. Include: what files to work with, what the expected outcome is, any constraints.',
          },
          context: {
            type: 'string',
            description: 'Optional additional context to pass to the sub-agent (e.g. relevant code snippets, error messages).',
          },
        },
        required: ['task'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input): Promise<ToolResult> {
    const task = String(input.task ?? '')
    const context = input.context ? String(input.context) : ''
    if (!task) return { output: 'Error: task description is required', isError: true }
    if (!engineFactory) return { output: 'Error: agent factory not configured', isError: true }

    const agentId = randomUUID().slice(0, 8)
    const fullPrompt = context ? `${task}\n\nAdditional context:\n${context}` : task

    try {
      const subEngine = engineFactory(fullPrompt)
      runningAgents.set(agentId, { engine: subEngine, task, startTime: Date.now() })

      let textResult = ''
      let toolsUsed: string[] = []
      let turnCount = 0
      let hadError = false

      for await (const ev of subEngine.run(fullPrompt)) {
        switch (ev.type) {
          case 'text':
            textResult += ev.content
            break
          case 'tool_start':
            toolsUsed.push(ev.call.name)
            break
          case 'tool_done':
            if (ev.isError) hadError = true
            break
          case 'finished':
            turnCount++
            break
          case 'error':
            runningAgents.delete(agentId)
            return { output: `Sub-agent error: ${ev.message}`, isError: true }
        }
      }

      runningAgents.delete(agentId)

      // Build summary
      const elapsed = Date.now() - (runningAgents.get(agentId)?.startTime ?? Date.now())
      const uniqueTools = [...new Set(toolsUsed)]
      const summary = [
        textResult.trim() || '(sub-agent completed with no text output)',
        '',
        `--- Sub-agent summary ---`,
        `Tools used: ${uniqueTools.join(', ') || 'none'}`,
        `Tool calls: ${toolsUsed.length}`,
        hadError ? '⚠ Some tool calls had errors' : '',
      ].filter(Boolean).join('\n')

      return { output: summary, isError: false }
    } catch (e: any) {
      runningAgents.delete(agentId)
      return { output: `Sub-agent failed: ${e.message}`, isError: true }
    }
  },
}
