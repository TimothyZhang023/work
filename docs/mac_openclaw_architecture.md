# Cowhorse Mac 单机版架构演进（Node 内核）

## 目标

我们坚持 **Node.js 全栈内核**：

- Server / Agent Runtime / Tool Orchestration 全部 Node 化
- 面向 mac 用户做性能优化，不做跨平台复杂适配
- 打造 openclaw 类体验：快、稳、可观察、可自动化

## Node 内核分层

1. **Ingress Layer（入口）**
   - Web UI
   - DingTalk Webhook
   - Cron Trigger
2. **Agent Kernel（编排内核）**
   - Task Resolver
   - Skill Composer
   - MCP Router
3. **Execution Layer（执行）**
   - 模型调度
   - 工具调用预算控制
   - 运行事件落库
4. **State Layer（状态）**
   - SQLite（默认）
   - 任务、技能、工具、审计事件
5. **Observability Layer（观测）**
   - 统一 run_id
   - API 层统计与系统概览

## 本轮落地的 10 个演进点

1. 新增 DingTalk webhook 帮助命令 `/help`
2. 支持 taskName 模糊匹配（包含匹配）
3. 支持自动移除 @机器人前缀
4. MCP 默认模板支持 query 搜索
5. MCP Quickstart 套件列表接口
6. MCP Quickstart 一键安装接口（含去重）
7. MCP 配置预检接口（validate）
8. Skills 默认模板目录与搜索
9. Skills 模板一键安装 + 批量导入
10. 系统概览接口（Node runtime + 资源计数 + 建议）

## 后续建议（仍保持 Node）

- Worker Threads 承载高开销任务生成
- MCP 连接复用池 + LRU
- 增量消息压缩与前端分段渲染
- CI 自动打包（先空 Deploy Key，后续填充）
