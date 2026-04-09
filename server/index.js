import express from "express";
import {
  addMessage,
  createConversation,
  deleteConversation,
  getProviderSettings,
  getConversationWithMessages,
  listConversations,
  saveProviderSettings,
  updateConversation,
} from "./db.js";
import { generateReply } from "./llm.js";

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const nowIso = () => new Date().toISOString();

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const makeTitle = (text) => {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) return "New chat";
  return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact;
};

const defaultProviderSettings = {
  provider: "openai-compatible",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "amarai-api",
    timestamp: nowIso(),
  });
});

app.get("/api/settings/provider", (_req, res) => {
  const stored = getProviderSettings();
  res.json({
    settings: {
      ...defaultProviderSettings,
      ...(stored || {}),
    },
  });
});

app.put("/api/settings/provider", (req, res) => {
  const { provider, model, baseUrl, apiKey } = req.body ?? {};

  if (!provider || typeof provider !== "string") {
    return res.status(400).json({ error: "provider is required." });
  }

  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "model is required." });
  }

  if (!baseUrl || typeof baseUrl !== "string") {
    return res.status(400).json({ error: "baseUrl is required." });
  }

  if (typeof apiKey !== "string") {
    return res.status(400).json({ error: "apiKey must be a string." });
  }

  const settings = {
    provider,
    model,
    baseUrl,
    apiKey,
  };

  saveProviderSettings(settings, nowIso());
  return res.json({ settings });
});

app.get("/api/conversations", (_req, res) => {
  const conversations = listConversations().map((conversation) => {
    const full = getConversationWithMessages(conversation.id);
    const preview = full?.messages?.at(-1)?.content ?? "";
    return {
      ...conversation,
      preview,
    };
  });

  res.json({ conversations });
});

app.get("/api/conversations/:id", (req, res) => {
  const conversation = getConversationWithMessages(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  return res.json({ conversation });
});

app.post("/api/conversations", (req, res) => {
  const id = makeId();
  const createdAt = nowIso();

  createConversation({
    id,
    title: "New chat",
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    createdAt,
  });

  const welcomeId = makeId();
  addMessage({
    id: welcomeId,
    conversationId: id,
    role: "assistant",
    content: "Ready when you are. Ask anything.",
    createdAt,
  });

  const conversation = getConversationWithMessages(id);
  return res.status(201).json({ conversation });
});

app.delete("/api/conversations/:id", (req, res) => {
  deleteConversation(req.params.id);
  res.status(204).send();
});

app.post("/api/chat/stream", async (req, res) => {
  const {
    conversationId,
    content,
    provider,
    model,
    baseUrl,
    apiKey,
  } = req.body ?? {};

  if (!conversationId || typeof conversationId !== "string") {
    return res.status(400).json({ error: "conversationId is required." });
  }

  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content is required." });
  }

  const existing = getConversationWithMessages(conversationId);
  if (!existing) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const userMessageId = makeId();
  const assistantMessageId = makeId();
  const userCreatedAt = nowIso();

  addMessage({
    id: userMessageId,
    conversationId,
    role: "user",
    content,
    createdAt: userCreatedAt,
  });

  const updatedTitle = existing.title === "New chat" ? makeTitle(content) : existing.title;
  updateConversation({
    id: conversationId,
    title: updatedTitle,
    provider: provider || existing.provider,
    model: model || existing.model,
    updatedAt: userCreatedAt,
  });

  const fullConversation = getConversationWithMessages(conversationId);
  const transcript = (fullConversation?.messages ?? []).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (type, payload) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const assistantText = await generateReply({
      provider: provider || existing.provider,
      baseUrl,
      apiKey,
      model: model || existing.model,
      messages: transcript,
    });

    if (!assistantText?.trim()) {
      throw new Error("Model returned an empty response.");
    }

    const tokens = assistantText.split(/(\s+)/).filter(Boolean);
    let aggregated = "";

    for (const token of tokens) {
      aggregated += token;
      sendEvent("token", { token, full: aggregated });
      await new Promise((resolve) => setTimeout(resolve, 18));
    }

    const assistantCreatedAt = nowIso();
    addMessage({
      id: assistantMessageId,
      conversationId,
      role: "assistant",
      content: aggregated,
      createdAt: assistantCreatedAt,
    });

    updateConversation({
      id: conversationId,
      title: updatedTitle,
      provider: provider || existing.provider,
      model: model || existing.model,
      updatedAt: assistantCreatedAt,
    });

    sendEvent("done", {
      assistantMessage: {
        id: assistantMessageId,
        conversationId,
        role: "assistant",
        content: aggregated,
        createdAt: assistantCreatedAt,
      },
    });
    res.end();
  } catch (error) {
    sendEvent("error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    res.end();
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});
