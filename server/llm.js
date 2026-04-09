const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const parseOpenAiContent = (content) => {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return typeof item.text === "string" ? item.text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
};

const normalizeOpenAiResponse = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  return parseOpenAiContent(content);
};

const normalizeGeminiResponse = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part?.text ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
};

const parseHfTextResponse = (payload) => {
  if (Array.isArray(payload)) {
    return payload[0]?.generated_text?.trim() ?? "";
  }

  if (payload?.generated_text) {
    return payload.generated_text.trim();
  }

  if (payload?.choices) {
    return normalizeOpenAiResponse(payload);
  }

  return "";
};

const buildPromptTranscript = (messages) => {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");

  return `${transcript}\n\nAssistant:`;
};

const requestOpenAiCompatible = async ({ baseUrl, apiKey, model, messages }) => {
  const base = trimTrailingSlash(baseUrl);
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "OpenAI-compatible request failed.";
    throw new Error(message);
  }

  return normalizeOpenAiResponse(payload);
};

const requestGemini = async ({ baseUrl, apiKey, model, messages }) => {
  const base = trimTrailingSlash(baseUrl);
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-goog-api-key": apiKey } : {}),
    },
    body: JSON.stringify({
      contents: messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "Gemini request failed.";
    throw new Error(message);
  }

  return normalizeGeminiResponse(payload);
};

const requestHuggingFace = async ({ baseUrl, apiKey, model, messages }) => {
  const base = trimTrailingSlash(baseUrl);
  const looksOpenAiStyle = base.includes("/v1") || base.endsWith("/chat/completions");

  if (looksOpenAiStyle) {
    const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error || "Hugging Face chat request failed.";
      throw new Error(message);
    }

    return parseHfTextResponse(payload);
  }

  const url = base.endsWith(`/${model}`) ? base : `${base}/${model}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      inputs: buildPromptTranscript(messages),
      parameters: {
        max_new_tokens: 512,
        return_full_text: false,
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error || "Hugging Face inference request failed.";
    throw new Error(message);
  }

  return parseHfTextResponse(payload);
};

export const generateReply = async ({ provider, baseUrl, apiKey, model, messages }) => {
  if (!provider) {
    throw new Error("Missing provider.");
  }

  if (!baseUrl) {
    throw new Error("Missing base URL.");
  }

  if (!model) {
    throw new Error("Missing model.");
  }

  if (provider === "gemini") {
    return requestGemini({ baseUrl, apiKey, model, messages });
  }

  if (provider === "huggingface") {
    return requestHuggingFace({ baseUrl, apiKey, model, messages });
  }

  return requestOpenAiCompatible({ baseUrl, apiKey, model, messages });
};
