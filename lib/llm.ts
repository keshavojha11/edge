import "dotenv/config";

const BASE = process.env.OPENROUTER_BASE ?? "https://openrouter.ai/api/v1";
const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "HTTP-Referer": "https://edge-markets.vercel.app",
      "X-Title": "Edge - Prediction Market Intelligence",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 2000,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
}

export async function jsonChat<T>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const raw = await chat(messages, { ...opts, temperature: opts.temperature ?? 0 });

  // 1. Try stripping markdown fences
  const fenceStripped = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // 2. If that's valid JSON, use it
  try {
    return JSON.parse(fenceStripped) as T;
  } catch {
    // 3. Extract the first {...} or [...] block from anywhere in the response
    const objMatch = raw.match(/\{[\s\S]*\}/);
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] ?? arrMatch?.[0];
    if (candidate) {
      return JSON.parse(candidate) as T;
    }
    throw new Error(`jsonChat: no JSON found in response: ${raw.slice(0, 200)}`);
  }
}
