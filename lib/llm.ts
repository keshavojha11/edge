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

  // 1. Try stripping markdown fences first
  const fenceStripped = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try {
    return JSON.parse(fenceStripped) as T;
  } catch { /* fall through */ }

  // 2. Use bracket-depth tracking to extract the first complete JSON object/array.
  //    Greedy regex (/\{[\s\S]*\}/) grabs everything including text after close —
  //    depth tracking finds the exact matching bracket.
  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  const start =
    firstBrace === -1 ? firstBracket :
    firstBracket === -1 ? firstBrace :
    Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    const open = raw[start] === "{" ? "{" : "[";
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }

    if (end !== -1) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch { /* fall through */ }
    }
  }

  throw new Error(`jsonChat: no valid JSON in response: ${raw.slice(0, 300)}`);
}
