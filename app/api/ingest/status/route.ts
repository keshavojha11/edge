/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { advanceRun } from "@/lib/run";
import { computeSpreads } from "@/lib/match";

// Short poll: advance the run one step, return per-venue progress + groups.
// The frontend re-polls every ~3s. Stays well under 60s.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("run");
  if (!runId) return Response.json({ error: "run param required" }, { status: 400 });

  const { prisma } = await import("@/lib/db");
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return Response.json({ error: "run not found" }, { status: 404 });

  await advanceRun(runId);

  const finalRun = await prisma.run.findUnique({ where: { id: runId } });
  const jobs = await prisma.ingestJob.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });
  const groups = await loadRunGroups(runId);

  return Response.json({
    runId,
    status: finalRun?.status ?? "running",
    done: finalRun?.status === "completed" || finalRun?.status === "failed",
    jobs: jobs.map((j: any) => ({ venue: j.venue, label: j.label, status: j.status, error: j.error })),
    groups,
  });
}

async function loadRunGroups(runId: string) {
  const { prisma } = await import("@/lib/db");
  const groups = await prisma.matchGroup.findMany({
    where: { runId },
    orderBy: { realMoneySpread: "desc" },
  });

  const result = [];
  for (const g of groups) {
    const marketIds: string[] = JSON.parse(g.marketIds);
    const markets = await prisma.market.findMany({ where: { id: { in: marketIds } } });
    if (markets.length < 2) continue;
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
      spreadDetails: computeSpreads(normalized as any),
      matchConfidence: g.matchConfidence,
      notedDifferences: JSON.parse(g.notedDifferences),
    });
  }
  return result;
}
