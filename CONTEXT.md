# ClawHarness — Developer Context

## Overview

Open-source AI coding agent that works with **any model**. Claude Code-level engineering at a fraction of the cost.

## Current Scale

- **47 TypeScript source files, 5,479 lines of code**
- 22 built-in tools (LSP, Worktree, Skill, Config, ToolSearch, WebSearch, etc.)
- AgentEngine with full state machine + 5 compression strategies + Hook system
- LSP integration (TypeScript/Python/Rust/Go/Java/C++)
- Auto Memory system (cross-session learning)
- Smart model routing (strong/cheap by task complexity)

## Architecture

```
AgentEngine (state machine, 6 transition types)
├── ModelProvider layer
│   ├── OpenAICompat.ts — any OpenAI-compatible API
│   ├── RetryProvider.ts — exponential backoff
│   ├── ModelRouter.ts — strong/cheap routing
│   └── McpClient.ts — MCP plugin protocol
├── 22 Tools
│   ├── Bash (+ security: 1,030 lines, commandSemantics, pathValidation, readOnlyValidation)
│   ├── Read, Write, Edit (with file history snapshots)
│   ├── Glob, Grep, WebFetch, WebSearch
│   ├── Agent (sub-agent), LSP, NotebookEdit
│   ├── TodoWrite, AskUser, Config, ToolSearch, Skill
│   └── PlanMode, Worktree
├── ContextManager (micro/snip/group/auto/reactive compression)
├── PermissionSystem (trust/confirm/readonly + rule table)
├── HookSystem (preToolCall/postToolCall/onStop)
└── AutoMemory (cross-session learning)
```

## What Still Needs Work

### 🔴 NEXT SESSION — CLI 美化 (参考 WaytoAGI-CLI 的效果)
1. **ASCII art 启动画面** — 🦞 ClawHarness logo，带版本号、模型名、cwd
2. **彩色输出美化** — 工具调用带颜色框、进度条、spinner 动画
3. **Ink/React 终端 UI** — 用 ink 库做组件化终端渲染（CC 有 140+ 组件）
4. **工具执行动画** — 执行中显示 spinner + 工具名，完成后显示 ✓/✗
5. **Markdown 渲染** — 代码块高亮、表格对齐（用 marked-terminal 或 cli-highlight）
6. **输入框美化** — 多行输入、历史记录、Tab 补全
7. **npm 全局安装** — `npm install -g clawharness` 后直接输入 `clh` 启动
8. 参考项目: https://github.com/AAAAAAAJ/WaytoAGI-CLI (它是直接抄的 CC 源码换了品牌，我们只参考它的 UI 效果不抄代码)

### High Priority (code)
9. Complete streaming tool executor integration
10. More Bash security rules (find -exec nesting, etc.)
11. MCP: HTTP/SSE transport, auth, config persistence
12. Prompt cache boundary support (for Anthropic-compatible APIs)

### Medium Priority
5. Ink/React terminal UI
6. Team multi-agent coordination
7. More slash commands (/compact trigger, /bug, /doctor)
8. Python SDK wrapper (for pip install)

### Lower Priority
9. PowerShellTool (Windows)
10. PromptSuggestion auto-complete
11. Voice input
12. Remote trigger / cron

## Contributing

PRs welcome. Run with `npm install && npx tsx src/index.ts`.
