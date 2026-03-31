<div align="center">

# 🦞 ClawHarness

### 最强开源 Claude Code 工程框架 — 接任何模型

**5,479 行代码 · 22 个工具 · 智能路由 · 任意 LLM API**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[**English Version →**](./README.md)

---

*Claude Code 每月 $100+，只能用 Anthropic 的模型。*
*如果你能用同样的 Agent 工程——接 DeepSeek、豆包、通义、或任何你想用的模型呢？*

*这就是 ClawHarness。*

</div>

## 这是什么？

ClawHarness 是一个**生产级 AI 编程 Agent**，复刻并扩展了 Claude Code 的核心工程——`while(tool_call)` 循环、上下文压缩、工具编排、安全层等——但**不绑定任何模型提供商**。

接 DeepSeek，每百万 token ¥1。接 GPT-4o。接本地 Llama。框架不关心你用什么模型。**同样的 Agent 智能，你选大脑。**

### 杀手级功能：智能模型路由

```bash
# 难任务 → DeepSeek（推理强）
# 简单任务 → 豆包（便宜 10 倍）
# ClawHarness 每轮自动判断

DEEPSEEK_API_KEY=sk-xxx DOUBAO_API_KEY=yyy \
  npx tsx src/index.ts --model=deepseek --router=doubao
```

**结果：Claude Code 级别的质量，1/10 的价格。** 路由器分析每轮的复杂度（关键词、消息长度、错误上下文），自动选模型。

## 快速开始

```bash
git clone https://github.com/agenmod/claw-harness.git
cd claw-harness
npm install

# 选一个 API：
export DEEPSEEK_API_KEY="sk-..."   # 推荐：性价比最高
# 或：DOUBAO_API_KEY / QWEN_API_KEY / OPENAI_API_KEY

npx tsx src/index.ts
```

搞定。你现在有一个完整的编程 Agent——22 个工具、上下文压缩、安全分析、会话持久化。

## 对比

| 特性 | Claude Code | 其他框架 | **ClawHarness** |
|------|------------|---------|-----------------|
| 模型支持 | 仅 Anthropic | 通常一家 | **任意 OpenAI 兼容 API** |
| 月费 | $100+ | 不等 | **¥30-100（豆包/DeepSeek）** |
| 智能路由 | 无 | 无 | **有 — 按复杂度自动切强/弱模型** |
| 工具 | 40+（闭源） | 3-10 骨架 | **22 个生产级** |
| Bash 安全 | 10K 行（闭源） | 极少 | **1,030 行：语义分析 + 路径沙箱** |
| 上下文管理 | 4 种策略（闭源） | 基础/无 | **5 种策略** |
| LSP | 有（闭源） | 无 | **有 — 6 种语言** |
| 自动记忆 | 有（闭源） | 无 | **有 — 跨会话学习** |
| 源码 | 闭源 | 开源 | **开源 MIT** |

## 支持的模型

| 提供商 | 环境变量 | 推荐场景 |
|--------|---------|---------|
| DeepSeek | `DEEPSEEK_API_KEY` | 推理、思考模式、性价比 |
| 豆包 (Doubao) | `DOUBAO_API_KEY` | 速度快、便宜、中文代码 |
| 通义千问 (Qwen) | `QWEN_API_KEY` | 长上下文 (128K+) |
| OpenAI | `OPENAI_API_KEY` | 稳定 |
| 自定义 | 配置文件 | 你的基础设施 |

## 22 个内置工具

**核心**：Bash（含 130+ 安全规则）、Read（二进制/PDF 检测）、Write（自动快照）、Edit（模糊匹配+diff）、Glob、Grep

**Web**：WebFetch（HTML 可读性提取）、WebSearch（免 key 搜索）

**Agent**：Agent（子 Agent）、EnterPlanMode、ExitPlanMode、TodoWrite

**代码智能**：LSP（定义跳转/引用查找）、NotebookEdit

**DevOps**：Worktree（Git 分支隔离）、Config、Skill、ToolSearch、AskUser

## 逼近 Claude Code 的能力

当你用强模型（如 DeepSeek-R1）+ ClawHarness 的工程层，你能得到**非常接近 Claude Code Opus 档的输出**——因为：

1. **完整的 Agent 循环** — 不是简单重试，是 6 种状态转换的状态机
2. **工具优先** — 22 个工具自由组合，没有硬编码流程
3. **纵深安全** — 命令语义分析能区分 `find -exec rm {} \;` 和 `find -name "*.ts"`
4. **上下文不死** — 5 种压缩策略，从便宜（裁剪工具结果）到昂贵（模型摘要）到紧急（413 恢复）
5. **记忆持续** — 自动提取每次会话的经验，下次启动加载
6. **模型无关** — 换大脑不用换框架。今天最强的模型不一定是明天的

## 配合 claw-code / Open Claw 使用

已经在用 [claw-code](https://github.com/instructkr/claw-code)？ClawHarness 就是它的 **多模型增强层**。

claw-code 复刻了 Claude Code 的架构，但锁死一个模型。ClawHarness 提供 **缺失的多模型能力**：

- **任意模型** — 把 Anthropic 换成 DeepSeek、豆包、通义、或本地模型
- **智能路由** — 自动把难/简单任务分配到强/弱模型
- **真正能执行的工具** — 22 个工具不是空壳
- **生产级安全** — 1,030 行命令分析，不是正则匹配
- **上下文压缩** — 5 种策略，长对话不崩

ClawHarness 可以 **独立使用**，也可以作为任何 Claude Code 衍生项目的引擎层。如果你 fork 了 claw-code，这就是让它真正能用非 Anthropic 模型的升级。

```bash
# 独立使用，不需要 claw-code
npm install && DEEPSEEK_API_KEY=sk-xxx npx tsx src/index.ts
```

## 许可

MIT — 随便用。

## 贡献

欢迎 PR。详见 [CONTEXT.md](./CONTEXT.md)。
