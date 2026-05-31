/**
 * Curated cross-venue target events for the live async ingest.
 *
 * Each target job is fetched by specific slug/ID (not generic top lists) so we
 * reliably pull markets that overlap across venues. Each job declares a `kind`
 * that selects how its raw Wire response is normalized.
 *
 * Kept small + curated so the LLM matcher sees every market in one batch and
 * the whole run finishes in ~2-3 min across the async start/poll cycle.
 */
import type { NormalizedMarket } from "./normalize/types";
import { normalizeKalshi } from "./normalize/kalshi";
import { normalizePolymarket } from "./normalize/polymarket";
import { normalizeManifold } from "./normalize/manifold";
import { normalizeRobinhood } from "./normalize/robinhood";

export interface TargetJob {
  venue: NormalizedMarket["venue"];
  kind: string;        // selects normalizer in normalizeByKind()
  event: string;       // logical event this job contributes to
  label: string;       // human label for the progress UI
  actionId: string;    // Wire action id
  params: Record<string, unknown>;
}

// ─── Broad pool jobs ────────────────────────────────────────────────────────────
// Top markets by volume/liquidity + key categories across all 4 venues, written
// to the Market table (tagged with runId) to feed full-pool matching, tiered
// context rows, and the trending tabs. A few hundred markets total.
export const POOL_JOBS: TargetJob[] = [
  // Kalshi: broad open events (mixed categories)
  // NB: kl_events silently returns 0 events at limit:200 — 100 is the working max (~560 nested markets).
  { venue: "kalshi", kind: "pool_kalshi", event: "pool", label: "Kalshi · top open", actionId: "kl_events", params: { limit: 100, status: "open", with_nested_markets: true } },
  // Polymarket: top by volume + top by liquidity (deduped on upsert)
  { venue: "polymarket", kind: "pool_polymarket", event: "pool", label: "Polymarket · top volume", actionId: "pm_get_markets", params: { limit: 80, closed: false, order: "volume_num" } },
  { venue: "polymarket", kind: "pool_polymarket", event: "pool", label: "Polymarket · top liquidity", actionId: "pm_get_markets", params: { limit: 80, closed: false, order: "liquidity_num" } },
  // Manifold: broad + trending
  { venue: "manifold", kind: "pool_manifold", event: "pool", label: "Manifold · markets", actionId: "mm_markets", params: { limit: 150 } },
  { venue: "manifold", kind: "pool_manifold", event: "pool", label: "Manifold · trending", actionId: "mm_trending", params: { limit: 40, filter: "open" } },
  // Robinhood: live + politics + economics categories
  { venue: "robinhood", kind: "pool_robinhood", event: "pool", label: "Robinhood · live", actionId: "rh_get_markets", params: { limit: 50, live_only: true } },
  { venue: "robinhood", kind: "pool_robinhood", event: "pool", label: "Robinhood · politics", actionId: "rh_get_markets", params: { limit: 30, live_only: true, category: "Politics" } },
  { venue: "robinhood", kind: "pool_robinhood", event: "pool", label: "Robinhood · economics", actionId: "rh_get_markets", params: { limit: 30, live_only: true, category: "Economics" } },
];

export const TARGET_JOBS: TargetJob[] = [
  // ── Fed rate cuts in 2026 — the proven real-money spread ───────────────────
  {
    venue: "polymarket",
    kind: "pm_market",
    event: "fed-cuts-2026",
    label: "Polymarket · 4 Fed cuts 2026",
    actionId: "pm_get_market",
    params: { market_id: "616906" },
  },
  {
    venue: "robinhood",
    kind: "rh_ratecuts_2026",
    event: "fed-cuts-2026",
    label: "Robinhood · rate cuts 2026",
    actionId: "rh_get_event",
    params: { slug: "number-of-rate-cuts-in-2026-dec-31-2026" },
  },
  {
    venue: "manifold",
    kind: "mm_search",
    event: "fed-cuts-2026",
    label: "Manifold · Fed cuts (crowd)",
    actionId: "mm_search_markets",
    params: { term: "Federal Reserve cut rates 2026", limit: 8, filter: "open", contract_type: "BINARY" },
  },

  // ── Fed June 2026 FOMC decision ────────────────────────────────────────────
  {
    venue: "robinhood",
    kind: "rh_fed_june",
    event: "fed-june-2026",
    label: "Robinhood · Fed June FOMC",
    actionId: "rh_get_event",
    params: { slug: "fed-decision-in-jun-2026-jun-17-2026" },
  },

  // ── US Recession 2026 (crowd sentiment; real-money added if found) ─────────
  {
    venue: "manifold",
    kind: "mm_search",
    event: "recession-2026",
    label: "Manifold · US recession (crowd)",
    actionId: "mm_search_markets",
    params: { term: "US recession 2026", limit: 8, filter: "open", contract_type: "BINARY" },
  },

  // ── BTC $150k 2026 (crowd sentiment) ───────────────────────────────────────
  {
    venue: "manifold",
    kind: "mm_search",
    event: "btc-150k-2026",
    label: "Manifold · BTC $150k (crowd)",
    actionId: "mm_search_markets",
    params: { term: "Bitcoin 150k 2026", limit: 8, filter: "open", contract_type: "BINARY" },
  },
];

// ─── Per-kind normalizers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rhMid(c: any): number {
  const bid = c.yes_bid ?? 0;
  const ask = c.yes_ask ?? bid;
  return ask > 0 ? (bid + ask) / 2 : 0;
}

export function normalizeByKind(kind: string, payload: unknown): NormalizedMarket[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;

  switch (kind) {
    // ── Broad pool pulls → full venue normalizers ────────────────────────────
    case "pool_kalshi":
      return normalizeKalshi(p);
    case "pool_polymarket":
      return normalizePolymarket(p);
    case "pool_manifold":
      // mm_markets → {markets}; mm_trending may wrap differently — try both
      return normalizeManifold(p?.markets ? p : { markets: p?.data?.markets ?? p?.markets ?? [] });
    case "pool_robinhood":
      return normalizeRobinhood(p);

    case "pm_market": {
      const m = p?.market ?? p;
      if (!m || !m.outcomes?.length) return [];
      return [{
        venue: "polymarket",
        venueMarketId: String(m.id),
        title: m.question,
        outcomes: m.outcomes.map((name: string, i: number) => ({
          name,
          impliedProb: Number(m.outcome_prices?.[i]) || 0,
        })),
        closeTime: m.end_date ? new Date(m.end_date) : null,
        liquidity: m.liquidity ?? null,
        isPlayMoney: false,
        url: `https://polymarket.com/markets?_q=${encodeURIComponent(m.question)}`,
      }];
    }

    case "rh_ratecuts_2026": {
      const event = p?.event ?? p;
      const contracts = event?.contracts ?? [];
      if (!contracts.length) return [];
      // Derive P(>=4 cuts) = sum of mid-prices for contracts T4..T20
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ge4 = contracts.filter((c: any) => {
        const n = parseInt(c.symbol?.split("-T").pop() ?? "0");
        return n >= 4;
      }).reduce((s: number, c: any) => s + rhMid(c), 0);
      if (ge4 <= 0.001) return [];
      const liquidity = contracts.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, c: any) => s + parseInt(c.open_interest ?? "0") / 100, 0
      );
      return [{
        venue: "robinhood",
        venueMarketId: "rh-rate-cuts-2026-ge4",
        title: "Will there be at least 4 Fed rate cuts in 2026?",
        outcomes: [
          { name: "Yes", impliedProb: Math.min(ge4, 0.99) },
          { name: "No", impliedProb: Math.max(1 - ge4, 0.01) },
        ],
        closeTime: new Date("2026-12-31T23:59:00Z"),
        liquidity,
        isPlayMoney: false,
        url: "https://robinhood.com/predictions/events/number-of-rate-cuts-in-2026-dec-31-2026",
      }];
    }

    case "rh_fed_june": {
      const event = p?.event ?? p;
      const contracts = event?.contracts ?? [];
      if (!contracts.length) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cut25 = contracts.find((c: any) => c.symbol?.includes("-C25"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cutMore = contracts.find((c: any) => c.symbol?.includes("-C26"));
      const pCut = (cut25 ? rhMid(cut25) : 0) + (cutMore ? rhMid(cutMore) : 0);
      if (pCut <= 0) return [];
      return [{
        venue: "robinhood",
        venueMarketId: "rh-fed-jun-2026-cut",
        title: "Will the Fed cut rates at the June 2026 FOMC meeting?",
        outcomes: [
          { name: "Yes", impliedProb: Math.max(pCut, 0.001) },
          { name: "No", impliedProb: Math.max(1 - pCut, 0.001) },
        ],
        closeTime: new Date("2026-06-17T18:00:00Z"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        liquidity: contracts.reduce((s: number, c: any) => s + parseInt(c.open_interest ?? "0") / 100, 0),
        isPlayMoney: false,
        url: "https://robinhood.com/predictions/events/fed-decision-in-jun-2026-jun-17-2026",
      }];
    }

    case "mm_search": {
      const markets = p?.markets ?? p?.data?.markets ?? [];
      const out: NormalizedMarket[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of markets) {
        if (m.outcomeType !== "BINARY" || m.probability == null) continue;
        if (m.probability <= 0.01 || m.probability >= 0.99) continue;
        out.push({
          venue: "manifold",
          venueMarketId: String(m.id),
          title: m.question,
          outcomes: [
            { name: "Yes", impliedProb: m.probability },
            { name: "No", impliedProb: 1 - m.probability },
          ],
          closeTime: m.closeTime ? new Date(m.closeTime) : null,
          liquidity: m.totalLiquidity ?? null,
          liquidityNote: "Mana (play money)",
          isPlayMoney: true,
          url: m.url,
        });
      }
      // Cap to the 3 most-traded to keep the matcher batch tight
      return out.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0)).slice(0, 3);
    }

    default:
      return [];
  }
}
