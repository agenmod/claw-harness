<div align="center">

# 🦞 ClawHarness

### Make cheap models perform like Claude Code Opus

**The harness layer reverse-engineered from the Claude Code leak — plug in any model, get top-tier agent capability**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[**中文文档 →**](./README_CN.md)

---

*On March 31, 2026, Claude Code's full source leaked via npm source maps — 515,000 lines of TypeScript.*

*We reverse-engineered every mechanism that makes it good: the agent loop, context compression, tool orchestration, security layer, prompt engineering — and rebuilt it as an open harness.*

*Now you can plug in DeepSeek, Doubao, Qwen, or any cheap model — and the harness does the heavy lifting to make it perform like Claude Code's Opus tier.*

</div>

## What is this?

When you use Claude Code, **the model is only half the story**. The other half is the engineering around it — the harness:

- How it decides which tools to call and in what order
- How it compresses context so conversations never break
- How it recovers from errors, truncation, and rate limits
- How it validates shell commands to prevent damage
- How the prompt is engineered with 100+ conditional sections

**That harness is what makes Opus feel like Opus.** Without it, even the best model is just a chatbot.

ClawHarness **gives that same harness to any model**. When you pair a strong-but-cheap model (DeepSeek at $0.14/M tokens) with production-grade agent engineering, you get **remarkably close to Claude Code's top-tier output** — at 1/10th the price.

This isn't theory. Every mechanism was reverse-engineered from the actual leaked Claude Code source:

| Claude Code mechanism | ClawHarness implementation |
|---|---|
| `while(tool_call)` agent loop | ✅ Full state machine with 6 transition types |
| 4 context compression strategies | ✅ 5 strategies (micro, snip, group, auto, reactive) |
| 10,000-line Bash security system | ✅ 1,030 lines: command semantics DB (130+ commands), path sandbox, readonly validation |
| Prompt cache boundary (`__DYNAMIC_BOUNDARY__`) | ✅ Static/dynamic prompt split |
| Tool orchestration (parallel read, serial write) | ✅ Automatic partitioning |
| max_output_tokens recovery | ✅ Auto-continue on truncation |
| 413 prompt-too-long recovery | ✅ Reactive compact + retry |
| Sub-agent spawning | ✅ Isolated context per sub-agent |
| CLAUDE.md project instructions | ✅ Multi-level HARNESS.md (global → project → directory) |
| Session memory | ✅ Auto-extract learnings, load next session |

**Plus what Claude Code doesn't have:**

| Feature | Claude Code | ClawHarness |
|---|---|---|
| Multi-model support | ❌ Anthropic only | ✅ Any OpenAI-compatible API |
| Smart model routing | ❌ | ✅ Hard tasks → strong model, easy → cheap |
| Open source | ❌ | ✅ MIT |
| Cost | $100+/mo | **$5-20/mo** |

### The killer feature: Smart Model Routing

```bash
# Hard tasks → DeepSeek (strong reasoning)
# Simple tasks → Doubao (10x cheaper)
# ClawHarness decides per-turn, automatically

DEEPSEEK_API_KEY=sk-xxx DOUBAO_API_KEY=yyy \
  npx tsx src/index.ts --model=deepseek --router=doubao
```

**Result: Claude Code-tier quality at 1/10th the cost.** The router analyzes each turn's complexity (keywords, message length, error context) and picks the right model.

## Quick Start

```bash
git clone https://github.com/agenmod/claw-harness.git
cd claw-harness
npm install

# Any provider — just set the env var:
export DEEPSEEK_API_KEY="sk-..."
npx tsx src/index.ts
```

That's it. You're running a full coding agent with 22 tools, context compression, security analysis, and session persistence.

## Why ClawHarness?

| Feature | Claude Code | Other harnesses | **ClawHarness** |
|---------|------------|-----------------|-----------------|
| Model support | Anthropic only | Usually one | **Any OpenAI-compatible API** |
| Monthly cost | $100+ | Varies | **$5-20 with DeepSeek/Doubao** |
| Smart routing | No | No | **Yes — auto strong/cheap per turn** |
| Tools | 40+ (closed) | 3-10 skeleton | **22 production-ready** |
| Bash security | 10K lines (closed) | Minimal | **1,030 lines: semantic analysis + path sandbox** |
| Context management | 4 strategies (closed) | Basic/none | **5 strategies: micro→snip→group→auto→reactive** |
| LSP integration | Yes (closed) | No | **Yes — TS, Python, Rust, Go, Java, C++** |
| Auto memory | Yes (closed) | No | **Yes — cross-session learning** |
| State machine | Complex (closed) | Simple loop | **6 transition types with error recovery** |
| Language | English | English | **English + 中文** |
| Source | Proprietary | Open | **Open source, MIT** |

## 22 Built-in Tools

<details>
<summary><b>Core (6)</b></summary>

| Tool | Description |
|------|-------------|
| **Bash** | Shell execution with **130+ command security rules**, path sandboxing, sed analysis, readonly enforcement |
| **Read** | Smart file reading — binary detection, PDF text extraction, image handling, large file pagination |
| **Write** | File creation with auto-snapshot for undo |
| **Edit** | String replacement with fuzzy match hints, duplicate detection, diff preview, `replace_all` mode |
| **Glob** | File pattern search (proper glob library) |
| **Grep** | Content search with ripgrep acceleration |
</details>

<details>
<summary><b>Web & Search (2)</b></summary>

| Tool | Description |
|------|-------------|
| **WebFetch** | URL content fetching with HTML readability extraction, JSON pretty-printing |
| **WebSearch** | Web search via DuckDuckGo (no API key needed) |
</details>

<details>
<summary><b>Agent & Planning (4)</b></summary>

| Tool | Description |
|------|-------------|
| **Agent** | Spawn isolated sub-agents for parallel subtasks |
| **EnterPlanMode** | Switch to read-only planning (model can self-activate) |
| **ExitPlanMode** | Return to execution mode |
| **TodoWrite** | Structured task tracking for complex multi-step work |
</details>

<details>
<summary><b>Code Intelligence (2)</b></summary>

| Tool | Description |
|------|-------------|
| **LSP** | Go-to-definition, find references, hover info — auto-detects language server |
| **NotebookEdit** | Jupyter notebook cell editing |
</details>

<details>
<summary><b>DevOps & Config (6)</b></summary>

| Tool | Description |
|------|-------------|
| **EnterWorktree** | Git worktree isolation for safe experimentation |
| **ExitWorktree** | Exit worktree with optional merge back |
| **Config** | Runtime config management |
| **Skill** | Load domain-specific instruction files |
| **ToolSearch** | Discover tools by keyword |
| **AskUser** | Ask for clarification when genuinely needed |
</details>

## Architecture

```
User input
  │
  ▼
┌──────────────────────────────────────────────┐
│              AgentEngine                      │
│         (state machine, 6 transitions)        │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │  while (tool_calls) {                    │ │
│  │    compress_if_needed()  // 5 strategies  │ │
│  │    stream = provider.chat(messages,tools)  │ │
│  │    for chunk in stream:                   │ │
│  │      yield text / tool_calls              │ │
│  │    execute_tools()      // parallel safe  │ │
│  │    run_hooks()          // pre/post       │ │
│  │    check_recovery()     // 413, truncate  │ │
│  │  }                                        │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  ┌────────────┐  ┌──────────────────────────┐ │
│  │ Provider   │  │ Security                 │ │
│  │ ┌────────┐ │  │ ┌──────────────────────┐ │ │
│  │ │OpenAI- │ │  │ │ 130+ cmd rules       │ │ │
│  │ │Compat  │ │  │ │ Path sandbox         │ │ │
│  │ ├────────┤ │  │ │ Readonly validation   │ │ │
│  │ │Retry   │ │  │ │ Permission rules     │ │ │
│  │ ├────────┤ │  │ └──────────────────────┘ │ │
│  │ │Router  │ │  └──────────────────────────┘ │
│  │ └────────┘ │                               │
│  └────────────┘  ┌──────────────────────────┐ │
│                  │ Context (5 strategies)    │ │
│  ┌────────────┐  │ micro → snip → group     │ │
│  │ 22 Tools   │  │ → auto → reactive        │ │
│  └────────────┘  └──────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## Supported Providers

Any **OpenAI-compatible** API works out of the box. Just set one env var:

| Provider | Env Var | Default Model | Best For |
|----------|---------|---------------|----------|
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat | Reasoning, thinking mode, value |
| Doubao (豆包) | `DOUBAO_API_KEY` | doubao-seed-code | Speed, cost, Chinese code |
| Qwen (通义) | `QWEN_API_KEY` | qwen-max | Long context (128K+) |
| OpenAI | `OPENAI_API_KEY` | gpt-4o | Proven quality |
| Custom | `~/.clawharness/config.json` | Any | Your infra |

## CLI

```bash
# Interactive REPL
npx tsx src/index.ts

# One-shot mode
npx tsx src/index.ts "create a REST API with Express"

# Smart routing
npx tsx src/index.ts --model=deepseek --router=doubao

# Flags
--model=NAME     # Choose provider
--router=NAME    # Enable smart routing (strong=model, cheap=router)
--trust          # Auto-approve all operations
--readonly       # Read-only mode
--verbose        # Show thinking tokens & cost
--resume         # Resume last session
```

### Slash Commands

```
/model [name]    — show or switch model at runtime
/tools           — list all 22 tools
/cost            — token usage & cost estimate
/save            — persist session
/undo <path>     — restore file (pre-edit snapshot)
/allow <tool>    — always-allow rule
/deny <tool>     — always-deny rule
/clear           — reset conversation
/help            — all commands
```

## Approaching Claude Code Capability

ClawHarness implements the core patterns that make Claude Code effective:

1. **Agent loop** — the `while(tool_call)` pattern with full state machine (not a simple retry loop)
2. **Tool-first design** — 22 tools the model can compose freely, no hardcoded workflows
3. **Security in depth** — command semantic analysis understands `find -exec rm {} \;` vs `find -name "*.ts"`, not just regex matching
4. **Context never dies** — 5 compression strategies from cheap (snip tool results) to expensive (model summary) to emergency (413 recovery)
5. **Memory persists** — auto-extracts learnings from each session, loads them next time
6. **Model-agnostic** — swap the brain without changing the harness. Today's best model might not be tomorrow's

When you combine a strong model (DeepSeek-R1 for reasoning) with this harness layer, you get **remarkably close to Claude Code's Opus-tier output** — at a fraction of the cost.

## The Open Claw 🦞 Harness

ClawHarness is the **core harness for the Open Claw ecosystem** — designed so that when you plug in cheap models, they perform as close to Claude Code's Opus tier as the underlying model allows.

The harness compensates for weaker models by:

1. **Better prompt engineering** — 224 lines of carefully structured system prompt with tool-specific behavioral guidance, length anchoring, and safety constraints
2. **Smarter tool orchestration** — read-only tools run in parallel, writes run serially, results are automatically budgeted (large outputs saved to disk)
3. **Context that never dies** — 5 compression strategies kick in automatically so the model always has relevant context, even in 100+ turn sessions
4. **Error recovery** — truncated output auto-continues, 413 errors trigger emergency compression, failed tools get retried
5. **Smart routing** — the hardest 20% of tasks go to a strong model, the easy 80% go to a cheap one

**The better the harness, the less the model matters.** That's the thesis.

```bash
# Strong model + cheap model = best of both worlds
DEEPSEEK_API_KEY=sk-xxx DOUBAO_API_KEY=yyy \
  npx tsx src/index.ts --model=deepseek --router=doubao
```

## Contributing

PRs welcome. See [CONTEXT.md](./CONTEXT.md) for architecture details and the roadmap.

```bash
npm install
DEEPSEEK_API_KEY=sk-xxx npx tsx src/index.ts
```

## License

MIT — do whatever you want with it.
