import type { NormalizedMarket } from "./types";

interface RobinhoodContract {
  id: string;
  symbol: string;
  name: string;
  yes_bid: number;
  yes_ask: number;
  expiration_date: string;
  open_interest: string;
  tradability: string;
}

interface RobinhoodEvent {
  id: string;
  slug: string;
  name: string;
  state: string;
  contracts: RobinhoodContract[];
  total_open_interest: string;
}

// Wire envelope already unwrapped by ingest.ts — raw is { count, events, ... }
interface RobinhoodPayload {
  events?: RobinhoodEvent[];
  [k: string]: unknown;
}

export function normalizeRobinhood(raw: RobinhoodPayload): NormalizedMarket[] {
  const events = raw?.events ?? [];
  const out: NormalizedMarket[] = [];

  for (const event of events) {
    if (event.state !== "ARSENAL_EVENT_STATE_ACTIVE") continue;

    const tradable = (event.contracts ?? []).filter(
      (c) => c.tradability === "EVENT_CONTRACT_TRADABILITY_TRADABLE"
    );
    if (tradable.length < 2) continue;

    const outcomes = tradable.map((c) => ({
      name: c.name,
      impliedProb: (c.yes_bid + c.yes_ask) / 2,
    }));

    // For winner-takes-all multi-outcome markets probs sum to ~1.
    // For independent player/prop markets they may not — skip those.
    const totalProb = outcomes.reduce((s, o) => s + o.impliedProb, 0);
    if (totalProb < 0.5 || totalProb > 2.0) continue;

    const firstContract = tradable[0];
    const openInterest = parseInt(event.total_open_interest ?? "0") / 100;

    out.push({
      venue: "robinhood",
      venueMarketId: event.id,
      title: event.name,
      outcomes,
      closeTime: firstContract?.expiration_date
        ? new Date(firstContract.expiration_date)
        : null,
      liquidity: openInterest > 0 ? openInterest : null,
      url: `https://robinhood.com/predictions/events/${event.slug}`,
    });
  }

  return out;
}
