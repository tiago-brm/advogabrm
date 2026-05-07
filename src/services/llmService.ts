import { supabase } from "@/integrations/supabase/client";

export type LlmProvider = "openai" | "anthropic" | "google" | "openrouter";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmResponse {
  content: string;
}

// Modelos disponíveis por provedor
export const PROVIDER_MODELS: Record<LlmProvider, { label: string; value: string }[]> = {
  openai: [
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "GPT-4o Mini", value: "gpt-4o-mini" },
    { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
    { label: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
  ],
  anthropic: [
    { label: "Claude Sonnet 4.6 (recomendado)", value: "claude-sonnet-4-6" },
    { label: "Claude Opus 4.7", value: "claude-opus-4-7" },
    { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
  ],
  google: [
    { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
    { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
  ],
  openrouter: [],
};

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  google: "Google (Gemini)",
  openrouter: "OpenRouter",
};

export const DEFAULT_BASE_URLS: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  openrouter: "https://openrouter.ai/api/v1",
};

export async function loadLlmConfig(): Promise<LlmConfig | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data, error } = await supabase
    .from("user_llm_configs")
    .select("provider, api_key, model, base_url")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    provider: data.provider as LlmProvider,
    apiKey: data.api_key,
    model: data.model,
    baseUrl: data.base_url ?? undefined,
  };
}

export async function callLlm(
  messages: LlmMessage[],
  config?: LlmConfig
): Promise<LlmResponse> {
  const cfg = config ?? (await loadLlmConfig());
  if (!cfg) throw new Error("Nenhum provedor de IA configurado. Acesse Configurações > Inteligência Artificial.");

  switch (cfg.provider) {
    case "openai":
    case "openrouter":
      return callOpenAICompatible(messages, cfg);
    case "anthropic":
      return callAnthropic(messages, cfg);
    case "google":
      return callGoogle(messages, cfg);
    default:
      throw new Error(`Provedor desconhecido: ${cfg.provider}`);
  }
}

async function callOpenAICompatible(messages: LlmMessage[], cfg: LlmConfig): Promise<LlmResponse> {
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URLS[cfg.provider];
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(cfg.provider === "openrouter" && {
        "HTTP-Referer": window.location.origin,
        "X-Title": "Advoga",
      }),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ${cfg.provider}: ${res.status} — ${err}`);
  }

  const json = await res.json();
  return { content: json.choices[0].message.content };
}

async function callAnthropic(messages: LlmMessage[], cfg: LlmConfig): Promise<LlmResponse> {
  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048,
      ...(systemMsg && { system: systemMsg.content }),
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro Anthropic: ${res.status} — ${err}`);
  }

  const json = await res.json();
  return { content: json.content[0].text };
}

async function callGoogle(messages: LlmMessage[], cfg: LlmConfig): Promise<LlmResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;

  // Gemini usa "parts" e não distingue "system" da mesma forma
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemMsg = messages.find((m) => m.role === "system");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemMsg && {
        systemInstruction: { parts: [{ text: systemMsg.content }] },
      }),
      contents,
      generationConfig: { maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro Google Gemini: ${res.status} — ${err}`);
  }

  const json = await res.json();
  return { content: json.candidates[0].content.parts[0].text };
}

// Teste mínimo de conexão — envia uma mensagem de 1 token para validar a chave
export async function testLlmConnection(cfg: LlmConfig): Promise<void> {
  await callLlm([{ role: "user", content: "ping" }], cfg);
}

// ─── Resumo de PDF ────────────────────────────────────────────────────────────

const PDF_SUMMARY_PROMPT =
  "Analise este documento jurídico e produza:\n\n" +
  "**1. Resumo executivo** — o que é este documento, quem são as partes e qual o objeto (máx. 2 parágrafos).\n" +
  "**2. Obrigações das partes** — liste as principais obrigações de cada parte identificada.\n" +
  "**3. Datas e prazos** — liste todas as datas importantes mencionadas.\n" +
  "**4. Cláusulas de risco** — identifique cláusulas que merecem atenção especial (multas, rescisão, limitação de responsabilidade, sigilo). Se não houver, escreva \"Nenhuma identificada\".\n\n" +
  "Responda em português. Seja objetivo e direto. Não invente informações além do que está no documento.";

// Extrai texto legível de um PDF digital (não funciona para PDFs escaneados)
async function extractTextFromPdf(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  // Decodifica preservando todos os bytes — PDFs usam Latin-1 internamente
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");

  const lines: string[] = [];

  // Extrai blocos de texto BT...ET (Begin Text / End Text do formato PDF)
  const btEt = /BT([\s\S]*?)ET/g;
  let block: RegExpExecArray | null;
  while ((block = btEt.exec(raw)) !== null) {
    // Strings entre parênteses: (texto)
    const parens = /\(([^)\\]|\\.)*\)/g;
    let m: RegExpExecArray | null;
    while ((m = parens.exec(block[1])) !== null) {
      const txt = m[0]
        .slice(1, -1)
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " ")
        .replace(/\\\\/g, "\\")
        .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
        .trim();
      if (txt.length > 1) lines.push(txt);
    }
  }

  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 50) throw new Error("Não foi possível extrair texto deste PDF. O arquivo pode ser escaneado ou protegido.");
  return text;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function summarizePdfWithLlm(
  pdfBlob: Blob,
  config?: LlmConfig
): Promise<LlmResponse> {
  const cfg = config ?? (await loadLlmConfig());
  if (!cfg) throw new Error("Nenhum provedor de IA configurado. Acesse Configurações > Inteligência Artificial.");

  // Anthropic e Google suportam PDFs nativamente via base64 — melhor precisão
  if (cfg.provider === "anthropic") {
    const base64 = await blobToBase64(pdfBlob);
    return summarizePdfAnthropic(base64, cfg);
  }

  if (cfg.provider === "google") {
    const base64 = await blobToBase64(pdfBlob);
    return summarizePdfGoogle(base64, cfg);
  }

  // OpenAI / OpenRouter: extrai texto do PDF e envia como mensagem de texto
  const text = await extractTextFromPdf(pdfBlob);
  return callLlm(
    [
      {
        role: "system",
        content: "Você é um assistente jurídico especializado em análise de documentos brasileiros. Responda sempre em português.",
      },
      { role: "user", content: `${PDF_SUMMARY_PROMPT}\n\nConteúdo do documento:\n\n${text.slice(0, 12000)}` },
    ],
    cfg
  );
}

async function summarizePdfAnthropic(base64: string, cfg: LlmConfig): Promise<LlmResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048,
      system: "Você é um assistente jurídico especializado em análise de documentos brasileiros. Responda sempre em português.",
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: PDF_SUMMARY_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro Anthropic: ${res.status} — ${err}`);
  }
  const json = await res.json();
  return { content: json.content[0].text };
}

async function summarizePdfGoogle(base64: string, cfg: LlmConfig): Promise<LlmResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "Você é um assistente jurídico especializado em análise de documentos brasileiros. Responda sempre em português." }],
      },
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: "application/pdf", data: base64 } },
            { text: PDF_SUMMARY_PROMPT },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro Google Gemini: ${res.status} — ${err}`);
  }
  const json = await res.json();
  return { content: json.candidates[0].content.parts[0].text };
}
