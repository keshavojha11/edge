export interface MarketOutcome {
  name: string;
  impliedProb: number; // 0.0–1.0
}

export const PLAY_MONEY_VENUES: ReadonlySet<string> = new Set(["manifold"]);

export interface NormalizedMarket {
  venue: "kalshi" | "polymarket" | "manifold" | "robinhood";
  venueMarketId: string;
  title: string;
  outcomes: MarketOutcome[];
  closeTime: Date | null;
  liquidity: number | null; // USD; Manifold is Mana — see liquidityNote
  liquidityNote?: string;
  isPlayMoney: boolean;      // true = Mana/play currency; exclude from headline spread
  url: string;
}
