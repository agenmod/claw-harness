# ClawHarness

**The open-source AI coding agent that works with ANY model.**

Use DeepSeek, Doubao, Qwen, OpenAI — or any OpenAI-compatible API — as your coding assistant. Claude Code-level engineering, at a fraction of the cost.

## Quick start

```bash
git clone https://github.com/YOUR_USERNAME/clawharness.git
cd clawharness
npm install

# Pick any provider:
export DEEPSEEK_API_KEY="sk-..."
npx tsx src/index.ts
```

## Why ClawHarness?

- **Any model** — DeepSeek, Doubao (豆包), Qwen (通义), OpenAI, or any OpenAI-compatible API
- **Smart routing** — hard tasks → strong model, easy tasks → cheap model. Save 60-80% on API costs
- **19 production tools** — Bash (with 130+ security rules), file read/write/edit, code search, web fetch, sub-agents, and more
- **Real security** — 1,000+ lines of command semantic analysis, path sandboxing, read-only enforcement
- **Context management** — 5 compression strategies so conversations never hit the limit
- **中文支持** — first-class support for Chinese LLM providers and Chinese language

## Smart model routing

The feature that changes everything:

```bash
# Hard tasks → DeepSeek, simple tasks → Doubao (10x cheaper)
DEEPSEEK_API_KEY=sk-xxx DOUBAO_API_KEY=yyy \
  npx tsx src/index.ts --model=deepseek --router=doubao
```

Result: strong-model quality at weak-model prices.

## Supported providers

| Provider | Env var | Best for |
|----------|---------|----------|
| DeepSeek | `DEEPSEEK_API_KEY` | Reasoning, thinking mode |
| Doubao (豆包) | `DOUBAO_API_KEY` | Speed, cost, Chinese code |
| Qwen (通义) | `QWEN_API_KEY` | Long context (128K+) |
| OpenAI | `OPENAI_API_KEY` | Proven quality |
| Any compatible | Custom config | Your choice |

## 19 built-in tools

| Tool | What it does |
|------|-------------|
| **Bash** | Shell execution with 130+ command security rules, path sandbox |
| **Read** | File reading with binary detection, PDF extraction, image handling |
| **Write** | File creation with auto-snapshot for undo |
| **Edit** | String replacement with fuzzy match hints, diff preview |
| **Glob** | File search by pattern |
| **Grep** | Content search (ripgrep preferred) |
| **WebFetch** | URL fetching with HTML readability extraction |
| **WebSearch** | Web search (no API key needed) |
| **NotebookEdit** | Jupyter notebook editing |
| **Agent** | Sub-agent spawning for parallel subtasks |
| **TodoWrite** | Structured task tracking |
| **AskUser** | User clarification |
| **EnterPlanMode** | Read-only planning mode |
| **ExitPlanMode** | Return to execution |
| **Config** | Runtime configuration |
| **ToolSearch** | Tool discovery by keyword |
| **Skill** | Domain-specific instruction files |
| **EnterWorktree** | Git worktree isolation |
| **ExitWorktree** | Exit worktree with optional merge |

## Architecture

```
User input
  │
  ▼
AgentEngine (state machine with 6 transition types)
  ├── ModelProvider (OpenAI-compat → any API)
  │   ├── RetryProvider (exponential backoff)
  │   └── ModelRouter (strong/cheap by complexity)
  ├── ToolRegistry (19 tools, parallel read / serial write)
  ├── ContextManager (micro → snip → group → auto → reactive)
  ├── PermissionSystem (trust/confirm/readonly + rules)
  ├── HookSystem (pre/post tool call, on stop)
  └── MCP plugin protocol
```

## CLI commands

```
/model [name]      — show or switch model at runtime
/tools             — list all tools
/clear             — reset conversation
/cost              — token usage & estimated cost
/save              — save session to disk
/undo <path>       — restore file to pre-edit state
/allow <tool>      — always allow a tool
/deny <tool>       — always deny a tool
/help              — all commands
```

## Flags

```
--model=deepseek   — choose provider
--router=doubao    — enable smart routing
--trust            — auto-approve all operations
--readonly         — read-only mode
--verbose          — show thinking & usage
--resume           — resume last session
```

## License

MIT
