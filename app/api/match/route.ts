import { NextRequest } from "next/server";
import { getCachedMarkets } from "@/lib/ingest";
import { matchMarkets, persistMatchGroups } from "@/lib/match";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (process.env.DEMO_MODE === "true") {
    return Response.json({ demo: true });
  }

  const markets = await getCachedMarkets();
  if (!markets || (markets.length === 0 && !force)) {
    return Response.json({ error: "No markets cached. Run /api/ingest first." }, { status: 400 });
  }

  try {
    const groups = await matchMarkets(markets ?? []);
    await persistMatchGroups(groups);
    return Response.json({ ok: true, groups: groups.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
