# ClawHarness — 项目上下文（交接给下一个对话用）

## 一句话

**超越 claw-code 的 Claude Code 开源替代品**。多模型支持 + 智能路由 + 中国市场。5,000+ 行 TypeScript，19 个工具，比 claw-code（~3,000 行 Python 骨架）更完整。

## 定位

- claw-code = 搬运 CC 做复刻品（37k star 但只有 3k 行骨架）
- **ClawHarness = CC 的工程能力 + 任意模型 + 中国价格，直接碾压**
- 核心差异：多模型路由、中文市场第一、安全层完整、工具更多更深

## 项目位置

```
/Users/yuanqi/Desktop/AIcode/AIdianzi/claude/codeharness/   ← 本项目（独立原创）
/Users/yuanqi/Desktop/AIcode/AIdianzi/claude/claude-code-extract/  ← CC 泄漏源码（仅参考，不能复制）
/Users/yuanqi/Desktop/AIcode/AIdianzi/claude/decode-cc/     ← CC 架构解读文档
```

## 当前规模

- **47 个 TypeScript 源文件，5,479 行代码**
- 22 个工具（含 LSP/Worktree/Skill/Config/ToolSearch/WebSearch）
- AgentEngine 完整状态机 + 5 种压缩策略 + Hook 系统
- LSP 集成（TypeScript/Python/Rust/Go/Java/C++）
- 自动记忆系统（Auto Memory — 跨会话学习）
- 所有内部引用已从 codeharness → clawharness 统一

## 架构

```
用户输入
  │
  ▼
AgentEngine (src/core/AgentEngine.ts, 216行)
  │  while 循环：调 API → 流式接收 → 执行工具 → 压缩 → 继续
  │
  ├── PromptBuilder (src/prompt/PromptBuilder.ts, 224行)
  │     静态区(编码规则/工具指南/安全) + 动态区(环境/项目指令)
  │
  ├── ModelProvider 层
  │   ├── OpenAICompat.ts (171行) — 兼容豆包/DeepSeek/通义/OpenAI
  │   ├── RetryProvider.ts (53行) — 重试+指数退避
  │   └── ModelRouter.ts (91行) — 强/弱模型智能路由
  │
  ├── ToolRegistry → 17 个工具
  │   ├── Bash (126行 + security 373行 + commandSemantics 393行 + pathValidation 138行)
  │   ├── Read (141行, 含图片/PDF/二进制检测)
  │   ├── Write (53行), Edit (139行, 含模糊匹配/diff预览)
  │   ├── Glob (64行, 用glob库), Grep (51行, rg优先)
  │   ├── WebFetch (130行, HTML可读性提取), WebSearch (89行, DDG)
  │   ├── NotebookEdit (64行), TodoWrite (61行), AskUser (39行)
  │   ├── Agent (116行, 子Agent), Config (78行), ToolSearch (51行)
  │   └── EnterPlanMode/ExitPlanMode (53行)
  │
  ├── ContextManager (164行) — micro/auto/reactive 三种压缩
  │   └── compactStrategies.ts (116行) — snip/group/preservedSegment
  │
  ├── PermissionSystem (129行) — trust/confirm/readonly + 规则表
  │
  ├── Hook 系统 (92行) — preToolCall/postToolCall/onStop
  │
  └── MCP 插件 (156行) — JSON-RPC stdio 基础版
```

## 技术栈

- TypeScript + Node.js 18+
- 依赖：openai SDK + glob 库（仅两个）
- 运行：`npx tsx src/index.ts`

## 已实现的能力

✅ while(tool_call) 核心循环
✅ 17 个内置工具
✅ 多模型支持（豆包/DeepSeek/通义/OpenAI 一键切）
✅ 智能路由（强模型/弱模型按复杂度分配）
✅ API 重试 + 指数退避 + fallback
✅ 上下文 3 种压缩策略（micro/auto/reactive）+ snip/group
✅ BashTool 安全（130+ 命令数据库 + 路径沙箱 + sed 解析）
✅ OpenAI tool_calls 协议完整实现（assistant 带 tool_calls 数组）
✅ thinking/reasoning token 支持（DeepSeek-R1）
✅ 流式 usage 精确追踪
✅ max_output_tokens 截断自动恢复
✅ 413 prompt-too-long 自动恢复
✅ 工具并发/串行分区执行
✅ 文件编辑前自动快照（undo）
✅ 工具结果预算（大结果存磁盘）
✅ 多级 HARNESS.md（全局→项目→目录）
✅ 会话持久化 + --resume
✅ 斜杠命令 (/help /clear /save /cost /allow /deny /undo /history)
✅ Hook 系统（pre/post tool call）
✅ MCP 插件基础版
✅ Plan 模式（只读规划）
✅ Token 成本追踪
✅ 文件状态缓存 + 编辑冲突检测

## 还没做 / 需要补的（按优先级）

### 🔴 高优先（影响日常使用）

1. **BashTool 安全层还需加深** — CC 有 10,894 行我们 1,030 行，差在只读模式完整验证、find -exec 嵌套分析
2. **AgentEngine 状态机** — CC 的 query.ts 有完整的状态转换（compact→retry→fallback→hook→continue），我们是线性的
3. **压缩系统和 AgentEngine 的集成** — compactStrategies.ts 写了但 AgentEngine 里还没完全调用
4. **入口文件需更新** — 新增的 ConfigTool/ToolSearchTool 还没在 index.ts 里注册
5. **index.ts 中斜杠命令 /model 切换** — 目前只显示模型名不能切换

### 🟡 中优先（提升体验）

6. **LSP 集成** — 语言服务器（CC 有 2,460 行），能做定义跳转、诊断
7. **Git worktree 隔离** — 让危险操作在独立分支上执行
8. **完整的 MCP** — 当前只有 stdio 传输，缺 HTTP/SSE、认证、配置持久化
9. **Ink/React 终端 UI** — 当前纯 printf，CC 有 140+ 组件
10. **自动记忆 (Auto Dream)** — 跨会话记忆经验
11. **SkillTool** — 技能文件系统
12. **更多斜杠命令** — /compact 实际触发、/bug 报告、/doctor 诊断

### 🟢 低优先

13. Team 多 Agent 协调 (coordinator)
14. PowerShellTool (Windows)
15. PromptSuggestion 自动补全
16. 远程触发/定时任务
17. 语音输入

## CC 源码中值得继续参考的文件

| 优先 | CC 文件 | 行数 | 学什么 |
|------|---------|------|--------|
| ⭐⭐⭐ | query.ts | 1,730 | 主循环状态机、所有恢复路径 |
| ⭐⭐⭐ | tools/BashTool/bashPermissions.ts | 2,621 | 权限判断的完整规则 |
| ⭐⭐⭐ | tools/BashTool/readOnlyValidation.ts | 1,990 | 只读模式下的命令验证 |
| ⭐⭐ | services/compact/compact.ts | ~800 | 压缩核心实现 |
| ⭐⭐ | services/tools/StreamingToolExecutor.ts | ~400 | 流式工具执行的生产级实现 |
| ⭐⭐ | tools/AgentTool/ | 3,804 | 子 Agent 的 fork、worktree、异步模式 |
| ⭐⭐ | services/mcp/client.ts | 3,348 | MCP 完整连接管理 |
| ⭐ | services/lsp/ | 2,460 | LSP 集成 |

## 运行方法

```bash
cd /Users/yuanqi/Desktop/AIcode/AIdianzi/claude/codeharness
npm install
DEEPSEEK_API_KEY=sk-xxx npx tsx src/index.ts

# 或用路由：强模型 deepseek + 便宜模型 doubao
DEEPSEEK_API_KEY=sk-xxx DOUBAO_API_KEY=yyy npx tsx src/index.ts --model=deepseek --router=doubao

# 其他参数
--trust          # 全自动，不问权限
--readonly       # 只读模式
--verbose / -v   # 显示 thinking + usage
--resume         # 恢复上次会话
```

## 注意事项

- 代码 100% 原创，不含 CC 受版权保护的内容
- CC 泄漏源码只用于学习架构思路，不复制粘贴
- 项目许可：MIT
- GitHub 账号 agenmod 上有之前的 CC 解读仓库（decode-claude-code），和本项目是独立的
- 用户之前在对话中贴过 GitHub Token，建议已轮换
