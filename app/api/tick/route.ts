import { NextRequest } from "next/server";
import { ingestAll } from "@/lib/ingest";
import { getRankedGroups } from "@/lib/match";
import { sendDiscordAlert } from "@/lib/discord";

// Called by Vercel Cron (see vercel.json) and by `npm run tick` locally
export const maxDuration = 300;

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

  // Refresh market data
  const { markets, errors } = await ingestAll({ force: false });
  console.log(`[tick] ingest done: ${markets.length} markets, ${errors.length} errors`);

  // Check active watches against current spreads
  const { prisma } = await import("@/lib/db");
  const watches = await prisma.watch.findMany({ where: { status: "active" } });
  const groups = await getRankedGroups();
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  let alertsFired = 0;
  for (const watch of watches) {
    const group = groupMap.get(watch.matchGroupId);
    if (!group) continue;

    const currentSpread = group.maxSpread;
    await prisma.watch.update({
      where: { id: watch.id },
      data: { lastSpread: currentSpread },
    });

    if (currentSpread >= watch.thresholdPct) {
      await prisma.watch.update({ where: { id: watch.id }, data: { status: "triggered" } });
      const top = group.spreadDetails[0];
      const msg =
        `🔔 **Edge Alert** — *${group.label}*\n` +
        `Spread hit **${currentSpread.toFixed(1)} pts** (threshold: ${watch.thresholdPct}pts)\n` +
        (top
          ? `${top.venueA} ${(top.probA * 100).toFixed(1)}% vs ${top.venueB} ${(top.probB * 100).toFixed(1)}% on ${top.outcomeName}\n`
          : "") +
        `\n⚠ Not risk-free arbitrage. Resolution criteria, fees & liquidity differ. Not financial advice.`;
      await sendDiscordAlert(msg);
      alertsFired++;
    }
  }

  return Response.json({ ok: true, markets: markets.length, alertsFired, errors });
}
