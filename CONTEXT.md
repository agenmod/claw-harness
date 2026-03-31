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

### High Priority
1. Complete streaming tool executor integration
2. More Bash security rules (find -exec nesting, etc.)
3. MCP: HTTP/SSE transport, auth, config persistence
4. Prompt cache boundary support (for Anthropic-compatible APIs)

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
