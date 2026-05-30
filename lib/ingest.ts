import "dotenv/config";
import { submitTask, pollJob, getCreditsSpent } from "./wire";
import { normalizeKalshi } from "./normalize/kalshi";
import { normalizePolymarket } from "./normalize/polymarket";
import { normalizeManifold } from "./normalize/manifold";
import { normalizeRobinhood } from "./normalize/robinhood";
import type { NormalizedMarket } from "./normalize/types";

export type { NormalizedMarket };

// How stale a snapshot can be before we re-fetch (30 min in production, 0 in test)
const CACHE_TTL_MS = 30 * 60 * 1000;

const VENUE_ACTIONS: Array<{
  venue: NormalizedMarket["venue"];
  actionId: string;
  params: Record<string, unknown>;
}> = [
  {
    venue: "kalshi",
    actionId: "kl_events",
    params: { limit: 50, status: "open", with_nested_markets: true },
  },
  {
    venue: "polymarket",
    actionId: "pm_get_markets",
    params: { limit: 50, closed: false, order: "liquidity" },
  },
  {
    venue: "manifold",
    actionId: "mm_markets",
    params: { limit: 100 },
  },
  {
    venue: "robinhood",
    actionId: "rh_get_markets",
    params: { limit: 50, live_only: true },
  },
];

type Normalizer = (raw: unknown) => NormalizedMarket[];

const NORMALIZERS: Record<NormalizedMarket["venue"], Normalizer> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kalshi: (r: any) => normalizeKalshi(r),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  polymarket: (r: any) => normalizePolymarket(r),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifold: (r: any) => normalizeManifold(r),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  robinhood: (r: any) => normalizeRobinhood(r),
};

async function upsertMarkets(markets: NormalizedMarket[]): Promise<void> {
  const { prisma } = await import("./db");
  for (const m of markets) {
    await prisma.market.upsert({
      where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      update: {
        title: m.title,
        outcomesJson: JSON.stringify(m.outcomes),
        closeTime: m.closeTime,
        liquidity: m.liquidity,
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
        url: m.url,
      },
    });
  }
}

export async function getCachedMarkets(): Promise<NormalizedMarket[] | null> {
  try {
    const { prisma } = await import("./db");
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    const markets = await prisma.market.findMany({
      where: { snapshotAt: { gte: cutoff } },
      orderBy: { snapshotAt: "desc" },
    });
    if (markets.length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return markets.map((m: any) => ({
      venue: m.venue as NormalizedMarket["venue"],
      venueMarketId: m.venueMarketId,
      title: m.title,
      outcomes: JSON.parse(m.outcomesJson),
      closeTime: m.closeTime,
      liquidity: m.liquidity,
      url: m.url,
    }));
  } catch {
    return null;
  }
}

export async function ingestAll(opts: { force?: boolean } = {}): Promise<{
  markets: NormalizedMarket[];
  creditsUsed: number;
  errors: string[];
}> {
  if (!opts.force) {
    const cached = await getCachedMarkets();
    if (cached) {
      console.log(`[ingest] cache hit: ${cached.length} markets`);
      return { markets: cached, creditsUsed: 0, errors: [] };
    }
  }

  // Submit all 4 jobs in parallel (staggered by 500ms to avoid rate limits)
  console.log("[ingest] submitting Wire jobs...");
  const jobMap: Array<{ venue: NormalizedMarket["venue"]; jobId: string }> = [];
  const submitErrors: string[] = [];

  for (let i = 0; i < VENUE_ACTIONS.length; i++) {
    const v = VENUE_ACTIONS[i];
    if (i > 0) await sleep(500);
    try {
      const jobId = await submitTask(v.actionId, v.params);
      jobMap.push({ venue: v.venue, jobId });
      console.log(`[ingest] ${v.venue} job=${jobId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ingest] ${v.venue} submit failed: ${msg}`);
      submitErrors.push(`${v.venue}: ${msg}`);
    }
  }

  // Poll all jobs (they run concurrently on Wire's side)
  console.log("[ingest] polling jobs...");
  const allMarkets: NormalizedMarket[] = [];
  const pollErrors: string[] = [];

  await Promise.all(
    jobMap.map(async ({ venue, jobId }) => {
      try {
        const raw = await pollJob(jobId);
        const wireResult = raw as Record<string, unknown>;
        const payload = wireResult?.data ?? raw;
        const normalize = NORMALIZERS[venue];
        const markets = normalize(payload);
        console.log(`[ingest] ${venue}: ${markets.length} markets`);
        allMarkets.push(...markets);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ingest] ${venue} poll failed: ${msg}`);
        pollErrors.push(`${venue}: ${msg}`);
      }
    })
  );

  // Persist to DB
  if (allMarkets.length > 0) {
    await upsertMarkets(allMarkets);
    console.log(`[ingest] saved ${allMarkets.length} markets to DB`);
  }

  const creditsUsed = getCreditsSpent();
  return {
    markets: allMarkets,
    creditsUsed,
    errors: [...submitErrors, ...pollErrors],
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
