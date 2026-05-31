/**
 * Targeted ingestion for cross-venue events:
 * Fed rate decisions, BTC/ETH price, recession, elections.
 * Uses each venue's search action instead of generic listing.
 */
import "dotenv/config";
import { submitTask, pollJob } from "../lib/wire";
import { normalizeKalshi } from "../lib/normalize/kalshi";
import { normalizePolymarket } from "../lib/normalize/polymarket";
import { normalizeManifold } from "../lib/normalize/manifold";
import { normalizeRobinhood } from "../lib/normalize/robinhood";
import type { NormalizedMarket } from "../lib/normalize/types";

const SEARCHES = [
  // Kalshi: use kl_events with category filters (Economics, Crypto, Elections)
  { venue: "kalshi", actionId: "kl_events", params: { limit: 100, status: "open", with_nested_markets: true, series_ticker: "KXFEDRATE" }, tag: "kalshi-fed" },
  { venue: "kalshi", actionId: "kl_events", params: { limit: 100, status: "open", with_nested_markets: true, series_ticker: "KXBTC" }, tag: "kalshi-btc" },
  { venue: "kalshi", actionId: "kl_events", params: { limit: 100, status: "open", with_nested_markets: true, series_ticker: "KXETH" }, tag: "kalshi-eth" },
  { venue: "kalshi", actionId: "kl_events", params: { limit: 100, status: "open", with_nested_markets: true, series_ticker: "KXRECESSION" }, tag: "kalshi-recession" },
  { venue: "kalshi", actionId: "kl_series_list", params: { category: "Crypto" }, tag: "kalshi-crypto-series" },
  { venue: "kalshi", actionId: "kl_series_list", params: { category: "Economics" }, tag: "kalshi-econ-series" },

  // Polymarket: search by keyword
  { venue: "polymarket", actionId: "pm_search_markets", params: { query: "Fed rate cut 2026", limit: 20 }, tag: "pm-fed" },
  { venue: "polymarket", actionId: "pm_search_markets", params: { query: "Bitcoin BTC price 2026", limit: 20 }, tag: "pm-btc" },
  { venue: "polymarket", actionId: "pm_search_markets", params: { query: "recession GDP 2026", limit: 20 }, tag: "pm-recession" },
  { venue: "polymarket", actionId: "pm_search_markets", params: { query: "Ethereum ETH price", limit: 20 }, tag: "pm-eth" },
  { venue: "polymarket", actionId: "pm_search_markets", params: { query: "election president 2026 2028", limit: 20 }, tag: "pm-election" },

  // Manifold: search by keyword
  { venue: "manifold", actionId: "mm_search_markets", params: { term: "Federal Reserve rate 2026", limit: 50, filter: "open", contract_type: "BINARY" }, tag: "mm-fed" },
  { venue: "manifold", actionId: "mm_search_markets", params: { term: "bitcoin price 2026", limit: 50, filter: "open", contract_type: "BINARY" }, tag: "mm-btc" },
  { venue: "manifold", actionId: "mm_search_markets", params: { term: "US recession 2026", limit: 50, filter: "open", contract_type: "BINARY" }, tag: "mm-recession" },
  { venue: "manifold", actionId: "mm_search_markets", params: { term: "ethereum ETH 2026", limit: 50, filter: "open", contract_type: "BINARY" }, tag: "mm-eth" },

  // Robinhood: search by keyword
  { venue: "robinhood", actionId: "rh_get_markets", params: { limit: 50, live_only: true, category: "Politics" }, tag: "rh-politics" },
  { venue: "robinhood", actionId: "rh_get_markets", params: { limit: 50, live_only: true, search: "Fed rate" }, tag: "rh-fed" },
  { venue: "robinhood", actionId: "rh_get_markets", params: { limit: 50, live_only: true, search: "bitcoin" }, tag: "rh-btc" },
  { venue: "robinhood", actionId: "rh_get_markets", params: { limit: 50, live_only: true, search: "recession" }, tag: "rh-recession" },
] as const;

type Normalizer = (r: any) => NormalizedMarket[];
const NORMALIZERS: Record<string, Normalizer> = {
  kalshi: (r) => {
    // kl_series_list returns series, not events — skip normalizing series
    if (r?.series) { console.log("  (series list — logging tickers only)"); r.series.slice(0,5).forEach((s: any) => console.log("   ", s.ticker, s.title)); return []; }
    return normalizeKalshi(r);
  },
  polymarket: normalizePolymarket,
  manifold: normalizeManifold,
  robinhood: normalizeRobinhood,
};

async function main() {
  const allMarkets: NormalizedMarket[] = [];
  const seen = new Set<string>();

  // Submit in small batches of 4 to respect rate limits
  const batchSize = 4;
  for (let i = 0; i < SEARCHES.length; i += batchSize) {
    const batch = SEARCHES.slice(i, i + batchSize);
    console.log(`\n--- Submitting batch ${Math.floor(i/batchSize)+1}/${Math.ceil(SEARCHES.length/batchSize)} ---`);

    const submitted: Array<{ tag: string; venue: string; jobId: string }> = [];
    for (const s of batch) {
      try {
        await new Promise(r => setTimeout(r, 500));
        const jobId = await submitTask(s.actionId, s.params as Record<string, unknown>);
        submitted.push({ tag: s.tag, venue: s.venue, jobId });
        console.log(`  submitted ${s.tag} job=${jobId}`);
      } catch (e) {
        console.error(`  failed ${s.tag}: ${e}`);
      }
    }

    // Poll all in parallel
    await Promise.all(submitted.map(async ({ tag, venue, jobId }) => {
      try {
        const raw = await pollJob(jobId);
        const payload = (raw as any)?.data ?? raw;
        const markets = NORMALIZERS[venue](payload);
        let newCount = 0;
        for (const m of markets) {
          const key = `${m.venue}:${m.venueMarketId}`;
          if (!seen.has(key)) { seen.add(key); allMarkets.push(m); newCount++; }
        }
        console.log(`  [done] ${tag}: ${markets.length} normalized, ${newCount} new`);
      } catch (e) {
        console.error(`  [fail] ${tag}: ${e}`);
      }
    }));
  }

  // Upsert all to DB
  if (allMarkets.length > 0) {
    const { prisma } = require("../lib/db");
    for (const m of allMarkets) {
      await prisma.market.upsert({
        where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
        update: { title: m.title, outcomesJson: JSON.stringify(m.outcomes), closeTime: m.closeTime, liquidity: m.liquidity, snapshotAt: new Date(), url: m.url },
        create: { venue: m.venue, venueMarketId: m.venueMarketId, title: m.title, outcomesJson: JSON.stringify(m.outcomes), closeTime: m.closeTime, liquidity: m.liquidity, url: m.url },
      });
    }
    console.log(`\nUpserted ${allMarkets.length} targeted markets.`);
  }

  // Summary by venue
  const byVenue: Record<string, number> = {};
  for (const m of allMarkets) byVenue[m.venue] = (byVenue[m.venue]||0)+1;
  console.log("\nTargeted markets by venue:");
  Object.entries(byVenue).forEach(([v,c]) => console.log(`  ${v}: ${c}`));

  // Total DB count
  const { prisma } = require("../lib/db");
  const total = await prisma.market.count();
  const byV = await prisma.market.groupBy({ by: ["venue"], _count: { id: true } });
  console.log("\nDB totals after targeted ingest:");
  byV.forEach((v: any) => console.log(`  ${v.venue}: ${v._count.id}`));
  console.log(`  TOTAL: ${total}`);
}

main().catch(e => { console.error(e); process.exit(1); });
