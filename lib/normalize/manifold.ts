import type { NormalizedMarket } from "./types";

interface ManifoldMarket {
  id: string;
  question: string;
  slug: string;
  url: string;
  probability?: number;
  closeTime?: number; // Unix ms
  totalLiquidity?: number; // Mana
  outcomeType: string;
  isResolved: boolean;
}

// Wire envelope already unwrapped by ingest.ts — raw is { count, markets, ... }
interface ManifoldPayload {
  markets?: ManifoldMarket[];
  [k: string]: unknown;
}

export function normalizeManifold(raw: ManifoldPayload): NormalizedMarket[] {
  const markets = raw?.markets ?? [];
  const out: NormalizedMarket[] = [];

  for (const m of markets) {
    if (m.isResolved) continue;
    // Only handle binary markets with a defined probability
    if (m.outcomeType !== "BINARY") continue;
    if (m.probability == null) continue;
    if (m.probability <= 0.01 || m.probability >= 0.99) continue;

    out.push({
      venue: "manifold",
      venueMarketId: m.id,
      title: m.question,
      outcomes: [
        { name: "Yes", impliedProb: m.probability },
        { name: "No", impliedProb: 1 - m.probability },
      ],
      closeTime: m.closeTime ? new Date(m.closeTime) : null,
      liquidity: m.totalLiquidity ?? null,
      liquidityNote: "Mana (play money, not USD)",
      url: m.url,
    });
  }

  return out;
}
