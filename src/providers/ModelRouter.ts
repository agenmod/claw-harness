import type { ChatRequest, ModelProvider } from './ModelProvider.js'
import type { StreamChunk, Message } from '../core/types.js'

export type RoutingStrategy = 'manual' | 'complexity' | 'round' | 'cost'

/**
 * Routes requests between a strong (expensive) and cheap (fast) model.
 * This is CodeHarness's core differentiator — CC doesn't have this.
 */
export class ModelRouter implements ModelProvider {
  readonly name = 'router'
  private strong: ModelProvider
  private cheap: ModelProvider
  private strategy: RoutingStrategy
  private turnCount = 0

  constructor(opts: {
    strong: ModelProvider
    cheap: ModelProvider
    strategy?: RoutingStrategy
  }) {
    this.strong = opts.strong
    this.cheap = opts.cheap
    this.strategy = opts.strategy ?? 'complexity'
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    this.turnCount++
    const provider = this.pick(req)
    yield* provider.chat(req)
  }

  private pick(req: ChatRequest): ModelProvider {
    switch (this.strategy) {
      case 'manual':
        return this.strong // caller controls via --model flag

      case 'round':
        // First turn uses strong model (understand the task), rest use cheap
        return this.turnCount <= 1 ? this.strong : this.cheap

      case 'cost':
        // Always cheap unless explicitly overridden
        return this.cheap

      case 'complexity':
      default:
        return this.estimateComplexity(req) === 'hard' ? this.strong : this.cheap
    }
  }

  private estimateComplexity(req: ChatRequest): 'hard' | 'easy' {
    const lastUser = [...req.messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return 'hard'

    const text = lastUser.content.toLowerCase()
    const len = text.length

    // Long/complex prompts → strong
    if (len > 500) return 'hard'

    // Keywords suggesting complex reasoning
    const hardKeywords = [
      'refactor', 'architect', 'design', 'debug', 'fix', 'why',
      'explain', 'optimize', 'performance', 'security', 'migrate',
      'complex', 'difficult', 'tricky', 'weird', 'strange',
      'multiple files', 'across', 'entire', 'whole project',
      '重构', '架构', '调试', '优化', '迁移', '设计',
    ]
    if (hardKeywords.some(k => text.includes(k))) return 'hard'

    // Previous turn had errors → escalate to strong
    const lastTool = [...req.messages].reverse().find(m => m.role === 'tool')
    if (lastTool?.content.toLowerCase().includes('error')) return 'hard'

    // Simple operations
    const easyKeywords = [
      'create', 'add', 'rename', 'move', 'delete', 'list',
      'show', 'read', 'print', 'run', 'install', 'update',
      '创建', '添加', '删除', '列出', '运行', '安装',
    ]
    if (easyKeywords.some(k => text.includes(k)) && len < 200) return 'easy'

    // Default: strong for safety
    return 'hard'
  }

  getCurrentProvider(): string {
    return `router(strong=${this.strong.name}, cheap=${this.cheap.name}, strategy=${this.strategy})`
  }
}
