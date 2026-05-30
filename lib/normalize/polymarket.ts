import type { NormalizedMarket } from "./types";

interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcome_prices: number[];
  liquidity: number;
  end_date: string | null;
  active: boolean;
  closed: boolean;
}

interface PolymarketPayload {
  data: {
    markets: PolymarketMarket[];
  };
}

export function normalizePolymarket(raw: PolymarketPayload): NormalizedMarket[] {
  const markets = raw?.data?.markets ?? [];
  const out: NormalizedMarket[] = [];

  for (const m of markets) {
    if (!m.active || m.closed) continue;
    if (!m.outcomes?.length || !m.outcome_prices?.length) continue;

    const outcomes = m.outcomes.map((name, i) => ({
      name,
      impliedProb: Number(m.outcome_prices[i]) ?? 0,
    }));

    // Sanity check: at least one outcome has a non-trivial probability
    if (!outcomes.some((o) => o.impliedProb > 0.01 && o.impliedProb < 0.99)) continue;

    out.push({
      venue: "polymarket",
      venueMarketId: m.id,
      title: m.question,
      outcomes,
      closeTime: m.end_date ? new Date(m.end_date) : null,
      liquidity: m.liquidity ?? null,
      url: `https://polymarket.com/event/${m.slug}`,
    });
  }

  return out;
}
