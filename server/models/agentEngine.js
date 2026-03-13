import OpenAI from "openai";
import { logger } from "../utils/logger.js";
import {
  addTaskRunEvent,
  addMessage,
  createTaskRun,
  createConversation,
  getAgentTask,
  getEndpointGroups,
  getModels,
  getAppSetting,
  listSkills,
  logUsage,
  updateTaskRun,
  updateConversationSystemPrompt,
} from "./database.js";
import { executeMcpTool, getAllAvailableTools } from "./mcpManager.js";
import { buildTaskSystemPrompt } from "../utils/agentPromptBuilder.js";

const MAX_TURNS = 10;
const MAX_TOOL_CALLS_PER_SIGNATURE = 2;

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortJsonValue(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function getToolCallSignature(toolCall) {
  const toolName = toolCall?.function?.name || "unknown_tool";
  const rawArgs = String(toolCall?.function?.arguments || "");

  if (!rawArgs) {
    return `${toolName}:`;
  }

  try {
    const normalized = JSON.stringify(sortJsonValue(JSON.parse(rawArgs)));
    return `${toolName}:${normalized}`;
  } catch {
    return `${toolName}:${rawArgs}`;
  }
}

export function registerToolCall(
  toolCallCounts,
  toolCall,
  maxCalls = MAX_TOOL_CALLS_PER_SIGNATURE
) {
  const signature = getToolCallSignature(toolCall);
  const count = (toolCallCounts.get(signature) || 0) + 1;
  toolCallCounts.set(signature, count);

  return {
    signature,
    count,
    overBudget: count > maxCalls,
  };
}

function normalizeInlineText(value, maxLength = 220) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;
}

export function isUsableFinalResponse(content) {
  const normalized = normalizeInlineText(content, 500);
  if (!normalized) {
    return false;
  }

  return !/<tool_call|<\/?function|<parameter/i.test(normalized);
}

export function buildFallbackFinalResponse(messages, reason) {
  const recentToolResults = messages
    .filter((message) => message.role === "tool" && normalizeInlineText(message.content))
    .slice(-3)
    .map((message) => {
      const toolName = message.name || "tool";
      return `${toolName}: ${normalizeInlineText(message.content, 120)}`;
    });

  if (recentToolResults.length > 0) {
    return `⚠️ ${reason} 最近工具结果：${recentToolResults.join("；")}`;
  }

  return `⚠️ ${reason} 请打开会话查看完整轨迹。`;
}

function safeAddRunEvent(runId, uid, eventType, title, content = "", metadata) {
  if (!runId) return;

  try {
    addTaskRunEvent(runId, uid, eventType, title, content, metadata);
  } catch (error) {
    logger.warn(
      { err: error, runId, uid, eventType },
      "[AgentEngine] Failed to persist run event"
    );
  }
}

async function requestForcedFinalResponse({
  client,
  modelId,
  messages,
  uid,
  conversationId,
  endpointName,
  reason,
  runId,
}) {
  logger.warn(
    { uid, conversationId, modelId, reason },
    "[AgentEngine] Forcing final summary"
  );
  safeAddRunEvent(
    runId,
    uid,
    "forced_summary",
    "触发强制总结",
    reason,
    { modelId }
  );

  const summaryMessages = [
    ...messages,
    {
      role: "user",
      content: `[TASK_WRAP_UP] ${reason}\n请基于已经拿到的上下文和工具结果，直接输出纯文本最终结论。不要继续调用工具，不要输出 XML、JSON、<tool_call>、函数名或参数块。\n输出格式：\n结论：...\n依据：...\n下一步：如无则写“无”。`,
    },
  ];

  const completion = await client.chat.completions.create({
    model: modelId,
    messages: summaryMessages,
  });

  if (completion.usage) {
    logUsage({
      uid,
      conversationId,
      model: modelId,
      endpointName,
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      source: "agent_task",
    });
  }

  const content = String(completion.choices?.[0]?.message?.content || "").trim();
  if (isUsableFinalResponse(content)) {
    return content;
  }

  return buildFallbackFinalResponse(messages, reason);
}

export function resolveInitialUserMessage(task, initialUserMessage) {
  const trimmed = String(initialUserMessage || "").trim();
  if (trimmed) {
    return trimmed;
  }

  return `[TASK_RUN] 请开始执行任务「${task.name}」。请严格遵循 system prompt；如已配置工具，请按需调用后给出最终结论。`;
}

/**
 * Executes an AgentTask.
 * @param {string} uid - User ID
 * @param {number} taskId - ID of the AgentTask to run
 * @param {object} options - Execution options (e.g. initialUserMessage)
 */
export async function runAgentTask(uid, taskId, options = {}) {
  const task = getAgentTask(taskId, uid);
  if (!task) throw new Error("AgentTask not found");
  const initialUserMessage = resolveInitialUserMessage(
    task,
    options.initialUserMessage
  );

  // Create a dedicated conversation for this run if not provided
  let conversationId = options.conversationId;
  if (!conversationId) {
    const conv = createConversation(
      uid,
      `Run: ${task.name} at ${new Date().toLocaleString()}`
    );
    conversationId = conv.id;
  }

  const taskRun = createTaskRun({
    uid,
    taskId,
    cronJobId: options.cronJobId || null,
    conversationId,
    triggerSource: options.triggerSource || "manual",
    status: "running",
    initialMessage: initialUserMessage,
  });
  const runId = taskRun?.id || null;
  safeAddRunEvent(
    runId,
    uid,
    "run_started",
    "任务开始执行",
    initialUserMessage,
    {
      triggerSource: options.triggerSource || "manual",
      cronJobId: options.cronJobId || null,
      conversationId,
    }
  );

  // Gather Skills
  const allSkills = listSkills(uid);
  const taskSkills = allSkills.filter((s) => task.skill_ids.includes(s.id));

  const globalPromptMarkdown = getAppSetting(
    uid,
    "global_system_prompt_markdown",
    process.env.GLOBAL_SYSTEM_PROMPT_MD || ""
  );

  // Build combined system prompt (task + global markdown extension + skill bundle)
  const systemPrompt = buildTaskSystemPrompt({
    taskSystemPrompt: task.system_prompt,
    taskSkills,
    globalMarkdown: globalPromptMarkdown,
  });

  // Persist combined system prompt to conversation so chat window sees it
  updateConversationSystemPrompt(conversationId, uid, systemPrompt);

  // Gather Tools
  const mcpTools = await getAllAvailableTools(uid).catch(() => []);
  // Filter tools: include MCP tools if they match task.tool_names OR if a Skill requires them
  const skillRequiredTools = taskSkills.flatMap((s) => s.tools || []);
  const allowedToolNames = new Set([
    ...(task.tool_names || []),
    ...skillRequiredTools,
  ]);

  const requestTools = mcpTools.filter((t) =>
    allowedToolNames.has(t.function.name)
  );
  // Strip internal _mcp_server_id for OpenAI
  const openaiTools = requestTools.map(({ _mcp_server_id, ...t }) => t);

  // Initialize messages
  const messages = [{ role: "system", content: systemPrompt }];
  messages.push({ role: "user", content: initialUserMessage });
  addMessage(conversationId, uid, "user", initialUserMessage);

  // Get Endpoints
  const eps = getEndpointGroups(uid).sort(
    (a, b) => b.is_default - a.is_default
  );
  if (eps.length === 0) throw new Error("No API endpoint configured");

  const ep = eps[0]; // For background tasks, just use default for simplicity
  const modelModels = getModels(ep.id, uid);
  const modelId =
    task.model_id ||
    (modelModels.length > 0 ? modelModels[0].model_id : "gpt-4o");

  const baseUrl = ep.base_url.replace(/\/+$/, "");
  const client = new OpenAI({
    apiKey: ep.api_key,
    baseURL: baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`,
  });

  let turnCount = 0;
  let finalResponse = "";
  let finalResponsePersisted = false;
  const toolCallCounts = new Map();

  try {
    while (turnCount < MAX_TURNS) {
      turnCount++;
      logger.info(
        { uid, taskId, turn: turnCount },
        "[AgentEngine] Starting turn"
      );
      safeAddRunEvent(
        runId,
        uid,
        "turn_started",
        `第 ${turnCount} 轮`,
        `开始调用模型 ${modelId}`,
        { turn: turnCount, modelId }
      );

      const completion = await client.chat.completions.create({
        model: modelId,
        messages: messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
      });

      const aiMsg = completion.choices[0].message;
      messages.push(aiMsg);

      // Save tokens usage
      logUsage({
        uid,
        conversationId,
        model: modelId,
        endpointName: ep.name,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        source: "agent_task",
      });

      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        // Save AI msg with tool calls
        addMessage(
          conversationId,
          uid,
          "assistant",
          `[TOOL_CALLS]:${JSON.stringify(aiMsg.tool_calls)}`
        );
        safeAddRunEvent(
          runId,
          uid,
          "tool_calls_requested",
          "模型请求调用工具",
          aiMsg.tool_calls.map((toolCall) => toolCall.function.name).join(", "),
          {
            turn: turnCount,
            toolCalls: aiMsg.tool_calls.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            })),
          }
        );

        let shouldForceSummary = false;

        for (const toolCall of aiMsg.tool_calls) {
          const budgetState = registerToolCall(toolCallCounts, toolCall);
          if (budgetState.overBudget) {
            const budgetMsg = `Skipped duplicate tool call for ${toolCall.function.name}: identical input exceeded budget (${MAX_TOOL_CALLS_PER_SIGNATURE}). Use previous tool results and provide the final answer.`;
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: budgetMsg,
            });
            addMessage(
              conversationId,
              uid,
              "tool",
              `[TOOL_RESULT:${toolCall.id}:${toolCall.function.name}]:${budgetMsg}`
            );
            safeAddRunEvent(
              runId,
              uid,
              "tool_budget_hit",
              `${toolCall.function.name} 命中重复预算`,
              budgetMsg,
              {
                turn: turnCount,
                signature: budgetState.signature,
                repeatCount: budgetState.count,
              }
            );
            shouldForceSummary = true;
            continue;
          }

          const toolDef = requestTools.find(
            (t) => t.function.name === toolCall.function.name
          );
          if (!toolDef) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: "Error: Tool not found or access denied.",
            });
            safeAddRunEvent(
              runId,
              uid,
              "tool_failed",
              `${toolCall.function.name} 不可用`,
              "Tool not found or access denied.",
              { turn: turnCount }
            );
            continue;
          }

          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeMcpTool(
              uid,
              toolDef._mcp_server_id,
              toolCall.function.name,
              args
            );

            const resultStr =
              (result.content || [])
                .map((c) =>
                  typeof c.text === "string" ? c.text : JSON.stringify(c)
                )
                .join("\n") || JSON.stringify(result);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: resultStr,
            });

            // Save tool result
            addMessage(
              conversationId,
              uid,
              "tool",
              `[TOOL_RESULT:${toolCall.id}:${toolCall.function.name}]:${resultStr}`
            );
            safeAddRunEvent(
              runId,
              uid,
              "tool_completed",
              `${toolCall.function.name} 执行完成`,
              normalizeInlineText(resultStr, 500),
              { turn: turnCount, arguments: args }
            );
          } catch (e) {
            const errMsg = `Tool execution failed: ${e.message}`;
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: errMsg,
            });
            addMessage(
              conversationId,
              uid,
              "tool",
              `[TOOL_RESULT:${toolCall.id}:${toolCall.function.name}]:${errMsg}`
            );
            safeAddRunEvent(
              runId,
              uid,
              "tool_failed",
              `${toolCall.function.name} 执行失败`,
              errMsg,
              { turn: turnCount }
            );
          }
        }

        if (shouldForceSummary) {
          finalResponse = await requestForcedFinalResponse({
            client,
            modelId,
            messages,
            uid,
            conversationId,
            endpointName: ep.name,
            reason: `检测到重复工具调用，单工具同参预算为 ${MAX_TOOL_CALLS_PER_SIGNATURE} 次。`,
            runId,
          });
          addMessage(conversationId, uid, "assistant", finalResponse);
          safeAddRunEvent(
            runId,
            uid,
            "final_response",
            "生成最终总结",
            normalizeInlineText(finalResponse, 500)
          );
          finalResponsePersisted = true;
          break;
        }
      } else {
        // No tool calls, finish
        finalResponse = String(aiMsg.content || "");
        addMessage(conversationId, uid, "assistant", finalResponse);
        safeAddRunEvent(
          runId,
          uid,
          "final_response",
          "生成最终总结",
          normalizeInlineText(finalResponse, 500)
        );
        finalResponsePersisted = true;
        break;
      }
    }

    if (!finalResponsePersisted) {
      finalResponse = await requestForcedFinalResponse({
        client,
        modelId,
        messages,
        uid,
        conversationId,
        endpointName: ep.name,
        reason: `已达到最大执行轮数 ${MAX_TURNS}，停止继续调用工具。`,
        runId,
      }).catch((error) => {
        logger.error(
          { err: error, uid, conversationId, taskId },
          "[AgentEngine] Failed to force final summary"
        );
        return "⚠️ 任务已停止，但最终总结生成失败。请打开会话查看最近一次工具结果。";
      });

      addMessage(conversationId, uid, "assistant", finalResponse);
      safeAddRunEvent(
        runId,
        uid,
        "final_response",
        "生成最终总结",
        normalizeInlineText(finalResponse, 500)
      );
    }

    updateTaskRun(runId, uid, {
      conversation_id: conversationId,
      status: "success",
      final_response: finalResponse,
      finished_at: new Date().toISOString(),
    });
    safeAddRunEvent(runId, uid, "run_completed", "任务执行完成", "", {
      conversationId,
      finalResponsePreview: normalizeInlineText(finalResponse, 240),
    });

    return { conversationId, finalResponse, runId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error || "Unknown error");
    updateTaskRun(runId, uid, {
      conversation_id: conversationId,
      status: "failed",
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    });
    safeAddRunEvent(runId, uid, "run_failed", "任务执行失败", errorMessage, {
      conversationId,
    });
    throw error;
  }
}
