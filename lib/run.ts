/**
 * Shared run engine for the async Wire ingest, used by:
 *   - POST /api/ingest/start  (submit only)
 *   - GET  /api/ingest/status (advance one step)
 *   - GET  /api/tick          (cron: submit + bounded poll)
 *
 * No single call blocks on a 2-min Wire job: startRun() only submits,
 * advanceRun() does one status-check per pending job.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { submitTask, pollJobOnce } from "./wire";
import { TARGET_JOBS, POOL_JOBS } from "./targets";
import { normalizeByKind } from "./targets";
import { PANEL_JOBS, PANEL_KINDS, normalizePanel } from "./panels";
import { matchMarkets, tierOfGroup } from "./match";
import { categorize } from "./categorize";
import { topicKey } from "./categorize";
import type { NormalizedMarket } from "./normalize/types";

const IN_FLIGHT_WINDOW_MS = 5 * 60 * 1000;

const ALL_JOBS = [
  ...TARGET_JOBS.map((j) => ({ ...j })),
  ...POOL_JOBS.map((j) => ({ ...j })),
  ...PANEL_JOBS.map((j) => ({ venue: "panel", event: "panel", ...j })),
];

export async function startRun(opts: { dedupe?: boolean } = {}): Promise<{ runId: string; deduped?: boolean; submitted: number; total: number }> {
  const { prisma } = await import("./db");

  if (opts.dedupe !== false) {
    const cutoff = new Date(Date.now() - IN_FLIGHT_WINDOW_MS);
    const existing = await prisma.run.findFirst({
      where: { status: { in: ["running", "matching"] }, createdAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { runId: existing.id, deduped: true, submitted: 0, total: ALL_JOBS.length };
  }

  const run = await prisma.run.create({ data: { status: "running" } });

  // Submit in small concurrent waves with a stagger + 429 retry. Submitting all
  // ~21 tasks at once trips Wire's rate limit (429) and silently drops jobs
  // (Kalshi was the usual casualty). Waves of 4 keep every job submitted.
  const submitted: Array<{ ok: boolean; job: any; wireJobId?: string; error?: string }> = [];
  const WAVE = 3;
  for (let i = 0; i < ALL_JOBS.length; i += WAVE) {
    const wave = ALL_JOBS.slice(i, i + WAVE);
    await Promise.all(
      wave.map(async (job) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const wireJobId = await submitTask(job.actionId, job.params);
            submitted.push({ ok: true, job, wireJobId });
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === "RATE_LIMIT_EXCEEDED" && attempt < 2) {
              await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
              continue;
            }
            if (attempt === 2 || msg !== "RATE_LIMIT_EXCEEDED") {
              submitted.push({ ok: false, job, error: msg });
              return;
            }
          }
        }
      })
    );
    if (i + WAVE < ALL_JOBS.length) await new Promise((r) => setTimeout(r, 800));
  }

  for (const s of submitted) {
    await prisma.ingestJob.create({
      data: {
        runId: run.id,
        venue: s.job.venue,
        kind: s.job.kind,
        event: s.job.event,
        label: s.job.label,
        wireJobId: s.ok ? s.wireJobId! : "",
        status: s.ok ? "pending" : "failed",
        error: s.ok ? null : (s.error ?? "submit failed"),
      },
    });
  }

  const okCount = submitted.filter((s) => s.ok).length;
  if (okCount === 0) await prisma.run.update({ where: { id: run.id }, data: { status: "failed" } });
  return { runId: run.id, submitted: okCount, total: ALL_JOBS.length };
}

// Advance a run by one step: single status-check per pending job, normalize
// completed ones, and run matching once when every job has resolved.
export async function advanceRun(runId: string): Promise<void> {
  const { prisma } = await import("./db");
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return;

  const jobs = await prisma.ingestJob.findMany({ where: { runId } });
  const pending = jobs.filter((j: any) => j.status === "pending" && j.wireJobId);

  await Promise.all(
    pending.map(async (j: any) => {
      try {
        const res = await pollJobOnce(j.wireJobId);
        if (res.state === "completed") {
          const payload = (res.payload as Record<string, unknown>)?.data ?? res.payload;
          if (PANEL_KINDS.has(j.kind)) {
            const entry = normalizePanel(j.kind, payload);
            if (entry) {
              await prisma.panelCache.upsert({
                where: { key: entry.key },
                update: { payloadJson: JSON.stringify(entry.data), creditsSpent: 1, fetchedAt: new Date() },
                create: { key: entry.key, payloadJson: JSON.stringify(entry.data), creditsSpent: 1 },
              });
            }
          } else {
            const markets = normalizeByKind(j.kind, payload);
            await upsertRunMarkets(markets, runId);
          }
          await prisma.ingestJob.update({ where: { id: j.id }, data: { status: "completed" } });
        } else if (res.state === "failed") {
          await prisma.ingestJob.update({ where: { id: j.id }, data: { status: "failed", error: res.error ?? "job failed" } });
        }
      } catch (e) {
        console.warn(`[run] job ${j.id} poll error: ${e instanceof Error ? e.message : e}`);
      }
    })
  );

  const updated = await prisma.ingestJob.findMany({ where: { runId } });
  const stillPending = updated.filter((j: any) => j.status === "pending").length;

  if (stillPending === 0 && run.status === "running") {
    await prisma.run.update({ where: { id: runId }, data: { status: "matching" } });
    try {
      await runMatching(runId);
    } catch (e) {
      console.error("[run] matching failed:", e);
    }
    await prisma.run.update({ where: { id: runId }, data: { status: "completed" } });
  }
}

// Force-complete a run even if some jobs still pending (used by the bounded
// cron so a partial refresh still produces a usable "completed" run).
export async function finalizeRun(runId: string): Promise<void> {
  const { prisma } = await import("./db");
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run || run.status === "completed") return;
  await prisma.run.update({ where: { id: runId }, data: { status: "matching" } });
  try {
    await runMatching(runId);
  } catch (e) {
    console.error("[run] finalize matching failed:", e);
  }
  await prisma.run.update({ where: { id: runId }, data: { status: "completed" } });
}

async function upsertRunMarkets(markets: NormalizedMarket[], runId: string) {
  if (markets.length === 0) return;
  const { prisma } = await import("./db");
  for (const m of markets) {
    const category = categorize(m.title);
    const topic = topicKey(m.title);
    await prisma.market.upsert({
      where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      update: {
        title: m.title, outcomesJson: JSON.stringify(m.outcomes), closeTime: m.closeTime,
        liquidity: m.liquidity, isPlayMoney: m.isPlayMoney, category, topic, runId, snapshotAt: new Date(), url: m.url,
      },
      create: {
        venue: m.venue, venueMarketId: m.venueMarketId, title: m.title,
        outcomesJson: JSON.stringify(m.outcomes), closeTime: m.closeTime,
        liquidity: m.liquidity, isPlayMoney: m.isPlayMoney, category, topic, runId, url: m.url,
      },
    });
  }
}

async function runMatching(runId: string) {
  const { prisma } = await import("./db");
  const rows = await prisma.market.findMany({ where: { runId } });
  if (rows.length < 2) return;
  const markets: NormalizedMarket[] = rows.map((m: any) => ({
    venue: m.venue, venueMarketId: m.venueMarketId, title: m.title,
    outcomes: JSON.parse(m.outcomesJson), closeTime: m.closeTime,
    liquidity: m.liquidity, isPlayMoney: m.isPlayMoney ?? false, url: m.url,
  }));
  const groups = await matchMarkets(markets);
  for (const g of groups) {
    const dbIds: string[] = [];
    for (const m of g.markets) {
      const rec = await prisma.market.findUnique({
        where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      });
      if (rec) dbIds.push(rec.id);
    }
    if (dbIds.length < 2) continue;
    await prisma.matchGroup.create({
      data: {
        label: g.label, marketIds: JSON.stringify(dbIds), matchConfidence: g.matchConfidence,
        notedDifferences: JSON.stringify(g.notedDifferences), maxSpread: g.maxSpread,
        realMoneySpread: g.realMoneySpread, tier: tierOfGroup(g),
        category: categorize(g.label), runId,
      },
    });
  }

  // Derive trending tabs from the broad pool (top 12 per venue by liquidity) —
  // no extra Wire calls. Cached for the page-load read.
  await deriveTrending(rows);
}

async function deriveTrending(rows: any[]) {
  const { prisma } = await import("./db");
  const venues = ["kalshi", "polymarket", "robinhood", "manifold"];
  for (const venue of venues) {
    const top = rows
      .filter((m) => m.venue === venue)
      .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
      .slice(0, 12)
      .map((m) => {
        const outcomes = JSON.parse(m.outcomesJson);
        return {
          venue: m.venue, title: m.title, url: m.url,
          yesProb: outcomes[0]?.impliedProb ?? null,
          yesName: outcomes[0]?.name ?? "Yes",
          isPlayMoney: m.isPlayMoney ?? false,
          category: m.category ?? "other",
        };
      });
    if (top.length === 0) continue;
    const key = `trending:${venue}`;
    await prisma.panelCache.upsert({
      where: { key },
      update: { payloadJson: JSON.stringify(top), fetchedAt: new Date() },
      create: { key, payloadJson: JSON.stringify(top), creditsSpent: 0 },
    });
  }
}
