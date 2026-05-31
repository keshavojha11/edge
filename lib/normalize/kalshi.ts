import type { NormalizedMarket } from "./types";

interface KalshiMarket {
  ticker: string;
  title: string;
  yes_ask_dollars: string;
  yes_bid_dollars: string;
  no_ask_dollars?: string;
  no_bid_dollars?: string;
  last_price_dollars: string;
  liquidity_dollars: string;
  close_time: string;
  status: string;
  market_type: string;
}

interface KalshiEvent {
  event_ticker: string;
  title: string;
  markets: KalshiMarket[];
}

// Wire envelope already unwrapped by ingest.ts — raw is { count, events, ... }
interface KalshiEventsPayload {
  events?: KalshiEvent[];
  [k: string]: unknown;
}

export function normalizeKalshi(raw: KalshiEventsPayload): NormalizedMarket[] {
  const events = raw?.events ?? [];
  const out: NormalizedMarket[] = [];

  for (const event of events) {
    for (const m of event.markets ?? []) {
      if (m.market_type !== "binary") continue;
      if (m.status !== "active") continue;

      const bid = parseFloat(m.yes_bid_dollars ?? "0");
      const ask = parseFloat(m.yes_ask_dollars ?? m.last_price_dollars ?? "0");
      const yesMid = ask > 0 ? (bid + ask) / 2 : parseFloat(m.last_price_dollars ?? "0");

      if (yesMid <= 0 || yesMid >= 1) continue;

      out.push({
        venue: "kalshi",
        venueMarketId: m.ticker,
        title: m.title || event.title,
        outcomes: [
          { name: "Yes", impliedProb: yesMid },
          { name: "No", impliedProb: 1 - yesMid },
        ],
        closeTime: m.close_time ? new Date(m.close_time) : null,
        liquidity: parseFloat(m.liquidity_dollars ?? "0") || null,
        isPlayMoney: false,
        url: `https://kalshi.com/markets/${m.ticker}`,
      });
    }
  }

  return out;
}
