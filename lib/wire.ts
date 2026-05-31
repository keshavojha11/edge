import "dotenv/config";

const BASE = "https://api.anakin.io";
const API_KEY = process.env.ANAKIN_API_KEY ?? "";

if (!API_KEY) {
  throw new Error("ANAKIN_API_KEY is not set");
}

const headers = () => ({
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
});

let totalCreditsSpent = 0;

export function getCreditsSpent() {
  return totalCreditsSpent;
}

async function logEvent(
  type: string,
  detail: string,
  creditsSpent = 0
): Promise<void> {
  try {
    const { prisma } = await import("./db");
    await prisma.event.create({ data: { type, detail, creditsSpent } });
  } catch {
    // DB may not be ready during discover phase — just console log
    console.log(`[event:${type}] ${detail} (credits: ${creditsSpent})`);
  }
}

export async function getCatalog(slug: string): Promise<unknown> {
  const res = await fetch(`${BASE}/v1/holocron/catalog/${slug}`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Catalog fetch failed for ${slug}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function searchCatalog(q: string): Promise<unknown> {
  const res = await fetch(
    `${BASE}/v1/holocron/search?q=${encodeURIComponent(q)}`,
    { headers: headers() }
  );
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface JobResult {
  jobId: string;
  status: string;
  result: unknown;
}

export async function submitTask(
  actionId: string,
  params: Record<string, unknown>,
  credentialId?: string
): Promise<string> {
  const body: Record<string, unknown> = { action_id: actionId, params };
  if (credentialId) body.credential_id = credentialId;

  const res = await fetch(`${BASE}/v1/holocron/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  if (res.status === 402) {
    throw new Error("INSUFFICIENT_CREDITS");
  }
  if (!res.ok) {
    throw new Error(`Task submit failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { job_id?: string; id?: string };
  const jobId = data.job_id ?? data.id ?? "";
  if (!jobId) throw new Error(`No job_id in response: ${JSON.stringify(data)}`);
  return jobId;
}

export interface PollOnceResult {
  state: "processing" | "completed" | "failed";
  payload?: unknown;
  error?: string;
}

// Single status check — no waiting. Used by the async /api/ingest/status worker
// so a serverless function never blocks on a 2-min Wire job.
export async function pollJobOnce(jobId: string): Promise<PollOnceResult> {
  const res = await fetch(`${BASE}/v1/holocron/jobs/${jobId}`, { headers: headers() });
  if (res.status === 429) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  if (!res.ok) {
    throw new Error(`Poll failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    status: string;
    data?: unknown;
    result?: unknown;
  };
  if (data.status === "completed" || data.status === "success") {
    const payload = (data as Record<string, unknown>).data ?? data.result ?? data;
    return { state: "completed", payload };
  }
  if (data.status === "failed" || data.status === "error") {
    return { state: "failed", error: JSON.stringify(data).slice(0, 200) };
  }
  return { state: "processing" };
}

export async function pollJob(
  jobId: string,
  // Wire jobs observed to take ~2min; use 3min default
  maxWaitMs = 180_000
): Promise<unknown> {
  const deadline = Date.now() + maxWaitMs;
  let delay = 4000;

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/v1/holocron/jobs/${jobId}`, {
      headers: headers(),
    });

    if (res.status === 429) {
      await sleep(15_000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Poll failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      status: string;
      data?: unknown;
      result?: unknown;
    };

    if (data.status === "completed" || data.status === "success") {
      // Wire wraps result in data.data; fall back to data.result then data itself
      return (data as Record<string, unknown>).data ?? data.result ?? data;
    }
    if (data.status === "failed" || data.status === "error") {
      throw new Error(`Job ${jobId} failed: ${JSON.stringify(data)}`);
    }

    await sleep(delay);
    delay = Math.min(delay * 1.3, 10_000);
  }

  throw new Error(`Job ${jobId} timed out after ${maxWaitMs}ms`);
}

export async function runTask(
  actionId: string,
  params: Record<string, unknown>,
  opts: { retries?: number; credentialId?: string; label?: string } = {}
): Promise<unknown> {
  const { retries = 3, credentialId, label = actionId } = opts;
  let attempt = 0;

  while (attempt < retries) {
    try {
      const jobId = await submitTask(actionId, params, credentialId);
      const raw = await pollJob(jobId);
      totalCreditsSpent += 1;
      await logEvent("ingest", `${label} ok`, 1);
      // Wire result shape: { status, data: <actual payload>, meta, ... }
      const wireResult = raw as Record<string, unknown>;
      return wireResult?.data ?? raw;
    } catch (err) {
      attempt++;
      const msg = err instanceof Error ? err.message : String(err);

      if (msg === "RATE_LIMIT_EXCEEDED") {
        console.warn(`[wire] rate limited, backing off 10s (attempt ${attempt})`);
        await sleep(10_000);
        continue;
      }
      if (msg === "INSUFFICIENT_CREDITS") {
        await logEvent("error", "INSUFFICIENT_CREDITS", 0);
        throw err;
      }
      if (attempt >= retries) {
        await logEvent("error", `${label} failed after ${retries} attempts: ${msg}`, 0);
        throw err;
      }

      const backoff = 2000 * attempt;
      console.warn(`[wire] attempt ${attempt} failed, retrying in ${backoff}ms: ${msg}`);
      await sleep(backoff);
    }
  }

  throw new Error(`runTask exhausted retries for ${actionId}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
