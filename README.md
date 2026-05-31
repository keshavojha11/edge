# Edge — Prediction Market Intelligence Terminal

> The internet's prediction markets, cross-checked for an edge.

Edge pulls live odds from Kalshi, Polymarket, Robinhood, and Manifold via Anakin Wire, uses an LLM to match the same real-world event across venues, and surfaces real-money mispricings — with resolution-difference caveats and an explicit play-money exclusion.

**Not financial advice.** Spreads are signals, not guaranteed risk-free arbitrage. Resolution criteria, dates, fees, and liquidity differ between venues.

**Live demo:** https://edge-eta.vercel.app (deployed in labeled SAMPLE SNAPSHOT mode; "Run live refresh" performs a real Wire ingest)

---

## Screenshots

The mispricings board — compact table, live spread ticker, green (cheaper) / red (richer) venue chips, amber spread badges:

![Edge board](docs/screenshots/board.png)

Expanded match group — per-venue odds, play-money "crowd sentiment" excluded from the spread, resolution-difference caveats:

![Edge card detail](docs/screenshots/card-detail.png)

---

## The problem

The same event — a Fed rate decision, a BTC price level, a US recession — trades at different implied probabilities on different prediction markets. Kalshi might price "4 Fed rate cuts in 2026" at 1%, while Robinhood's count-contract prices imply 8%. That 7-point gap is real and live. Edge finds those gaps automatically.

---

## How it works

```
DISCOVER ──► INGEST ──► NORMALIZE ──► MATCH (LLM) ──► COMPARE ──► SURFACE
                                                                      │
                                                              CHAT (NL query)
                                                              WATCH (alerts)
```

1. **Discover/Ingest** — Anakin Wire fetches live markets from all 4 venues. Two strategies:
   - Generic pull: top open markets per venue
   - Targeted pull: known cross-venue events fetched by slug/ID (Fed FOMC, rate cut counts, BTC levels)

2. **Normalize** — per-venue parsers map each response to a common shape: `{ venue, title, outcomes[{name, impliedProb}], closeTime, liquidity, isPlayMoney, url }`. Manifold is flagged `isPlayMoney=true` (Mana, not USD).

3. **Match (LLM)** — OpenRouter (Claude Sonnet 4.6) clusters semantically-equivalent markets across venues with confidence scores and noted differences. Hard guards reject same-venue pairs, per-game vs series mismatches, and low-confidence groups.

4. **Compare** — within each group, compute the real-money spread (Kalshi, Polymarket, Robinhood only). Manifold is shown as "crowd sentiment" and excluded from the headline badge.

5. **Surface** — ranked mispricings board with green/red directional coloring, live spread ticker, chat panel, watch/alert system.

---

## Venues & Wire actions used

| Venue | Wire action IDs |
|-------|----------------|
| Kalshi | `kl_events`, `kl_event_detail` |
| Polymarket | `pm_get_markets`, `pm_get_market` |
| Manifold | `mm_markets`, `mm_search_markets` |
| Robinhood | `rh_get_markets`, `rh_get_event`, `rh_get_categories` |

Targeted events tracked by slug/ID:
- `KXFED-26JUN` (Kalshi) — Fed June 2026 FOMC rate-level markets
- `fed-decision-in-jun-2026-jun-17-2026` (Robinhood) — Fed June cut/hold/hike
- `number-of-rate-cuts-in-2026-dec-31-2026` (Robinhood) — total 2026 cuts count (21 contracts → derived binary ≥4 cuts)
- Market ID `616906` (Polymarket) — "Will 4 Fed rate cuts happen in 2026?"

**Wire is the required sponsor technology.** All live market data routes through Wire Holocron actions.

---

## Service roles

| Service | Role |
|---------|------|
| **Anakin Wire (Holocron)** | ★ Star tech. All 4 venue pulls, all market prices |
| **OpenRouter** | LLM brain: market matching + NL chat synthesis |
| **Discord** | Webhook alerts when a watched spread crosses threshold |
| **Exa** | Optional supplementary news context (not core in this build) |

---

## Live vs sample data

Real-money cross-venue overlap is genuinely sparse and concentrated in large macro events — Fed decisions, elections, major crypto price levels. Exotic or short-term markets don't trade on multiple regulated venues simultaneously.

When `DEMO_MODE=true` (default on the deployed URL), the board shows a curated illustrative snapshot labeled **"SAMPLE SNAPSHOT — not live"**:
- **8.0pt AMBER** US Recession 2026 — Kalshi 32% vs Polymarket 24%
- **6.0pt AMBER** Fed Rate Cut June 2026 — Kalshi 62% vs Robinhood 56%
- **2.0pt GREY** BTC $150k by end 2026 — Polymarket 41% vs Kalshi 39%

A "Run live refresh" button triggers a real Wire ingest (~6 credits, ~2 minutes).

When `DEMO_MODE=false`, the board shows only live Wire data. At submission time, the live board shows:
- **7.5pt AMBER** "At least 4 Fed rate cuts in 2026": Polymarket 1.1% vs Robinhood-derived 8.7%

Manifold markets appear as "crowd sentiment" (grey, smaller, de-emphasized) and never drive the amber badge.

---

## Run locally

```bash
git clone https://github.com/keshavojha/edge
cd edge
npm install
cp .env.example .env
# Fill ANAKIN_API_KEY and OPENROUTER_API_KEY in .env
npx prisma migrate dev
npm run db:seed   # populate DEMO_MODE data
npm run dev       # http://localhost:3000
```

Live mode (uses Wire credits, ~2 min):
```bash
# Set DEMO_MODE=false in .env
curl -X POST http://localhost:3000/api/ingest?force=true
curl -X POST http://localhost:3000/api/match
```

---

## Deploy to Vercel

```bash
vercel --prod
```

Environment variables (Vercel dashboard):
```
ANAKIN_API_KEY=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
DATABASE_URL=postgres://...    # Vercel Postgres or Neon
DEMO_MODE=true                 # false for fully live board
DISCORD_WEBHOOK_URL=...        # optional: spread alerts
CRON_SECRET=...                # optional: secure the cron endpoint
```

---

## What "edge" means (and doesn't)

A spread between venues is a signal that the crowd disagrees. It is **not** necessarily a risk-free arbitrage. Common structural reasons for spreads:
- Resolution criteria differ (e.g. Kalshi "2 negative GDP quarters" vs Polymarket "NBER declaration")
- Close dates differ by days
- Different user bases have different priors
- Liquidity differences let prices drift

Edge surfaces the spread and flags likely reasons. It does not recommend trading.

**Not financial advice.**
