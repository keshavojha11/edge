import { NextRequest } from "next/server";
import { startRun, advanceRun, finalizeRun } from "@/lib/run";
import { getRankedGroups } from "@/lib/match";
import { sendDiscordAlert } from "@/lib/discord";

// Vercel Cron entry. Bounded: submit a run, poll for ~45s, then finalize so a
// partial refresh still produces a usable completed run. Fast panels (macro/
// news) complete within budget; slow market pulls finish on the next run/button.
export const maxDuration = 60;

const POLL_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (process.env.DEMO_MODE === "true") {
    return Response.json({ demo: true });
  }

  const { runId } = await startRun({ dedupe: true });

  const deadline = Date.now() + POLL_BUDGET_MS;
  const { prisma } = await import("@/lib/db");
  while (Date.now() < deadline) {
    await advanceRun(runId);
    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (run?.status === "completed" || run?.status === "failed") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  // Force-complete whatever we have so panels that finished are usable.
  await finalizeRun(runId);

  // Watch alerts against the freshest groups
  const watches = await prisma.watch.findMany({ where: { status: "active" } });
  const groups = await getRankedGroups();
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  let alertsFired = 0;
  for (const watch of watches) {
    const group = groupMap.get(watch.matchGroupId);
    if (!group) continue;
    const spread = group.realMoneySpread;
    await prisma.watch.update({ where: { id: watch.id }, data: { lastSpread: spread } });
    if (spread >= watch.thresholdPct) {
      await prisma.watch.update({ where: { id: watch.id }, data: { status: "triggered" } });
      const top = group.spreadDetails[0];
      await sendDiscordAlert(
        `🔔 **Edge Alert** — *${group.label}*\n` +
          `Real-money spread hit **${spread.toFixed(1)} pts** (threshold ${watch.thresholdPct}pts)\n` +
          (top ? `${top.venueA} ${(top.probA * 100).toFixed(1)}% vs ${top.venueB} ${(top.probB * 100).toFixed(1)}%\n` : "") +
          `\n⚠ Not risk-free arbitrage. Not financial advice.`
      );
      alertsFired++;
    }
  }

  return Response.json({ ok: true, runId, alertsFired });
}
