import type { Tool } from './Tool.js'
import type { FunctionSchema } from '../providers/ModelProvider.js'

export class ToolRegistry {
  private map = new Map<string, Tool>()

  add(tool: Tool) { this.map.set(tool.name, tool) }
  get(name: string) { return this.map.get(name) }
  all(): Tool[] { return [...this.map.values()] }
  schemas(): FunctionSchema[] { return this.all().map(t => t.schema()) }
}
