# Cowhorse Mac 单机版架构重设（OpenClaw 级目标）

## 1. 产品目标（重设）

> 只面向 **macOS**，放弃多平台妥协；以「本地优先 + 企业任务自动化 + 极致反馈速度」为最高优先级。

核心体验目标：

1. **一句话下达任务**：用户在钉钉群里发命令，Agent 自动执行。
2. **自动调度**：任务自动装配 Skills + MCP 工具链并运行，回执可追踪。
3. **专业产品感**：界面风格偏欧美 SaaS（简洁网格、低饱和中性色、强调信息层级）。
4. **Mac 性能优先**：冷启动、交互、流式输出全部围绕 Apple Silicon 优化。

---

## 2. 建议技术栈（Mac 优先）

### 2.1 Desktop 容器层（建议迁移）

- **Tauri 2 + Rust sidecar**（替代 Electron）
  - 优势：内存占用更低、启动更快、签名分发友好。
  - 用 Rust 做：系统托盘、通知、Keychain、后台守护。

### 2.2 Agent Runtime 层

- 短期：保留当前 **Node.js + Express**（降低迁移风险）。
- 中期：将任务编排核心拆分为独立 Runtime（可选 Rust/Go）。

### 2.3 前端层

- 保留 React + Ant Design，但建立 **Design Token + 信息密度规范**。
- UI 风格：
  - 字体：Inter/SF Pro fallback
  - 主色：蓝灰体系（减少高饱和色块）
  - 卡片阴影弱化、边框层级替代重阴影

---

## 3. 运行时新分层（推荐）

1. **Ingress（入口层）**
   - Web UI
   - DingTalk Bot Webhook
   - Cron Trigger
2. **Orchestration（编排层）**
   - Task Resolver（任务识别）
   - Skill Composer（技能拼装）
   - MCP Tool Broker（工具路由）
3. **Execution（执行层）**
   - LLM 调度
   - 工具调用预算控制（防止死循环）
   - 事件追踪与可回放
4. **State（状态层）**
   - SQLite（单机默认）
   - 事件日志（任务运行轨迹）
5. **UX（体验层）**
   - 实时任务状态
   - 错误可解释
   - 回执可深链到会话

---

## 4. 本轮落地能力（已实施）

### 4.1 DingTalk 机器人 -> Agent 自动执行

新增公共 Webhook 能力：

- `POST /api/channel-webhooks/dingtalk/:channelId`

命令格式：

- `/run <taskId|taskName> [message]`

行为：

1. 校验 channel 是否存在、是否启用、是否为 dingtalk。
2. 支持用 `?token=` 校验机器人 token。
3. 解析文本命令并匹配任务（按 ID 或名称）。
4. 调用 `runAgentTask` 执行任务。
5. 返回 DingTalk 机器人文本回执。

### 4.2 Skills + MCP 自动执行链

不新增并行实现，直接复用现有 `runAgentTask`：

- 自动合并任务绑定 Skills 到 system prompt
- 自动加载并过滤 MCP tools
- 自动执行工具调用并持久化运行事件

---

## 5. 性能优化路线（macOS）

1. **启动优化**
   - 拆分路由初始化，懒加载重量级模块。
2. **工具调用优化**
   - MCP server 连接池 + TTL 缓存。
3. **DB 优化**
   - 高频查询加索引（task_runs、messages 会话维度）。
4. **流式输出优化**
   - 前端增量渲染防抖，减少大段 markdown 重排。
5. **打包分发优化**
   - Tauri + universal binary（arm64 优先）。

---

## 6. 持续迭代建议（3 个里程碑）

1. **M1：命令执行闭环**
   - 钉钉命令触发 + 任务回执 + 会话追踪。
2. **M2：专业化体验**
   - 任务中心时间线、失败原因卡片、一键重试。
3. **M3：OpenClaw 级能力**
   - 多 Agent 协作、技能市场评分、任务模板生态。

