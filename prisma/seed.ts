/**
 * DEMO_MODE seed — defensible real-money spreads, curated snapshot.
 *
 * ALL markets use "demo-" venueMarketId prefix so they are:
 *   - Never overwritten by live Wire ingest (upsert key = venue+venueMarketId)
 *   - Cleanly identifiable and filterable
 *   - Never mixed with live data (getRankedGroups filters by source)
 *
 * Rule: DEMO_MODE=true → serve seed only; DEMO_MODE=false → live only.
 *
 * Run: npm run db:seed
 */
import "dotenv/config";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("../lib/db");

const NOW = new Date();

// ─── Markets ──────────────────────────────────────────────────────────────────
// All venueMarketId values use the "demo-" prefix so live ingest never touches them.

const MARKETS = [
  // ── US Recession 2026 — HERO (8pt real-money spread) ─────────────────────
  {
    venue: "kalshi",
    venueMarketId: "demo-kl-recession-26",
    title: "Will the US enter a recession in 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.32 },
      { name: "No",  impliedProb: 0.68 },
    ]),
    closeTime: new Date("2026-12-31T20:00:00Z"),
    liquidity: 190000,
    isPlayMoney: false,
    url: "https://kalshi.com/markets/KXRECESSION-26",
    snapshotAt: NOW,
  },
  {
    venue: "polymarket",
    venueMarketId: "demo-pm-recession-26",
    title: "US recession in 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.24 },
      { name: "No",  impliedProb: 0.76 },
    ]),
    closeTime: new Date("2026-12-31T23:59:00Z"),
    liquidity: 340000,
    isPlayMoney: false,
    url: "https://polymarket.com/event/us-recession-in-2026",
    snapshotAt: NOW,
  },
  {
    venue: "manifold",
    venueMarketId: "demo-mm-recession-26",
    title: "Will there be a US recession in 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.35 },
      { name: "No",  impliedProb: 0.65 },
    ]),
    closeTime: new Date("2027-01-01T00:00:00Z"),
    liquidity: 8500,
    isPlayMoney: true,
    url: "https://manifold.markets/demo/us-recession-2026",
    snapshotAt: NOW,
  },

  // ── Fed June 2026 FOMC — 6pt real-money spread (Kalshi vs Robinhood) ────
  {
    venue: "kalshi",
    venueMarketId: "demo-kl-fed-june-26",
    title: "Will the Fed cut rates at the June 2026 FOMC meeting?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.62 },
      { name: "No",  impliedProb: 0.38 },
    ]),
    closeTime: new Date("2026-06-18T19:00:00Z"),
    liquidity: 420000,
    isPlayMoney: false,
    url: "https://kalshi.com/markets/KXFEDRATE-26JUN",
    snapshotAt: NOW,
  },
  {
    venue: "robinhood",
    venueMarketId: "demo-rh-fed-june-26",
    title: "Fed Rate Cut — June 2026 FOMC Meeting",
    outcomesJson: JSON.stringify([
      { name: "Cut", impliedProb: 0.56 },
      { name: "Hold", impliedProb: 0.44 },
    ]),
    closeTime: new Date("2026-06-18T19:00:00Z"),
    liquidity: 95000,
    isPlayMoney: false,
    url: "https://robinhood.com/predictions/events/fed-rate-cut-june-2026-fomc",
    snapshotAt: NOW,
  },

  // ── BTC $150k — 2pt real-money spread (grey/demoted) ─────────────────────
  {
    venue: "polymarket",
    venueMarketId: "demo-pm-btc-150k",
    title: "Will BTC reach $150,000 before Jan 1, 2027?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.41 },
      { name: "No",  impliedProb: 0.59 },
    ]),
    closeTime: new Date("2026-12-31T23:59:00Z"),
    liquidity: 512000,
    isPlayMoney: false,
    url: "https://polymarket.com/event/will-btc-reach-150k-before-jan-1-2027",
    snapshotAt: NOW,
  },
  {
    venue: "kalshi",
    venueMarketId: "demo-kl-btc-150k",
    title: "Will Bitcoin reach $150,000 by December 31, 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.39 },
      { name: "No",  impliedProb: 0.61 },
    ]),
    closeTime: new Date("2026-12-31T20:00:00Z"),
    liquidity: 280000,
    isPlayMoney: false,
    url: "https://kalshi.com/markets/KXBTC-26DEC31-150K",
    snapshotAt: NOW,
  },
  {
    venue: "manifold",
    venueMarketId: "demo-mm-btc-150k",
    title: "Will Bitcoin hit $150k before 2027?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.50 },
      { name: "No",  impliedProb: 0.50 },
    ]),
    closeTime: new Date("2027-01-01T00:00:00Z"),
    liquidity: 18000,
    isPlayMoney: true,
    url: "https://manifold.markets/demo/bitcoin-150k-2026",
    snapshotAt: NOW,
  },
];

// ─── Match groups ─────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding DEMO_MODE data (all markets use demo- prefix)...");

  // Upsert markets
  const idMap: Record<string, string> = {};
  for (const m of MARKETS) {
    const rec = await prisma.market.upsert({
      where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      update: { ...m },
      create: { ...m },
    });
    idMap[m.venueMarketId] = rec.id;
  }

  const ids = (keys: string[]) => keys.map((k) => idMap[k]).filter(Boolean);

  // ── Recession — HERO (8pt Kalshi vs Polymarket, Manifold crowd sentiment)
  const recIds = ids(["demo-kl-recession-26", "demo-pm-recession-26", "demo-mm-recession-26"]);
  await prisma.matchGroup.upsert({
    where: { id: "demo-mg-recession" },
    update: {
      label: "US Recession in 2026",
      marketIds: JSON.stringify(recIds),
      matchConfidence: 0.88,
      notedDifferences: JSON.stringify([
        "Kalshi resolves on 2 consecutive negative GDP quarters; Polymarket uses NBER official declaration (can lag 12-18 months)",
        "Manifold liquidity is Mana (play money) — shown as crowd sentiment only, excluded from spread",
      ]),
      maxSpread: 11,
      realMoneySpread: 8,
    },
    create: {
      id: "demo-mg-recession",
      label: "US Recession in 2026",
      marketIds: JSON.stringify(recIds),
      matchConfidence: 0.88,
      notedDifferences: JSON.stringify([
        "Kalshi resolves on 2 consecutive negative GDP quarters; Polymarket uses NBER official declaration (can lag 12-18 months)",
        "Manifold liquidity is Mana (play money) — shown as crowd sentiment only, excluded from spread",
      ]),
      maxSpread: 11,
      realMoneySpread: 8,
    },
  });

  // ── Fed June FOMC — 6pt (Kalshi vs Robinhood, no Manifold)
  const fedIds = ids(["demo-kl-fed-june-26", "demo-rh-fed-june-26"]);
  await prisma.matchGroup.upsert({
    where: { id: "demo-mg-fed-june" },
    update: {
      label: "Fed Rate Cut — June 2026 FOMC",
      marketIds: JSON.stringify(fedIds),
      matchConfidence: 0.93,
      notedDifferences: JSON.stringify([
        "Robinhood outcome is 'Cut/Hold/Hike' (3-way) vs Kalshi binary Yes/No for a cut",
        "Both resolve on the same FOMC decision date (June 18, 2026)",
      ]),
      maxSpread: 6,
      realMoneySpread: 6,
    },
    create: {
      id: "demo-mg-fed-june",
      label: "Fed Rate Cut — June 2026 FOMC",
      marketIds: JSON.stringify(fedIds),
      matchConfidence: 0.93,
      notedDifferences: JSON.stringify([
        "Robinhood outcome is 'Cut/Hold/Hike' (3-way) vs Kalshi binary Yes/No for a cut",
        "Both resolve on the same FOMC decision date (June 18, 2026)",
      ]),
      maxSpread: 6,
      realMoneySpread: 6,
    },
  });

  // ── BTC $150k — 2pt real-money (grey badge), Manifold as crowd sentiment
  const btcIds = ids(["demo-pm-btc-150k", "demo-kl-btc-150k", "demo-mm-btc-150k"]);
  await prisma.matchGroup.upsert({
    where: { id: "demo-mg-btc-150k" },
    update: {
      label: "Will BTC reach $150k by end of 2026?",
      marketIds: JSON.stringify(btcIds),
      matchConfidence: 0.91,
      notedDifferences: JSON.stringify([
        "Resolution dates differ: Kalshi closes Dec 31 at 20:00 UTC vs Polymarket at 23:59 UTC",
        "Manifold liquidity is Mana (play money) — shown as crowd sentiment only, excluded from spread",
      ]),
      maxSpread: 11,
      realMoneySpread: 2,
    },
    create: {
      id: "demo-mg-btc-150k",
      label: "Will BTC reach $150k by end of 2026?",
      marketIds: JSON.stringify(btcIds),
      matchConfidence: 0.91,
      notedDifferences: JSON.stringify([
        "Resolution dates differ: Kalshi closes Dec 31 at 20:00 UTC vs Polymarket at 23:59 UTC",
        "Manifold liquidity is Mana (play money) — shown as crowd sentiment only, excluded from spread",
      ]),
      maxSpread: 11,
      realMoneySpread: 2,
    },
  });

  const mCount = await prisma.market.count({ where: { venueMarketId: { startsWith: "demo-" } } });
  const gCount = await prisma.matchGroup.count({ where: { id: { startsWith: "demo-" } } });
  console.log(`Seed complete. Demo markets: ${mCount}, demo groups: ${gCount}`);
  console.log("\nDEMO board preview (sorted by realMoneySpread desc):");
  console.log("  [1] demo-mg-recession  8.0pt AMBER-FULL  Kalshi 32% vs Polymarket 24%");
  console.log("  [2] demo-mg-fed-june   6.0pt AMBER-DIM   Kalshi 62% vs Robinhood 56%");
  console.log("  [3] demo-mg-btc-150k   2.0pt GREY-WEAK   Polymarket 41% vs Kalshi 39%");
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
