import { NextRequest } from "next/server";
import { ingestAll } from "@/lib/ingest";

// Called by Vercel Cron (see vercel.json) and by `npm run tick` locally
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Verify cron secret in production
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

  // Phase 4: watch alert logic goes here

  return Response.json({ ok: true, markets: markets.length, errors });
}
