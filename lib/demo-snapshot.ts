/**
 * Static DEMO_MODE snapshot — served when DEMO_MODE=true.
 *
 * This is a hardcoded, clearly-labeled illustrative snapshot so the deployed
 * board is never empty even on serverless (where SQLite is ephemeral).
 * The UI labels this "SAMPLE SNAPSHOT — not live" via the isDemo flag.
 *
 * Numbers mirror realistic real-money spreads observed during development.
 * NEVER presented as live data.
 */
import type { RankedGroup } from "./match";

export const DEMO_GROUPS: RankedGroup[] = [
  {
    id: "demo-mg-recession",
    label: "US Recession in 2026",
    markets: [
      {
        venue: "kalshi",
        title: "Will the US enter a recession in 2026?",
        url: "https://kalshi.com/markets/KXRECESSION-26",
        outcomes: [
          { name: "Yes", impliedProb: 0.32 },
          { name: "No", impliedProb: 0.68 },
        ],
        liquidity: 190000,
        isPlayMoney: false,
      },
      {
        venue: "polymarket",
        title: "US recession in 2026?",
        url: "https://polymarket.com/event/us-recession-in-2026",
        outcomes: [
          { name: "Yes", impliedProb: 0.24 },
          { name: "No", impliedProb: 0.76 },
        ],
        liquidity: 340000,
        isPlayMoney: false,
      },
      {
        venue: "manifold",
        title: "Will there be a US recession in 2026?",
        url: "https://manifold.markets/demo/us-recession-2026",
        outcomes: [
          { name: "Yes", impliedProb: 0.35 },
          { name: "No", impliedProb: 0.65 },
        ],
        liquidity: 8500,
        isPlayMoney: true,
      },
    ],
    maxSpread: 11,
    realMoneySpread: 8,
    tier: 1 as const,
    category: "econ",
    spreadDetails: [
      { venueA: "kalshi", venueB: "polymarket", outcomeName: "Yes", probA: 0.32, probB: 0.24, spreadPts: 8 },
    ],
    matchConfidence: 0.88,
    notedDifferences: [
      "Kalshi resolves on 2 consecutive negative GDP quarters; Polymarket uses NBER official declaration (can lag 12-18 months)",
      "Manifold liquidity is Mana (play money) — shown as crowd sentiment only, excluded from spread",
    ],
  },
  {
    id: "demo-mg-fed-june",
    label: "Fed Rate Cut — June 2026 FOMC",
    markets: [
      {
        venue: "kalshi",
        title: "Will the Fed cut rates at the June 2026 FOMC meeting?",
        url: "https://kalshi.com/markets/KXFED-26JUN",
        outcomes: [
          { name: "Yes", impliedProb: 0.62 },
          { name: "No", impliedProb: 0.38 },
        ],
        liquidity: 420000,
        isPlayMoney: false,
      },
      {
        venue: "robinhood",
        title: "Fed Rate Cut — June 2026 FOMC Meeting",
        url: "https://robinhood.com/predictions/events/fed-decision-in-jun-2026-jun-17-2026",
        outcomes: [
          { name: "Cut", impliedProb: 0.56 },
          { name: "Hold", impliedProb: 0.44 },
        ],
        liquidity: 95000,
        isPlayMoney: false,
      },
    ],
    maxSpread: 6,
    realMoneySpread: 6,
    tier: 1 as const,
    category: "econ",
    spreadDetails: [
      { venueA: "kalshi", venueB: "robinhood", outcomeName: "Yes", probA: 0.62, probB: 0.56, spreadPts: 6 },
    ],
    matchConfidence: 0.93,
    notedDifferences: [
      "Robinhood outcome is 'Cut/Hold/Hike' (3-way) vs Kalshi binary Yes/No for a cut",
      "Both resolve on the same FOMC decision date (June 17, 2026)",
    ],
  },
  {
    id: "demo-mg-btc-150k",
    label: "Will BTC reach $150k by end of 2026?",
    markets: [
      {
        venue: "polymarket",
        title: "Will BTC reach $150,000 before Jan 1, 2027?",
        url: "https://polymarket.com/event/will-btc-reach-150k-before-jan-1-2027",
        outcomes: [
          { name: "Yes", impliedProb: 0.41 },
          { name: "No", impliedProb: 0.59 },
        ],
        liquidity: 512000,
        isPlayMoney: false,
      },
      {
        venue: "kalshi",
        title: "Will Bitcoin reach $150,000 by December 31, 2026?",
        url: "https://kalshi.com/markets/KXBTC-26DEC31-150K",
        outcomes: [
          { name: "Yes", impliedProb: 0.39 },
          { name: "No", impliedProb: 0.61 },
        ],
        liquidity: 280000,
        isPlayMoney: false,
      },
      {
        venue: "manifold",
        title: "Will Bitcoin hit $150k before 2027?",
        url: "https://manifold.markets/demo/bitcoin-150k-2026",
        outcomes: [
          { name: "Yes", impliedProb: 0.50 },
          { name: "No", impliedProb: 0.50 },
        ],
        liquidity: 18000,
        isPlayMoney: true,
      },
    ],
    maxSpread: 11,
    realMoneySpread: 2,
    tier: 1 as const,
    category: "crypto",
    spreadDetails: [
      { venueA: "polymarket", venueB: "kalshi", outcomeName: "Yes", probA: 0.41, probB: 0.39, spreadPts: 2 },
    ],
    matchConfidence: 0.91,
    notedDifferences: [
      "Resolution dates differ: Kalshi closes Dec 31 at 20:00 UTC vs Polymarket at 23:59 UTC",
      "Manifold liquidity is Mana (play money) — shown as crowd sentiment only, excluded from spread",
    ],
  },
];
