<div align="center">

# 🦞 ClawHarness

### 让便宜模型也能接近 Claude Code Opus 的表现

**从 Claude Code 泄漏源码中逆向工程——接任何模型，获得顶级 Agent 能力**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[**English Version →**](./README.md)

---

*2026 年 3 月 31 日，Claude Code 完整源码通过 npm source map 泄漏——515,000 行 TypeScript。*

*我们逆向了让它强大的每一个机制：Agent 循环、上下文压缩、工具编排、安全层、Prompt 工程——重建为开放框架。*

*现在你可以接 DeepSeek、豆包、通义、或任何便宜模型——框架会帮你把它的表现拉到尽可能接近 Claude Code Opus 的水平。*

</div>

## 这是什么？

用 Claude Code 的时候，**模型只是故事的一半**。另一半是模型外面那层工程——harness（框架）：

- 怎么决定调哪个工具、什么顺序
- 怎么压缩上下文让对话永远不会崩
- 怎么从错误、截断、限流中恢复
- 怎么验证 Shell 命令防止搞破坏
- Prompt 怎么用 100+ 条件动态拼装

**这层框架才是让 Opus 表现像 Opus 的关键。** 没有它，再好的模型也只是个聊天机器人。

ClawHarness **把这层框架给了任何模型**。当你用一个强但便宜的模型（DeepSeek，¥1/百万 token）+ 生产级的 Agent 工程，你能得到 **非常接近 Claude Code 顶配档的输出**——1/10 的价格。

这不是理论。每个机制都是从实际泄漏的 Claude Code 源码中逆向出来的：

| Claude Code 机制 | ClawHarness 实现 |
|---|---|
| `while(tool_call)` Agent 循环 | ✅ 完整状态机，6 种转换类型 |
| 4 种上下文压缩 | ✅ 5 种（micro, snip, group, auto, reactive） |
| 10,000 行 Bash 安全系统 | ✅ 1,030 行：130+ 命令语义库 + 路径沙箱 + 只读验证 |
| Prompt 缓存分界 (`__DYNAMIC_BOUNDARY__`) | ✅ 静态/动态 Prompt 分层 |
| 工具编排（读并发、写串行） | ✅ 自动分区 |
| max_output_tokens 截断恢复 | ✅ 自动续写 |
| 413 上下文过长恢复 | ✅ 紧急压缩 + 重试 |
| 子 Agent 生成 | ✅ 独立上下文隔离 |
| CLAUDE.md 项目指令 | ✅ 多级 HARNESS.md（全局→项目→目录） |
| 会话记忆 | ✅ 自动提取经验，下次加载 |

**加上 Claude Code 没有的：**

| 能力 | Claude Code | ClawHarness |
|---|---|---|
| 多模型支持 | ❌ 只有 Anthropic | ✅ 任意 OpenAI 兼容 API |
| 智能路由 | ❌ | ✅ 难任务→强模型，简单→便宜 |
| 开源 | ❌ | ✅ MIT |
| 月费 | $100+ | **¥30-100** |

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

## Open Claw 🦞 核心框架

ClawHarness 是 **Open Claw 生态的核心 harness** — 设计目标是：当你接便宜模型时，框架层会把它的表现拉到尽可能接近 Claude Code Opus。

框架怎么弥补弱模型：

1. **更好的 Prompt 工程** — 224 行精心设计的系统提示词，每个工具有专门的行为引导
2. **更聪明的工具编排** — 只读工具并行、写入串行、大结果自动存磁盘
3. **上下文永不死** — 5 种压缩策略自动介入，100+ 轮对话也不崩
4. **错误自动恢复** — 截断自动续写、413 紧急压缩、工具失败重试
5. **智能路由** — 最难的 20% 任务走强模型，简单的 80% 走便宜模型

**框架越强，模型越不重要。** 这就是核心思路。

```bash
# 强模型 + 便宜模型 = 最佳组合
DEEPSEEK_API_KEY=sk-xxx DOUBAO_API_KEY=yyy \
  npx tsx src/index.ts --model=deepseek --router=doubao
```

## 许可

MIT — 随便用。

## 贡献

欢迎 PR。详见 [CONTEXT.md](./CONTEXT.md)。
