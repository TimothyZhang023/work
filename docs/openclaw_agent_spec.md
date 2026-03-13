# OpenClaw-like **Desktop Agent Automation** 规划与重构方案

## 产品方向变更（重构目标）

> 从 WebApp + 多用户系统，重构为**单机 Agent 自动化工具**（本地优先，单用户，无需注册/登录）。

核心能力保留并增强：

1. **Agent 为核心执行单元**（AgentTask + ReAct Loop）。
2. **定时任务**（Cron 调度、历史记录、失败可追溯）。
3. **Channel 能力**（通过各种 IM 平台安装扩展并接收通知/触发任务）。
4. **Skills 支持**（任务模板化与经验复用）。
5. **MCP 支持**（工具接入、可发现工具能力集合）。

---

## 对标 OpenClaw 的关键设计（本项目落地）

### 1) 单机模式（Local-First）

- 默认启用 `STANDALONE_MODE`。
- 取消用户注册登录流程在产品路径中的必要性。
- 服务层通过本地固定账户（`local`）执行所有数据隔离逻辑，保留 uid 结构用于兼容历史表结构。

### 2) Agent Orchestration

- 继续使用 `AgentTask` 作为执行单元。
- 任务运行写入 `task_runs` 与 `task_run_events`，用于调试和审计。
- 支持手动触发和 Cron 触发两种运行入口。

### 3) Cron Automation

- 保留并继续使用现有 `cron_jobs` 和 `cronRunner`。
- 所有调度在服务启动后自动 `syncCronJobs(listAllCronJobs())`。
- 任务结果可查询历史运行记录。

### 4) Channel 扩展系统

- 新增 `channels` 数据模型。
- 新增 channel 管理 API：
  - `GET /api/channels/extensions`：查看可安装扩展目录。
  - `POST /api/channels/extensions/:platform/install`：一键安装 IM 扩展。
  - CRUD `/api/channels`：管理 channel 配置。
- 内置扩展模板：`dingtalk`、`wecom`、`telegram`、`discord`。

### 5) Skills + MCP（必选能力）

- 保留 `skills` 与 `mcp_servers` 的全部能力。
- AgentTask 继续支持挂载 `skill_ids` + `tool_names`。

---

## 当前阶段已落地（本次编码）

- 默认单机模式鉴权：所有受保护接口自动注入本地用户上下文。
- Auth 路由在单机模式下返回本地会话语义（无注册依赖）。
- 新增 Channel 数据表 + API + 预设扩展安装入口。
- 将 channels 路由接入主应用。

---

## 下一阶段建议

1. 增加 Channel 事件分发器（task success/failure 到各 IM）。
2. 增加本地插件包（skills/mcp/channel）的导入导出与签名校验。
3. 增加桌面壳（Tauri/Electron）及本地启动引导。
4. 增加 Agent 运行可视化 trace 面板（步骤级调试）。
