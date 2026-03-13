import { Router } from "express";
import { runAgentTask } from "../models/agentEngine.js";
import { getChannelById, listAgentTasks } from "../models/database.js";

const router = Router();

function buildDingtalkText(content) {
  return {
    msgtype: "text",
    text: {
      content,
    },
  };
}

function parseRunCommand(rawText = "") {
  const text = String(rawText || "")
    .replace(/@[^\s]+\s*/g, "")
    .trim();

  if (/^\/?help$/i.test(text)) {
    return { type: "help" };
  }

  const match = text.match(/^\/run\s+([^\s]+)(?:\s+([\s\S]+))?$/i);
  if (!match) {
    return null;
  }

  return {
    type: "run",
    taskRef: match[1]?.trim(),
    runtimeMessage: (match[2] || "").trim(),
  };
}

function pickTask(tasks, taskRef) {
  if (!taskRef) return null;

  if (/^\d+$/.test(taskRef)) {
    const byId = tasks.find((task) => task.id === Number(taskRef));
    if (byId) return byId;
  }

  const normalized = taskRef.toLowerCase();
  return (
    tasks.find((task) => task.name.toLowerCase() === normalized) ||
    tasks.find((task) => task.name.toLowerCase().includes(normalized)) ||
    null
  );
}

router.post("/dingtalk/:channelId", async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json(buildDingtalkText("无效的 channelId。"));
    }

    const uid = String(req.query.uid || req.body?.uid || "local");
    const channel = getChannelById(channelId, uid);
    if (!channel) {
      return res.status(404).json(buildDingtalkText("未找到对应的钉钉通道。"));
    }

    if (channel.platform !== "dingtalk") {
      return res.status(400).json(buildDingtalkText("该通道不是钉钉类型。"));
    }

    if (!channel.is_enabled) {
      return res.status(403).json(buildDingtalkText("该钉钉通道已禁用。"));
    }

    const expectedToken = String(channel.bot_token || "").trim();
    const providedToken = String(req.query.token || "").trim();
    if (expectedToken && providedToken !== expectedToken) {
      return res.status(401).json(buildDingtalkText("机器人 token 校验失败。"));
    }

    const incomingText =
      req.body?.text?.content || req.body?.content || req.body?.msg || "";
    const command = parseRunCommand(incomingText);
    if (!command) {
      return res.json(
        buildDingtalkText(
          "命令格式错误。请使用: /run <taskId|taskName> [message]"
        )
      );
    }

    if (command.type === "help") {
      return res.json(
        buildDingtalkText(
          [
            "可用命令:",
            "1) /run <taskId|taskName> [message]",
            "2) /help",
            "示例: /run 12 生成今天日报",
          ].join("\n")
        )
      );
    }

    const tasks = listAgentTasks(uid);
    const task = pickTask(tasks, command.taskRef);
    if (!task) {
      return res.json(
        buildDingtalkText(
          `未找到任务 ${command.taskRef}。可先在 Agent Tasks 页面创建任务。`
        )
      );
    }

    const runResult = await runAgentTask(uid, task.id, {
      initialUserMessage: command.runtimeMessage,
      triggerSource: "dingtalk",
    });

    return res.json(
      buildDingtalkText(
        [
          `任务已执行: ${task.name} (#${task.id})`,
          `RunID: ${runResult.runId}`,
          `会话ID: ${runResult.conversationId}`,
          `结果摘要: ${String(runResult.finalResponse || "").slice(0, 220)}`,
        ].join("\n")
      )
    );
  } catch (error) {
    return res.status(500).json(buildDingtalkText(`执行失败: ${error.message}`));
  }
});

export default router;
