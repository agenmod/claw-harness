<div align="center">

# 🦞 ClawHarness

### The most capable open-source Claude Code harness — now with ANY model

**5,479 lines · 22 tools · smart routing · any LLM API**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[**中文文档 →**](./README_CN.md)

---

*Claude Code costs $100+/month and locks you to one provider.*
*What if you could get the same agent engineering — with DeepSeek, Doubao, Qwen, or any model you want?*

*That's ClawHarness.*

</div>

## What is this?

ClawHarness is a **production-grade AI coding agent** that replicates and extends the core engineering of Claude Code's agent harness — the `while(tool_call)` loop, context compression, tool orchestration, security layer, and more — but **decoupled from any single model provider**.

Plug in DeepSeek for $0.14/M tokens. Plug in GPT-4o. Plug in a local Llama. The harness doesn't care. **Same agent intelligence, your choice of brain.**

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

## Use with claw-code / Open Claw

Already using [claw-code](https://github.com/instructkr/claw-code)? ClawHarness is designed to **supercharge it**.

claw-code mirrors the Claude Code architecture but stays locked to one model. ClawHarness provides the **missing multi-model layer** — drop it in and unlock:

- **Any model** — swap Anthropic for DeepSeek, Doubao, Qwen, or local models
- **Smart routing** — auto-route hard/easy tasks to strong/cheap models
- **Real tool execution** — 22 tools that actually run (not stubs)
- **Production security** — 1,030 lines of command analysis, not regex
- **Context compression** — 5 strategies so long sessions don't break

ClawHarness works standalone **or** as the engine layer for any Claude Code-derived project. If you've forked claw-code, this is the upgrade that makes it actually useful with non-Anthropic models.

```bash
# Works standalone — no claw-code dependency needed
npm install && DEEPSEEK_API_KEY=sk-xxx npx tsx src/index.ts
```

## Contributing

PRs welcome. See [CONTEXT.md](./CONTEXT.md) for architecture details and the roadmap.

```bash
npm install
DEEPSEEK_API_KEY=sk-xxx npx tsx src/index.ts
```

## License

MIT — do whatever you want with it.
