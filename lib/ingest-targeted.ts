/**
 * Targeted ingest of known cross-venue overlapping markets.
 * Fetches by specific slug/ID rather than generic top-liquidity lists.
 * Called by ingestAll after the generic pull.
 */
import "dotenv/config";
import { submitTask, pollJob } from "./wire";
import type { NormalizedMarket } from "./normalize/types";

async function wireRun(actionId: string, params: Record<string, unknown>): Promise<unknown> {
  const jobId = await submitTask(actionId, params);
  const raw = await pollJob(jobId);
  return (raw as Record<string, unknown>)?.data ?? raw;
}

// ─── Robinhood: multi-outcome → derived binary ────────────────────────────────

interface RhContract {
  symbol: string;
  name: string;
  yes_bid: number | null;
  yes_ask: number | null;
  open_interest: string;
  expiration_date: string;
}

interface RhEvent {
  id: string;
  name: string;
  slug: string;
  state: string;
  contracts: RhContract[];
}

function rhMidPrice(c: RhContract): number {
  const bid = c.yes_bid ?? 0;
  const ask = c.yes_ask ?? bid;
  return ask > 0 ? (bid + ask) / 2 : 0;
}

// ─── Known targets ─────────────────────────────────────────────────────────────

interface TargetedResult {
  markets: NormalizedMarket[];
  errors: string[];
}

export async function fetchTargetedMarkets(): Promise<TargetedResult> {
  const markets: NormalizedMarket[] = [];
  const errors: string[] = [];

  // ── 1. Robinhood "Number of Rate Cuts in 2026" (Dec 31 resolution) ───────
  // Derive a binary "≥4 cuts" market from individual count contracts.
  // Matches semantically with Polymarket "Will 4 Fed rate cuts happen in 2026?"
  try {
    const rh = await wireRun("rh_get_event", {
      slug: "number-of-rate-cuts-in-2026-dec-31-2026",
    });
    const event = (rh as { event?: RhEvent }).event ?? (rh as RhEvent);
    const contracts: RhContract[] = event?.contracts ?? [];

    if (contracts.length > 0) {
      // P(0 cuts) and P(1 cut) for reference
      const c0 = contracts.find((c) => c.symbol?.endsWith("-T0"));
      const c1 = contracts.find((c) => c.symbol?.endsWith("-T1"));

      // Derive P(≥4 cuts) = sum of mid-prices for T4, T5, T6, T7, T8, T9, T10+
      const atLeast4Contracts = contracts.filter((c) => {
        const num = parseInt(c.symbol?.split("-T").pop() ?? "0");
        return num >= 4;
      });
      const pAtLeast4 = atLeast4Contracts.reduce((sum, c) => sum + rhMidPrice(c), 0);

      // P(0 cuts): at-least-0 = 100%, so P(0 cuts) is just c0 mid price
      const p0 = c0 ? rhMidPrice(c0) : 0;
      const p1 = c1 ? rhMidPrice(c1) : 0;
      const p2Plus = Math.max(0, 1 - p0 - p1);

      if (pAtLeast4 > 0.001) {
        markets.push({
          venue: "robinhood",
          venueMarketId: "rh-rate-cuts-2026-ge4",
          title: "Will there be at least 4 Fed rate cuts in 2026?",
          outcomes: [
            { name: "Yes", impliedProb: Math.min(pAtLeast4, 0.99) },
            { name: "No", impliedProb: Math.max(1 - pAtLeast4, 0.01) },
          ],
          closeTime: new Date("2026-12-31T23:59:00Z"),
          liquidity: contracts.reduce(
            (sum, c) => sum + parseInt(c.open_interest ?? "0") / 100,
            0
          ),
          isPlayMoney: false,
          url: "https://robinhood.com/predictions/events/number-of-rate-cuts-in-2026-dec-31-2026",
        });
        console.log(
          `[targeted] Robinhood ≥4 cuts derived: P(yes)=${(pAtLeast4 * 100).toFixed(1)}% P(0 cuts)=${(p0*100).toFixed(1)}% P(1 cut)=${(p1*100).toFixed(1)}%`
        );
      }

      // Also add a "P(0 cuts in 2026)" market — big signal if significant
      if (p0 > 0.1) {
        markets.push({
          venue: "robinhood",
          venueMarketId: "rh-rate-cuts-2026-0",
          title: "Will the Fed make zero rate cuts in 2026?",
          outcomes: [
            { name: "Yes", impliedProb: Math.min(p0, 0.99) },
            { name: "No", impliedProb: Math.max(1 - p0, 0.01) },
          ],
          closeTime: new Date("2026-12-31T23:59:00Z"),
          liquidity: parseInt(c0?.open_interest ?? "0") / 100,
          isPlayMoney: false,
          url: "https://robinhood.com/predictions/events/number-of-rate-cuts-in-2026-dec-31-2026",
        });
        console.log(`[targeted] Robinhood 0 cuts: P=${(p0*100).toFixed(1)}%`);
      }

      // P(≥2 cuts)
      const p2OrMore = Math.max(0, p2Plus);
      if (p2OrMore > 0.05) {
        markets.push({
          venue: "robinhood",
          venueMarketId: "rh-rate-cuts-2026-ge2",
          title: "Will the Fed cut rates at least twice in 2026?",
          outcomes: [
            { name: "Yes", impliedProb: Math.min(p2OrMore, 0.99) },
            { name: "No", impliedProb: Math.max(1 - p2OrMore, 0.01) },
          ],
          closeTime: new Date("2026-12-31T23:59:00Z"),
          liquidity: 50000,
          isPlayMoney: false,
          url: "https://robinhood.com/predictions/events/number-of-rate-cuts-in-2026-dec-31-2026",
        });
        console.log(`[targeted] Robinhood ≥2 cuts: P=${(p2OrMore*100).toFixed(1)}%`);
      }
    }
  } catch (e) {
    errors.push(`Robinhood rate cuts: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. Robinhood Fed June 2026 decision ──────────────────────────────────
  try {
    const rh = await wireRun("rh_get_event", {
      slug: "fed-decision-in-jun-2026-jun-17-2026",
    });
    const event = (rh as { event?: RhEvent }).event ?? (rh as RhEvent);
    const contracts: RhContract[] = event?.contracts ?? [];

    if (contracts.length > 0) {
      // Find cut/hold/hike contracts
      const hold = contracts.find((c) => c.symbol?.includes("-H0"));
      const cut25 = contracts.find((c) => c.symbol?.includes("-C25"));
      const cutMore = contracts.find((c) => c.symbol?.includes("-C26")); // >25bp cut

      const pHold = hold ? rhMidPrice(hold) : 0;
      const pCut25 = cut25 ? rhMidPrice(cut25) : 0;
      const pCutMore = cutMore ? rhMidPrice(cutMore) : 0;
      const pAnyCut = pCut25 + pCutMore;

      if (pHold > 0 || pAnyCut > 0) {
        markets.push({
          venue: "robinhood",
          venueMarketId: "rh-fed-jun-2026-cut",
          title: "Will the Fed cut rates at the June 2026 FOMC meeting?",
          outcomes: [
            { name: "Yes (cut)", impliedProb: Math.max(pAnyCut, 0.001) },
            { name: "No (hold/hike)", impliedProb: Math.max(1 - pAnyCut, 0.001) },
          ],
          closeTime: new Date("2026-06-17T18:00:00Z"),
          liquidity:
            parseInt(hold?.open_interest ?? "0") / 100 +
            parseInt(cut25?.open_interest ?? "0") / 100,
          isPlayMoney: false,
          url: "https://robinhood.com/predictions/events/fed-decision-in-jun-2026-jun-17-2026",
        });
        console.log(
          `[targeted] Robinhood Fed June: P(hold)=${(pHold*100).toFixed(1)}% P(cut)=${(pAnyCut*100).toFixed(1)}%`
        );
      }
    }
  } catch (e) {
    errors.push(`Robinhood Fed June: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Polymarket — fresh fetch of specific macro markets ─────────────────
  const PM_TARGETS = [
    { id: "616906", title: "Will 4 Fed rate cuts happen in 2026?" },
  ];

  for (const target of PM_TARGETS) {
    try {
      const pm = (await wireRun("pm_get_market", { market_id: target.id })) as {
        market?: {
          id: string;
          question: string;
          slug: string;
          outcomes: string[];
          outcome_prices: number[];
          liquidity: number;
          end_date: string | null;
          active: boolean;
          closed: boolean;
        };
      };
      const m = pm?.market;
      if (m && m.active && !m.closed && m.outcomes?.length) {
        const outcomes = m.outcomes.map((name, i) => ({
          name,
          impliedProb: Number(m.outcome_prices[i]) ?? 0,
        }));
        markets.push({
          venue: "polymarket",
          venueMarketId: m.id,
          title: m.question ?? target.title,
          outcomes,
          closeTime: m.end_date ? new Date(m.end_date) : null,
          liquidity: m.liquidity ?? null,
          isPlayMoney: false,
          url: `https://polymarket.com/event/${m.slug}`,
        });
        console.log(
          `[targeted] Polymarket [${target.id}]: YES=${(outcomes[0]?.impliedProb * 100).toFixed(1)}%`
        );
      }
    } catch (e) {
      // Degrade gracefully — use DB version if fresh fetch fails
      console.warn(`[targeted] Polymarket ${target.id} fresh fetch failed, using DB version`);
      errors.push(`Polymarket ${target.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { markets, errors };
}
