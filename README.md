# WorkBranch

AI 驱动的智能工作空间应用，基于 LangGraph 构建多 Agent 协作系统，提供对话式代码探索、文件操作、任务规划等能力。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Ant Design 6 + Zustand + @xyflow/react |
| 后端 | TypeScript + Fastify + LangGraph + LangChain OpenAI |
| 数据库 | SQLite (sql.js) |
| AI 模型 | OpenAI GPT-4 / 兼容 API |
| 包管理 | pnpm workspace monorepo |

## 项目结构

```
WorkBranch/
├── pnpm-workspace.yaml          # pnpm workspace 配置
├── package.json                 # 根 package（monorepo 脚本入口）
├── packages/
│   ├── backend/                 # 后端服务
│   │   └── src/
│   │       ├── server.ts        # 服务启动入口
│   │       ├── app.ts           # Fastify 应用构建（CORS、日志、路由注册）
│   │       ├── core/            # 核心基础设施
│   │       │   ├── config/      # 配置管理（Zod schema + 环境变量）
│   │       │   ├── database/    # SQLite 数据库封装
│   │       │   ├── logging/     # 日志系统（Pino）
│   │       │   ├── errors/      # 错误类型定义
│   │       │   └── container/   # 依赖注入容器
│   │       ├── controller/      # API 控制器层
│   │       ├── data/            # 数据访问层（DAO）
│   │       ├── middleware/      # 中间件（错误处理、请求日志）
│   │       ├── routes/          # 路由定义
│   │       ├── service/         # 业务逻辑层
│   │       │   ├── agent-service/  # 核心 Agent 系统
│   │       │   │   ├── agents/      # Agent 定义与注册
│   │       │   │   ├── graph/        # LangGraph 状态图编排
│   │       │   │   │   ├── orchestrator-v2.ts   # 主编排器（状态持久化）
│   │       │   │   │   ├── director-agent/      # 导演 Agent（任务分发）
│   │       │   │   │   ├── subgraphs/           # 子图（规划、执行、压缩）
│   │       │   │   │   └── decision/            # 复杂度分析决策
│   │       │   │   ├── tools/       # 工具注册与执行
│   │       │   │   │   ├── registry.ts           # 工具权限控制
│   │       │   │   │   ├── file-tools.ts         # 文件读写
│   │       │   │   │   ├── explore-tools.ts      # 代码探索
│   │       │   │   │   ├── plan-tools.ts         # 计划模式工具
│   │       │   │   │   ├── subagent-tools.ts     # 子 Agent 调用
│   │       │   │   │   └── todo-tools.ts         # 任务追踪
│   │       │   │   ├── prompts/     # Prompt 模板管理
│   │       │   │   ├── state/       # Agent 状态类型定义
│   │       │   │   ├── persistence/ # 图状态持久化
│   │       │   │   ├── cache/       # 多级缓存（LRU + SQLite）
│   │       │   │   └── subagents/   # 子 Agent（探索/审查）
│   │       │   ├── session-service/   # 会话管理与消息队列
│   │       │   ├── settings-service/  # 设置服务
│   │       │   └── user-service/      # 用户服务
│   │       └── types/            # 类型声明
│   │
│   ├── frontend/                # 前端应用
│   │   └── src/
│   │       ├── App.tsx          # 应用根组件
│   │       ├── main.tsx         # 入口文件
│   │       ├── app/             # 应用框架层
│   │       │   ├── router.tsx       # 路由配置（chat / settings）
│   │       │   ├── providers.tsx    # 全局 Provider
│   │       │   ├── layouts/         # 布局组件
│   │       │   ├── theme.tsx        # Ant Design 主题
│   │       │   └── settings.tsx     # 设置上下文
│   │       ├── pages/           # 页面
│   │       ├── widgets/diagram/ # 核心画布 UI
│   │       │   ├── DiagramShell.tsx      # 画布外壳（侧边栏+画布）
│   │       │   ├── ConversationCanvas.tsx # 对话树画布（@xyflow/react）
│   │       │   ├── SessionSidebar.tsx    # 会话侧边栏
│   │       │   ├── MessageComposer.tsx   # 消息输入框
│   │       │   ├── DetailPanel.tsx       # 详情面板
│   │       │   └── ContextMenu.tsx       # 右键菜单
│   │       ├── components/messages/  # 消息渲染策略（SSE 流式解析）
│   │       ├── features/         # Zustand 状态管理
│   │       │   ├── chat-workbench/  # 对话工作台 Store
│   │       │   ├── session/         # 会话 Store
│   │       │   ├── tree/            # 树形结构 Store
│   │       │   └── user/            # 用户 Store
│   │       ├── entities/         # 实体类型定义
│   │       ├── shared/           # 共享工具（API 客户端、配置、日志）
│   │       └── styles/           # 全局样式
│   │
│   └── shared/                  # 前后端共享类型与工具
│       └── src/
│           ├── types/       # 共享类型（API、会话、消息、用户、工作区）
│           ├── utils/       # 工具函数
│           └── constants/   # 常量定义
```

## 核心架构

### Agent 系统

基于 **LangGraph StateGraph** 构建，采用分层编排模式：

```
Director Agent（导演）
├── 复杂度分析 → 决定执行路径
├── DIRECT 模式 → 直接调用工具执行
├── PLAN 模式  → 规划子图 → 执行子图
├── Explore Agent（探索）- 只读代码搜索
├── Review Agent（审查）- 代码审查
└── 工具集：文件操作 / 代码探索 / 互联网搜索 / 子Agent调度 / 任务计划
```

### 内置 Agent 类型

| Agent | 用途 | 能力 |
|-------|------|------|
| Director Agent | 任务编排与分发 | 全部 |
| Explore Agent | 代码探索与搜索 | 只读 |
| Review Agent | 代码审查 | 只读 + 审查 |
| Plan Agent | 方案设计与规划 | 读 + 规划 |

### 工具体系

9 大类别，30+ 工具，支持细粒度权限控制：

- **FILE** — 文件读写创建删除
- **EXPLORE** — 代码语义搜索、互联网搜索
- **SUBAGENT** — 探索/审查 Agent 调用
- **AGENT** — Agent 生成与消息传递
- **WORKSPACE** — 工作区文件管理
- **TODO** — 任务进度追踪
- **MODE** — 执行模式切换（DIRECT/PLAN）
- **PLAN** — 计划的进入/退出/更新/执行

### 前端通信

- **SSE (Server-Sent Events)**: Agent 思考过程、工具调用的实时流式推送
- **消息分段协议**: `TEXT_START` → `TEXT_DELTA` → `TEXT_END` / `TOOL_CALL` / `THINKING` / `STATE_CHANGE` / `DONE` / `ERROR`
- **@xyflow/react**: 对话节点以树状图可视化展示，支持导航路径

### 数据流

```
用户输入 → MessageComposer → POST /api/session/conversations/{id}/messages
→ AgentService.sendMessage() → Director Agent (LangGraph)
→ SSE 流式推送 ← MessageRenderer 渲染
```

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Python >= 3.10（旧版 Python 后端需要）

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
# 同时启动前后端
pnpm dev

# 仅前端
pnpm dev:frontend

# 仅后端
pnpm dev:backend
```

启动后：
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health Check: http://localhost:3000/health

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端端口 | 3000 |
| `HOST` | 监听地址 | 127.0.0.1 |
| `OPENAI_API_KEY` | OpenAI API Key | - |
| `AI_MODEL` | AI 模型名称 | gpt-4 |
| `OPENAI_PROXY` | API 代理地址 | - |
| `DATABASE_PATH` | 数据库文件路径 | ./data/workbranch.db |
| `AGENT_MEMORY_MODE` | 内存模式 (accumulate/sliding) | accumulate |

### 其他命令

```bash
pnpm build          # 构建所有包
pnpm test           # 运行全部测试
pnpm lint           # ESLint 检查
pnpm format         # Prettier 格式化
pnpm clean          # 清理构建产物
```

## API 路由

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/session` | * | 会话管理 |
| `/api/session/conversations` | * | 对话 CRUD |
| `/api/user` | * | 用户信息 |
| `/api/settings` | * | 设置管理 |
| `/api/logs` | * | 日志查询 |
| `/api/workspaces` | * | 工作区管理 |
| `/health` | GET | 健康检查 |
| `/api/system/shutdown` | POST | 优雅关闭（Android） |
