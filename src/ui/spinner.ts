/**
 * Terminal spinner for long-running operations.
 */

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const TOOL_ICONS: Record<string, string> = {
  Bash: '🔧', Read: '📖', Write: '📝', Edit: '✏️',
  Glob: '🔍', Grep: '🔎', WebFetch: '🌐', WebSearch: '🔍',
  Agent: '🤖', LSP: '💡', NotebookEdit: '📓',
  TodoWrite: '📋', AskUser: '❓', Config: '⚙️',
  ToolSearch: '🧰', Skill: '🎯',
  EnterPlanMode: '📐', ExitPlanMode: '▶️',
  EnterWorktree: '🌿', ExitWorktree: '🔀',
}

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null
  private frameIdx = 0
  private message = ''

  start(message: string) {
    this.message = message
    this.frameIdx = 0
    this.render()
    this.interval = setInterval(() => this.render(), 80)
  }

  update(message: string) {
    this.message = message
  }

  stop(finalMessage?: string) {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.clearLine()
    if (finalMessage) {
      process.stderr.write(finalMessage + '\n')
    }
  }

  private render() {
    const frame = FRAMES[this.frameIdx % FRAMES.length]
    this.frameIdx++
    this.clearLine()
    process.stderr.write(`\x1b[90m  ${frame} ${this.message}\x1b[0m`)
  }

  private clearLine() {
    process.stderr.write('\r\x1b[K')
  }
}

export function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] ?? '⚙️'
}
