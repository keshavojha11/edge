/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { pollJobOnce } from "@/lib/wire";
import { normalizeByKind } from "@/lib/targets";
import { matchMarkets } from "@/lib/match";
import type { NormalizedMarket } from "@/lib/normalize/types";

// Short poll: advance pending Wire jobs, normalize completed ones, match when
// all jobs are in. Must stay well under 60s — the frontend re-polls every ~3s.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("run");
  if (!runId) return Response.json({ error: "run param required" }, { status: 400 });

  const { prisma } = await import("@/lib/db");

  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return Response.json({ error: "run not found" }, { status: 404 });

  const jobs = await prisma.ingestJob.findMany({ where: { runId } });

  // Advance each still-pending Wire job with a single status check (no long poll).
  const pending = jobs.filter((j: any) => j.status === "pending" && j.wireJobId);
  await Promise.all(
    pending.map(async (j: any) => {
      try {
        const res = await pollJobOnce(j.wireJobId);
        if (res.state === "completed") {
          const payload = (res.payload as Record<string, unknown>)?.data ?? res.payload;
          const markets = normalizeByKind(j.kind, payload);
          await upsertRunMarkets(markets, runId);
          await prisma.ingestJob.update({ where: { id: j.id }, data: { status: "completed" } });
        } else if (res.state === "failed") {
          await prisma.ingestJob.update({
            where: { id: j.id },
            data: { status: "failed", error: res.error ?? "job failed" },
          });
        }
        // else still processing — leave pending for the next poll
      } catch (e) {
        // Transient (e.g. 429) — leave pending, surface error softly
        console.warn(`[status] job ${j.id} poll error: ${e instanceof Error ? e.message : e}`);
      }
    })
  );

  // Re-read jobs after advancing
  const updated = await prisma.ingestJob.findMany({ where: { runId } });
  const stillPending = updated.filter((j: any) => j.status === "pending").length;
  const allDone = stillPending === 0;

  // When every job is resolved and we haven't matched yet, run LLM matching once.
  if (allDone && run.status === "running") {
    // Guard against concurrent polls double-matching
    await prisma.run.update({ where: { id: runId }, data: { status: "matching" } });
    try {
      await runMatching(runId);
      await prisma.run.update({ where: { id: runId }, data: { status: "completed" } });
    } catch (e) {
      console.error("[status] matching failed:", e);
      await prisma.run.update({ where: { id: runId }, data: { status: "completed" } });
    }
  }

  const finalRun = await prisma.run.findUnique({ where: { id: runId } });
  const finalJobs = await prisma.ingestJob.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });

  // Load groups produced by this run
  const groups = await loadRunGroups(runId);

  return Response.json({
    runId,
    status: finalRun?.status ?? "running",
    done: (finalRun?.status === "completed" || finalRun?.status === "failed"),
    jobs: finalJobs.map((j: any) => ({
      venue: j.venue,
      label: j.label,
      status: j.status,
      error: j.error,
    })),
    groups,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertRunMarkets(markets: NormalizedMarket[], runId: string) {
  if (markets.length === 0) return;
  const { prisma } = await import("@/lib/db");
  for (const m of markets) {
    await prisma.market.upsert({
      where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      update: {
        title: m.title,
        outcomesJson: JSON.stringify(m.outcomes),
        closeTime: m.closeTime,
        liquidity: m.liquidity,
        isPlayMoney: m.isPlayMoney,
        runId,
        snapshotAt: new Date(),
        url: m.url,
      },
      create: {
        venue: m.venue,
        venueMarketId: m.venueMarketId,
        title: m.title,
        outcomesJson: JSON.stringify(m.outcomes),
        closeTime: m.closeTime,
        liquidity: m.liquidity,
        isPlayMoney: m.isPlayMoney,
        runId,
        url: m.url,
      },
    });
  }
}

async function runMatching(runId: string) {
  const { prisma } = await import("@/lib/db");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await prisma.market.findMany({ where: { runId } });
  if (rows.length < 2) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markets: NormalizedMarket[] = rows.map((m: any) => ({
    venue: m.venue,
    venueMarketId: m.venueMarketId,
    title: m.title,
    outcomes: JSON.parse(m.outcomesJson),
    closeTime: m.closeTime,
    liquidity: m.liquidity,
    isPlayMoney: m.isPlayMoney ?? false,
    url: m.url,
  }));

  const groups = await matchMarkets(markets, { batchSize: 60, perVenueCap: 60 });

  // Persist groups tagged with this runId
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
        label: g.label,
        marketIds: JSON.stringify(dbIds),
        matchConfidence: g.matchConfidence,
        notedDifferences: JSON.stringify(g.notedDifferences),
        maxSpread: g.maxSpread,
        realMoneySpread: g.realMoneySpread,
        runId,
      },
    });
  }
}

async function loadRunGroups(runId: string) {
  const { prisma } = await import("@/lib/db");
  const { computeSpreads } = await import("@/lib/match");
  const groups = await prisma.matchGroup.findMany({
    where: { runId },
    orderBy: { realMoneySpread: "desc" },
  });

  const result = [];
  for (const g of groups) {
    const marketIds: string[] = JSON.parse(g.marketIds);
    const markets = await prisma.market.findMany({ where: { id: { in: marketIds } } });
    if (markets.length < 2) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = markets.map((m: any) => ({
      venue: m.venue,
      title: m.title,
      url: m.url,
      outcomes: JSON.parse(m.outcomesJson),
      liquidity: m.liquidity,
      isPlayMoney: m.isPlayMoney ?? false,
    }));
    result.push({
      id: g.id,
      label: g.label,
      markets: normalized,
      maxSpread: g.maxSpread,
      realMoneySpread: g.realMoneySpread,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spreadDetails: computeSpreads(normalized as any),
      matchConfidence: g.matchConfidence,
      notedDifferences: JSON.parse(g.notedDifferences),
    });
  }
  return result;
}
