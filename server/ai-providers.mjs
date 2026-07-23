import { config } from "./config.mjs";
import { boundedText } from "./security.mjs";
import { loadSkillContext } from "./skill-context.mjs";

const MAX_AI_RESPONSE = 2_000_000;

function systemPrompt(language = "zh") {
  const outputLanguage = language === "en" ? "English" : "Simplified Chinese, with English technical identifiers unchanged";
  return `You are the contract-design copilot inside a local Kaspa SilverScript studio.

Follow the attached Kaspa SilverScript skill as authoritative workflow guidance. Never claim that generated code is audited or mainnet-ready. AI output cannot authorize spending. First design the protocol, then write source. Keep authorization, covenant identity, value conservation, deadlines, termination, and output identity deterministic.

Return one JSON object only, with this exact top-level shape:
{
  "specification": {
    "title": "...",
    "summaryZh": "...",
    "summaryEn": "...",
    "network": "testnet-10",
    "roles": ["..."],
    "stateFields": ["..."],
    "transitions": [{"name":"...","preconditions":["..."],"effects":["..."],"terminates":false}],
    "invariants": ["..."],
    "trustAssumptions": ["..."],
    "timeoutsAndRecovery": ["..."]
  },
  "transactionPlans": [{
    "transition": "entrypoint or policy name",
    "arguments": ["name:type and semantic constraint"],
    "inputs": [{"role":"...","covenantIdentity":"...","state":"...","valueInvariant":"...","authorization":"..."}],
    "outputs": [{"role":"...","covenantIdentity":"...","state":"...","valueInvariant":"..."}],
    "bindings": ["exact input/output/covenant binding"],
    "conservationChecks": ["..."],
    "adversarialMutations": ["one concrete rejected transaction mutation"]
  }],
  "source": "complete .sil source",
  "constructorArgs": [],
  "review": {
    "riskLevel": "experimental",
    "securityNotes": ["..."],
    "unresolvedQuestions": ["..."],
    "adversarialTests": ["..."]
  }
}

Write explanatory fields primarily in ${outputLanguage}. The source must use syntax supported by the pinned upstream commit. Do not invent opcodes or built-ins. Treat every transaction plan as part of the protocol: bind covenant identity, state, sompi value, input/output cardinality, ordering, and authorization explicitly. If requirements are ambiguous, choose the safest testnet-only design and put every assumption in unresolvedQuestions. Do not include markdown fences around the JSON.

KASPA SILVERSCRIPT SKILL:
${loadSkillContext()}`;
}

function userPrompt({ requirements, currentSource, mode }) {
  const request = boundedText(requirements, "requirements", 40_000);
  const existing = String(currentSource || "").slice(0, 120_000);
  return mode === "review"
    ? `Review and repair this contract against the user requirements. Preserve valid intent, but return a complete corrected source and full specification.\n\nREQUIREMENTS:\n${request}\n\nCURRENT SOURCE:\n${existing}`
    : `Design and implement a new SilverScript contract for these requirements.\n\nREQUIREMENTS:\n${request}`;
}

async function jsonRequest(url, options, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: "error" });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_AI_RESPONSE) throw new Error("AI response exceeded the local safety limit");
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || payload?.message || `AI provider HTTP ${response.status}`;
      throw Object.assign(new Error(String(message)), { status: response.status });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function openAiOutput(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return (payload?.output || []).flatMap((item) => item?.content || [])
    .filter((item) => item?.type === "output_text" || typeof item?.text === "string")
    .map((item) => item.text || "")
    .join("\n");
}

function anthropicOutput(payload) {
  return (payload?.content || []).filter((item) => item?.type === "text").map((item) => item.text || "").join("\n");
}

function geminiOutput(payload) {
  return (payload?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("\n");
}

function chatOutput(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.text || item?.content || "").join("\n");
  return "";
}

function stripFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseAiContract(text) {
  const candidate = stripFence(text);
  let value;
  try { value = JSON.parse(candidate); } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI provider did not return a JSON contract package");
    value = JSON.parse(candidate.slice(start, end + 1));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI contract package must be an object");
  value.source = boundedText(value.source, "AI contract source", 200_000);
  if (!value.source.includes("contract ") || !value.source.includes("pragma silverscript")) {
    throw new Error("AI response does not contain a complete SilverScript contract");
  }
  value.specification ||= {};
  value.review ||= {};
  value.transactionPlans = Array.isArray(value.transactionPlans) ? value.transactionPlans : [];
  value.constructorArgs = Array.isArray(value.constructorArgs) ? value.constructorArgs : [];
  value.review.riskLevel = "experimental";
  return value;
}

async function callOpenAi(provider, model, system, prompt) {
  if (!provider.apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const payload = await jsonRequest("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, instructions: system, input: prompt, store: false })
  });
  return openAiOutput(payload);
}

async function callAnthropic(provider, model, system, prompt) {
  if (!provider.apiKey || !model) throw new Error("ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required");
  const payload = await jsonRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({ model, max_tokens: 12_000, system, messages: [{ role: "user", content: prompt }] })
  });
  return anthropicOutput(payload);
}

async function callGemini(provider, model, system, prompt) {
  if (!provider.apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = await jsonRequest(url, {
    method: "POST",
    headers: { "x-goog-api-key": provider.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });
  return geminiOutput(payload);
}

async function callChatCompatible(providerId, provider, model, system, prompt) {
  const baseUrl = providerId === "openrouter" ? "https://openrouter.ai/api/v1" : provider.baseUrl.replace(/\/$/, "");
  if (!provider.apiKey || !baseUrl || !model) throw new Error(`${providerId} provider is not fully configured`);
  const headers = { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" };
  if (providerId === "openrouter") headers["x-openrouter-title"] = "Kaspa SilverScript Studio";
  const payload = await jsonRequest(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] })
  });
  return chatOutput(payload);
}

async function callOllama(provider, model, system, prompt) {
  const payload = await jsonRequest(`${provider.baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
    })
  }, 300_000);
  return payload?.message?.content || "";
}

export async function generateWithAi(input, configuredProvider) {
  const providerId = String(input.provider || "openai").toLowerCase();
  const provider = configuredProvider || config.providers[providerId];
  if (!provider) throw new Error(`Unsupported AI provider: ${providerId}`);
  const model = String(input.model || provider.model || "").trim();
  if (!model) throw new Error(`A model is required for ${providerId}`);
  const system = systemPrompt(input.language);
  const prompt = userPrompt(input);
  let raw;
  if (providerId === "openai") raw = await callOpenAi(provider, model, system, prompt);
  else if (providerId === "anthropic") raw = await callAnthropic(provider, model, system, prompt);
  else if (providerId === "gemini") raw = await callGemini(provider, model, system, prompt);
  else if (providerId === "ollama") raw = await callOllama(provider, model, system, prompt);
  else raw = await callChatCompatible(providerId, provider, model, system, prompt);
  return { provider: providerId, model, result: parseAiContract(raw) };
}
