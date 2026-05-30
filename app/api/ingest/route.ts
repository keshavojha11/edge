import { NextRequest } from "next/server";
import { ingestAll, getCachedMarkets } from "@/lib/ingest";

export const maxDuration = 300; // 5 min for Vercel Pro; reduce to 60 for Hobby

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (process.env.DEMO_MODE === "true") {
    const cached = await getCachedMarkets();
    return Response.json({ demo: true, markets: cached?.length ?? 0 });
  }

  try {
    const result = await ingestAll({ force });
    return Response.json({
      ok: true,
      markets: result.markets.length,
      creditsUsed: result.creditsUsed,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  const cached = await getCachedMarkets();
  return Response.json({ cached: cached?.length ?? 0 });
}
