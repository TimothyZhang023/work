import { Router } from 'express';
import {
  getConversations,
  createConversation,
  updateConversationTitle,
  deleteConversation,
  getMessages,
  addMessage,
  updateMessage,
  deleteLastMessages,
  getDefaultEndpointGroup
} from '../models/database.js';
import { authMiddleware } from '../middleware/auth.js';
import OpenAI from 'openai';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取所有对话
router.get('/', (req, res) => {
  try {
    const conversations = getConversations(req.uid);
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建新对话
router.post('/', (req, res) => {
  try {
    const { title } = req.body;
    const conversation = createConversation(req.uid, title);
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新对话标题
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    updateConversationTitle(id, req.uid, title);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除对话
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    deleteConversation(id, req.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取对话的消息
router.get('/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    const messages = getMessages(id, req.uid);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 构建 OpenAI messages 数组，支持文本和 base64 图片
 * 如果某条历史消息是用户消息，且含有 [IMAGE:...] 标记，则转为 vision content array
 */
function buildMessages(history) {
  return history.map(m => {
    if (m.role === 'user' && m.content.includes('[IMAGE_DATA:')) {
      // 解析图片消息格式: 文本\n[IMAGE_DATA:base64string]
      const parts = [];
      const imageRegex = /\[IMAGE_DATA:([^\]]+)\]/g;
      let lastIndex = 0;
      let match;

      const textContent = m.content.replace(imageRegex, '').trim();
      if (textContent) {
        parts.push({ type: 'text', text: textContent });
      }

      while ((match = imageRegex.exec(m.content)) !== null) {
        const base64Data = match[1];
        const mimeType = base64Data.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'auto' }
        });
        lastIndex = match.index + match[0].length;
      }

      return { role: 'user', content: parts };
    }
    return { role: m.role, content: m.content };
  });
}

// 流式聊天
router.post('/:id/chat', async (req, res) => {
  const { id } = req.params;
  const { message, model, images } = req.body; // images: string[] base64
  const uid = req.uid;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const endpointGroup = getDefaultEndpointGroup(uid);
    if (!endpointGroup) {
      res.write(`data: ${JSON.stringify({ error: '请先在设置中配置 API Endpoint' })}\n\n`);
      res.end();
      return;
    }

    const client = new OpenAI({
      apiKey: endpointGroup.api_key,
      baseURL: endpointGroup.base_url,
    });

    // 构建存储内容（图片用标记内嵌存储）
    let storedContent = message;
    if (images && images.length > 0) {
      storedContent += '\n' + images.map(img => `[IMAGE_DATA:${img}]`).join('\n');
    }
    addMessage(id, uid, 'user', storedContent);

    const history = getMessages(id, uid);
    const messages = buildMessages(history);

    const aiMsg = addMessage(id, uid, 'assistant', '');

    const stream = await client.chat.completions.create({
      model: model || 'gpt-4',
      messages,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    updateMessage(aiMsg.id, uid, fullContent);

    // 首次发言自动设置对话标题
    if (history.length === 1) {
      const title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
      updateConversationTitle(id, uid, title);
      res.write(`data: ${JSON.stringify({ title })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// 重新生成最后一条 AI 消息
router.post('/:id/regenerate', async (req, res) => {
  const { id } = req.params;
  const { model } = req.body;
  const uid = req.uid;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const endpointGroup = getDefaultEndpointGroup(uid);
    if (!endpointGroup) {
      res.write(`data: ${JSON.stringify({ error: '请先在设置中配置 API Endpoint' })}\n\n`);
      res.end();
      return;
    }

    // 删除最后一条 assistant 消息
    deleteLastMessages(id, uid, 1);

    const history = getMessages(id, uid);
    if (!history.length) {
      res.write(`data: ${JSON.stringify({ error: '没有可重新生成的消息' })}\n\n`);
      res.end();
      return;
    }

    const client = new OpenAI({
      apiKey: endpointGroup.api_key,
      baseURL: endpointGroup.base_url,
    });

    const messages = buildMessages(history);
    const aiMsg = addMessage(id, uid, 'assistant', '');

    const stream = await client.chat.completions.create({
      model: model || 'gpt-4',
      messages,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    updateMessage(aiMsg.id, uid, fullContent);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

export default router;
