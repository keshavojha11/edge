/**
 * DEMO_MODE seed — realistic multi-venue mispricing snapshot.
 *
 * Run: npm run db:seed
 *
 * Data is modelled on real market structures observed in Phase 1 discovery.
 * Probabilities are plausible but illustrative — not financial advice.
 */
import "dotenv/config";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("../lib/db");

const NOW = new Date();
const snap = () => NOW;

// ─── Markets ──────────────────────────────────────────────────────────────────

const MARKETS = [
  // ── BTC $150k: the hero spread (9 pts Polymarket vs Manifold) ────────────
  {
    venue: "polymarket",
    venueMarketId: "demo-btc-150k-pm",
    title: "Will BTC reach $150,000 before Jan 1, 2027?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.41 },
      { name: "No", impliedProb: 0.59 },
    ]),
    closeTime: new Date("2026-12-31T23:59:00Z"),
    liquidity: 512000,
    url: "https://polymarket.com/event/will-btc-reach-150k-before-jan-1-2027",
    snapshotAt: snap(),
  },
  {
    venue: "manifold",
    venueMarketId: "demo-btc-150k-mm",
    title: "Will Bitcoin hit $150k before 2027?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.50 },
      { name: "No", impliedProb: 0.50 },
    ]),
    closeTime: new Date("2027-01-01T00:00:00Z"),
    liquidity: 18000, // Mana
    url: "https://manifold.markets/demo/will-bitcoin-hit-150k-before-2027",
    snapshotAt: snap(),
  },
  {
    venue: "kalshi",
    venueMarketId: "KXBTC-26DEC31-150K",
    title: "Will Bitcoin reach $150,000 by December 31, 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.39 },
      { name: "No", impliedProb: 0.61 },
    ]),
    closeTime: new Date("2026-12-31T20:00:00Z"),
    liquidity: 280000,
    url: "https://kalshi.com/markets/KXBTC-26DEC31-150K",
    snapshotAt: snap(),
  },

  // ── US Recession 2026: 8-pt spread (Kalshi vs Polymarket) ───────────────
  {
    venue: "kalshi",
    venueMarketId: "KXRECESSION-26",
    title: "Will the US enter a recession in 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.32 },
      { name: "No", impliedProb: 0.68 },
    ]),
    closeTime: new Date("2026-12-31T20:00:00Z"),
    liquidity: 190000,
    url: "https://kalshi.com/markets/KXRECESSION-26",
    snapshotAt: snap(),
  },
  {
    venue: "polymarket",
    venueMarketId: "demo-recession-26-pm",
    title: "US recession in 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.24 },
      { name: "No", impliedProb: 0.76 },
    ]),
    closeTime: new Date("2026-12-31T23:59:00Z"),
    liquidity: 340000,
    url: "https://polymarket.com/event/us-recession-in-2026",
    snapshotAt: snap(),
  },
  {
    venue: "manifold",
    venueMarketId: "demo-recession-26-mm",
    title: "Will there be a US recession in 2026?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.35 },
      { name: "No", impliedProb: 0.65 },
    ]),
    closeTime: new Date("2027-01-01T00:00:00Z"),
    liquidity: 8500,
    url: "https://manifold.markets/demo/will-there-be-a-us-recession-in-2026",
    snapshotAt: snap(),
  },

  // ── Fed rate cut June 2026: 6-pt spread (Kalshi vs Robinhood) ──────────
  {
    venue: "kalshi",
    venueMarketId: "KXFEDRATE-26JUN",
    title: "Will the Fed cut rates at the June 2026 meeting?",
    outcomesJson: JSON.stringify([
      { name: "Yes", impliedProb: 0.62 },
      { name: "No", impliedProb: 0.38 },
    ]),
    closeTime: new Date("2026-06-18T19:00:00Z"),
    liquidity: 420000,
    url: "https://kalshi.com/markets/KXFEDRATE-26JUN",
    snapshotAt: snap(),
  },
  {
    venue: "robinhood",
    venueMarketId: "demo-fed-june-26-rh",
    title: "Fed Rate Cut — June 2026 FOMC Meeting",
    outcomesJson: JSON.stringify([
      { name: "Cut", impliedProb: 0.56 },
      { name: "Hold", impliedProb: 0.44 },
    ]),
    closeTime: new Date("2026-06-18T19:00:00Z"),
    liquidity: 95000,
    url: "https://robinhood.com/predictions/events/fed-rate-cut-june-2026-fomc",
    snapshotAt: snap(),
  },
] satisfies Array<{
  venue: string;
  venueMarketId: string;
  title: string;
  outcomesJson: string;
  closeTime: Date;
  liquidity: number;
  url: string;
  snapshotAt: Date;
}>;

// ─── Match groups ─────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding DEMO_MODE data...");

  // Upsert markets
  const ids: Record<string, string> = {};
  for (const m of MARKETS) {
    const rec = await prisma.market.upsert({
      where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      update: { ...m },
      create: { ...m },
    });
    ids[m.venueMarketId] = rec.id;
  }

  // Match group 1: BTC $150k — hero spread
  const btcIds = [
    ids["demo-btc-150k-pm"],
    ids["demo-btc-150k-mm"],
    ids["KXBTC-26DEC31-150K"],
  ].filter(Boolean);

  await prisma.matchGroup.upsert({
    where: { id: "demo-mg-btc-150k" },
    update: {
      label: "Will BTC reach $150k by end of 2026?",
      marketIds: JSON.stringify(btcIds),
      matchConfidence: 0.91,
      notedDifferences: JSON.stringify([
        "Resolution dates differ by 1 day (Kalshi Dec 31 20:00 UTC vs Polymarket Dec 31 23:59 UTC)",
        "Manifold liquidity is Mana (play money) — not comparable to USD",
        "Kalshi/Polymarket use USD settlement; Manifold uses Mana",
      ]),
      maxSpread: 11,
    },
    create: {
      id: "demo-mg-btc-150k",
      label: "Will BTC reach $150k by end of 2026?",
      marketIds: JSON.stringify(btcIds),
      matchConfidence: 0.91,
      notedDifferences: JSON.stringify([
        "Resolution dates differ by 1 day (Kalshi Dec 31 20:00 UTC vs Polymarket Dec 31 23:59 UTC)",
        "Manifold liquidity is Mana (play money) — not comparable to USD",
        "Kalshi/Polymarket use USD settlement; Manifold uses Mana",
      ]),
      maxSpread: 11,
    },
  });

  // Match group 2: US Recession 2026
  const recIds = [
    ids["KXRECESSION-26"],
    ids["demo-recession-26-pm"],
    ids["demo-recession-26-mm"],
  ].filter(Boolean);

  await prisma.matchGroup.upsert({
    where: { id: "demo-mg-recession" },
    update: {
      label: "US recession in 2026?",
      marketIds: JSON.stringify(recIds),
      matchConfidence: 0.85,
      notedDifferences: JSON.stringify([
        "Resolution criteria differ: Kalshi requires 2 consecutive negative GDP quarters; Polymarket uses NBER official declaration",
        "Manifold closes Jan 1 2027 vs Kalshi/Polymarket Dec 31 2026",
        "Manifold liquidity is Mana",
      ]),
      maxSpread: 11,
    },
    create: {
      id: "demo-mg-recession",
      label: "US recession in 2026?",
      marketIds: JSON.stringify(recIds),
      matchConfidence: 0.85,
      notedDifferences: JSON.stringify([
        "Resolution criteria differ: Kalshi requires 2 consecutive negative GDP quarters; Polymarket uses NBER official declaration",
        "Manifold closes Jan 1 2027 vs Kalshi/Polymarket Dec 31 2026",
        "Manifold liquidity is Mana",
      ]),
      maxSpread: 11,
    },
  });

  // Match group 3: Fed June 2026
  const fedIds = [ids["KXFEDRATE-26JUN"], ids["demo-fed-june-26-rh"]].filter(Boolean);

  await prisma.matchGroup.upsert({
    where: { id: "demo-mg-fed-june" },
    update: {
      label: "Fed rate cut at June 2026 FOMC?",
      marketIds: JSON.stringify(fedIds),
      matchConfidence: 0.93,
      notedDifferences: JSON.stringify([
        "Robinhood contract has 3 outcomes (Cut / Hold / Hike) vs Kalshi binary Yes/No",
        "Both resolve on the same FOMC decision date (June 18 2026)",
      ]),
      maxSpread: 6,
    },
    create: {
      id: "demo-mg-fed-june",
      label: "Fed rate cut at June 2026 FOMC?",
      marketIds: JSON.stringify(fedIds),
      matchConfidence: 0.93,
      notedDifferences: JSON.stringify([
        "Robinhood contract has 3 outcomes (Cut / Hold / Hike) vs Kalshi binary Yes/No",
        "Both resolve on the same FOMC decision date (June 18 2026)",
      ]),
      maxSpread: 6,
    },
  });

  console.log("Seed complete. Match groups: 3, Markets:", MARKETS.length);
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
