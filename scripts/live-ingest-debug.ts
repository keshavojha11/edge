import "dotenv/config";
import { submitTask, pollJob } from "../lib/wire";
import { normalizeKalshi } from "../lib/normalize/kalshi";
import { normalizePolymarket } from "../lib/normalize/polymarket";
import { normalizeManifold } from "../lib/normalize/manifold";
import { normalizeRobinhood } from "../lib/normalize/robinhood";
import type { NormalizedMarket } from "../lib/normalize/types";

const JOBS = [
  { venue: "kalshi",     actionId: "kl_events",     params: { limit: 50, status: "open", with_nested_markets: true } },
  { venue: "polymarket", actionId: "pm_get_markets", params: { limit: 50, closed: false, order: "liquidity" } },
  { venue: "manifold",   actionId: "mm_markets",     params: { limit: 100 } },
  { venue: "robinhood",  actionId: "rh_get_markets", params: { limit: 50, live_only: true } },
];

type Normalizer = (r: any) => NormalizedMarket[];
const NORMALIZERS: Record<string, Normalizer> = {
  kalshi:     normalizeKalshi,
  polymarket: normalizePolymarket,
  manifold:   normalizeManifold,
  robinhood:  normalizeRobinhood,
};

async function main() {
  console.log("Submitting all 4 Wire jobs...");
  const submitted: Array<{ venue: string; jobId: string }> = [];

  for (let i = 0; i < JOBS.length; i++) {
    if (i > 0) await sleep(600);
    const { venue, actionId, params } = JOBS[i];
    const jobId = await submitTask(actionId, params);
    submitted.push({ venue, jobId });
    console.log(`  ${venue}: job=${jobId}`);
  }

  console.log("\nPolling (each job ~2min)...");
  const results: Record<string, any> = {};

  await Promise.all(submitted.map(async ({ venue, jobId }) => {
    try {
      const raw = await pollJob(jobId);
      results[venue] = raw;
      console.log(`  [done] ${venue}`);
    } catch (e) {
      console.error(`  [fail] ${venue}: ${e}`);
      results[venue] = null;
    }
  }));

  console.log("\n" + "=".repeat(70));
  console.log("RAW RESPONSE INSPECTION + NORMALIZATION");
  console.log("=".repeat(70));

  const allMarkets: NormalizedMarket[] = [];

  for (const { venue } of JOBS) {
    console.log(`\n--- ${venue.toUpperCase()} ---`);
    const raw = results[venue];

    if (!raw) { console.log("  FAILED — no result"); continue; }

    // Log the raw payload shape
    const payload = (raw as any)?.data ?? raw;
    const keys = Object.keys(payload || {});
    console.log(`  payload keys: ${keys.join(", ")}`);

    // Find the list
    const list = payload?.events ?? payload?.markets ?? [];
    console.log(`  raw top-level items: ${list.length}`);

    // Log first item
    if (list.length > 0) {
      const first = list[0];
      console.log(`  first item keys: ${Object.keys(first).join(", ")}`);

      // For Kalshi, log first nested market too
      if (venue === "kalshi" && first.markets?.length > 0) {
        const fm = first.markets[0];
        console.log(`  first market keys: ${Object.keys(fm).join(", ")}`);
        console.log(`  sample: title="${fm.title}" yes_ask="${fm.yes_ask_dollars}" yes_bid="${fm.yes_bid_dollars}" status="${fm.status}" type="${fm.market_type}"`);
      }
      // For Robinhood, log first contract
      if (venue === "robinhood" && first.contracts?.length > 0) {
        const fc = first.contracts[0];
        console.log(`  first contract: name="${fc.name}" yes_bid=${fc.yes_bid} yes_ask=${fc.yes_ask} tradability="${fc.tradability}"`);
      }
      // For Polymarket
      if (venue === "polymarket") {
        console.log(`  sample: q="${first.question?.slice(0,60)}" outcomes=${JSON.stringify(first.outcome_prices)} liquidity=${first.liquidity}`);
      }
      // For Manifold
      if (venue === "manifold") {
        console.log(`  sample: q="${first.question?.slice(0,60)}" prob=${first.probability} type="${first.outcomeType}"`);
      }
    }

    // Normalize
    let markets: NormalizedMarket[] = [];
    try {
      markets = NORMALIZERS[venue](payload);
      console.log(`  normalized: ${markets.length} markets`);
      if (markets.length > 0) {
        const m = markets[0];
        console.log(`  first normalized: "${m.title.slice(0,60)}" yes=${(m.outcomes[0]?.impliedProb*100).toFixed(1)}%`);
      } else {
        console.log("  ⚠ EMPTY after normalization — need to inspect filters");
        // Show what got filtered
        if (venue === "manifold") {
          const allItems = payload?.markets ?? [];
          const types = allItems.reduce((acc: any, m: any) => {
            acc[m.outcomeType] = (acc[m.outcomeType] || 0) + 1;
            return acc;
          }, {});
          console.log(`  manifold outcomeTypes: ${JSON.stringify(types)}`);
          const binaries = allItems.filter((m: any) => m.outcomeType === "BINARY");
          console.log(`  BINARY markets: ${binaries.length}`);
          const withProb = binaries.filter((m: any) => m.probability != null);
          console.log(`  BINARY with probability: ${withProb.length}`);
        }
        if (venue === "kalshi") {
          const events = payload?.events ?? [];
          for (const ev of events.slice(0, 3)) {
            for (const m of ev.markets ?? []) {
              console.log(`    kalshi filter: type=${m.market_type} status=${m.status} yes_bid=${m.yes_bid_dollars} yes_ask=${m.yes_ask_dollars}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ normalizer threw: ${err}`);
    }

    allMarkets.push(...markets);
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  const byVenue: Record<string, number> = {};
  for (const m of allMarkets) byVenue[m.venue] = (byVenue[m.venue] || 0) + 1;
  for (const [v, c] of Object.entries(byVenue)) console.log(`  ${v}: ${c} markets`);
  console.log(`  TOTAL: ${allMarkets.length} markets`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error(e); process.exit(1); });
