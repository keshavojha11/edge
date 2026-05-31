import { jsonChat } from "./llm";
import type { NormalizedMarket } from "./normalize/types";

export interface MatchedGroup {
  label: string;
  markets: NormalizedMarket[];
  matchConfidence: number; // 0–1
  notedDifferences: string[];
  maxSpread: number;       // percentage points, all venues
  realMoneySpread: number; // percentage points, real-money venues only (ranking key)
  spreadDetails: SpreadDetail[];
}

export interface SpreadDetail {
  venueA: string;
  venueB: string;
  outcomeName: string;
  probA: number;
  probB: number;
  spreadPts: number; // |probA - probB| * 100
}

// ─── LLM matching ─────────────────────────────────────────────────────────────

interface LLMMatchResult {
  groups: Array<{
    label: string;
    marketIndices: number[];
    confidence: number;
    notedDifferences: string[];
  }>;
}

const MATCH_SYSTEM = `You are a prediction-market analyst. Given a list of markets from multiple venues,
identify groups of markets that are asking about the SAME real-world event with SIMILAR resolution criteria.

Rules:
- Only group markets that are genuinely asking the same question
- Note differences in resolution criteria, dates, and scope
- Binary (Yes/No) markets may match multi-outcome markets if one outcome is equivalent
- Confidence: 0.9+ = nearly identical, 0.7-0.9 = same event different wording, below 0.7 = uncertain
- Do NOT group markets about different dates even if same topic

Return ONLY valid JSON, no markdown:
{
  "groups": [
    {
      "label": "Short human-readable label for the event",
      "marketIndices": [0, 2, 5],
      "confidence": 0.92,
      "notedDifferences": ["Resolution dates differ by 1 day", "Kalshi requires NBER declaration; Polymarket does not"]
    }
  ]
}

Only include groups with 2+ markets from different venues. Skip singletons.`;

export async function matchMarkets(
  markets: NormalizedMarket[],
  opts: { batchSize?: number; perVenueCap?: number } = {}
): Promise<MatchedGroup[]> {
  if (markets.length === 0) return [];

  const batchSize = opts.batchSize ?? 60;
  const perVenueCap = opts.perVenueCap ?? 60;

  // Each batch must contain markets from multiple venues.
  // Strategy: cap per-venue (by liquidity desc), then interleave so
  // every batch has all venues represented.
  const byVenue: Record<string, NormalizedMarket[]> = {};
  for (const m of markets) {
    if (!byVenue[m.venue]) byVenue[m.venue] = [];
    byVenue[m.venue].push(m);
  }

  // Sort each venue's markets by liquidity desc, cap
  const capped: NormalizedMarket[][] = Object.values(byVenue).map((ms) =>
    ms
      .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
      .slice(0, perVenueCap)
  );

  // Interleave: take one from each venue in round-robin
  const interleaved: NormalizedMarket[] = [];
  const maxLen = Math.max(...capped.map((c) => c.length));
  for (let i = 0; i < maxLen; i++) {
    for (const venueMarkets of capped) {
      if (venueMarkets[i]) interleaved.push(venueMarkets[i]);
    }
  }

  // Chunk into batches — each chunk will have all venues mixed in
  const batches = chunkMarkets(interleaved, batchSize);
  console.log(`[match] ${interleaved.length} markets across ${capped.length} venues → ${batches.length} batch(es)`);

  const allGroups: MatchedGroup[] = [];
  for (const batch of batches) {
    const groups = await matchBatch(batch);
    allGroups.push(...groups);
  }

  return dedupeAndRank(allGroups);
}

async function matchBatch(markets: NormalizedMarket[]): Promise<MatchedGroup[]> {
  const marketList = markets
    .map(
      (m, i) =>
        `[${i}] ${m.venue.toUpperCase()} — ${m.title}` +
        ` | close: ${m.closeTime ? m.closeTime.toISOString().slice(0, 10) : "unknown"}` +
        ` | YES: ${(m.outcomes[0]?.impliedProb * 100).toFixed(1)}%`
    )
    .join("\n");

  let result: LLMMatchResult;
  try {
    result = await jsonChat<LLMMatchResult>(
      [
        { role: "system", content: MATCH_SYSTEM },
        {
          role: "user",
          content: `Match these ${markets.length} markets into groups:\n\n${marketList}`,
        },
      ],
      { maxTokens: 3000 }
    );
  } catch (err) {
    console.error("[match] LLM error:", err);
    return [];
  }

  const groups: MatchedGroup[] = [];

  for (const g of result.groups ?? []) {
    const groupMarkets = (g.marketIndices ?? [])
      .filter((i) => i >= 0 && i < markets.length)
      .map((i) => markets[i]);

    // Require at least 2 markets from distinct venues
    const venues = new Set(groupMarkets.map((m) => m.venue));
    if (venues.size < 2) continue;

    const spreadDetails = computeSpreads(groupMarkets);
    const maxSpread = spreadDetails.reduce((max, s) => Math.max(max, s.spreadPts), 0);
    // Headline spread: real-money venues only
    const realMoneySpread = computeRealMoneySpread(groupMarkets);

    groups.push({
      label: g.label,
      markets: groupMarkets,
      matchConfidence: g.confidence ?? 0.8,
      notedDifferences: g.notedDifferences ?? [],
      maxSpread,
      realMoneySpread,
      spreadDetails,
    });
  }

  return groups;
}

// ─── Spread computation ───────────────────────────────────────────────────────

export function computeRealMoneySpread(markets: NormalizedMarket[]): number {
  const realMoney = markets.filter((m) => !m.isPlayMoney);
  if (realMoney.length < 2) return 0;
  const details = computeSpreads(realMoney);
  return details.reduce((max, s) => Math.max(max, s.spreadPts), 0);
}

export function computeSpreads(markets: NormalizedMarket[]): SpreadDetail[] {
  const details: SpreadDetail[] = [];

  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const a = markets[i];
      const b = markets[j];

      // Find the "primary" outcome for each (first outcome — usually YES)
      const outcomeA = a.outcomes[0];
      const outcomeB = b.outcomes[0];

      if (!outcomeA || !outcomeB) continue;

      // Try to match outcomes by name
      const matchedB = b.outcomes.find(
        (o) =>
          o.name.toLowerCase() === outcomeA.name.toLowerCase() ||
          o.name.toLowerCase() === "yes"
      );

      const probB = matchedB?.impliedProb ?? outcomeB.impliedProb;
      const spreadPts = Math.abs(outcomeA.impliedProb - probB) * 100;

      details.push({
        venueA: a.venue,
        venueB: b.venue,
        outcomeName: outcomeA.name,
        probA: outcomeA.impliedProb,
        probB,
        spreadPts: Math.round(spreadPts * 10) / 10,
      });
    }
  }

  return details.sort((a, b) => b.spreadPts - a.spreadPts);
}

// ─── Persist match groups ─────────────────────────────────────────────────────

export async function persistMatchGroups(groups: MatchedGroup[]): Promise<void> {
  const { prisma } = await import("./db");

  for (const g of groups) {
    // Resolve DB market ids
    const dbIds: string[] = [];
    for (const m of g.markets) {
      const rec = await prisma.market.findUnique({
        where: { venue_venueMarketId: { venue: m.venue, venueMarketId: m.venueMarketId } },
      });
      if (rec) dbIds.push(rec.id);
    }
    if (dbIds.length < 2) continue;

    const key = dbIds.sort().join("|");

    await prisma.matchGroup.upsert({
      where: { id: key },
      update: {
        label: g.label,
        marketIds: JSON.stringify(dbIds),
        matchConfidence: g.matchConfidence,
        notedDifferences: JSON.stringify(g.notedDifferences),
        maxSpread: g.maxSpread,
        realMoneySpread: g.realMoneySpread,
      },
      create: {
        id: key,
        label: g.label,
        marketIds: JSON.stringify(dbIds),
        matchConfidence: g.matchConfidence,
        notedDifferences: JSON.stringify(g.notedDifferences),
        maxSpread: g.maxSpread,
        realMoneySpread: g.realMoneySpread,
      },
    });
  }
}

// ─── Ranked match groups for UI ───────────────────────────────────────────────

export interface RankedGroup {
  id: string;
  label: string;
  markets: Array<{
    venue: string;
    title: string;
    url: string;
    outcomes: Array<{ name: string; impliedProb: number }>;
    liquidity: number | null;
    liquidityNote?: string;
    isPlayMoney: boolean;
  }>;
  maxSpread: number;
  realMoneySpread: number; // headline figure — real-money venues only
  spreadDetails: SpreadDetail[];
  matchConfidence: number;
  notedDifferences: string[];
}

export async function getRankedGroups(): Promise<RankedGroup[]> {
  const { prisma } = await import("./db");

  // Sort by realMoneySpread so play-money-inflated spreads don't dominate
  const groups = await prisma.matchGroup.findMany({
    orderBy: { realMoneySpread: "desc" },
    take: 50,
  });

  const result: RankedGroup[] = [];

  for (const g of groups) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marketIds: string[] = JSON.parse(g.marketIds as any);
    const markets = await prisma.market.findMany({
      where: { id: { in: marketIds } },
    });

    if (markets.length < 2) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized: NormalizedMarket[] = markets.map((m: any) => ({
      venue: m.venue,
      venueMarketId: m.venueMarketId,
      title: m.title,
      outcomes: JSON.parse(m.outcomesJson),
      closeTime: m.closeTime,
      liquidity: m.liquidity,
      isPlayMoney: m.isPlayMoney ?? false,
      url: m.url,
    }));

    result.push({
      id: g.id,
      label: g.label,
      markets: normalized.map((m) => ({
        venue: m.venue,
        title: m.title,
        url: m.url,
        outcomes: m.outcomes,
        liquidity: m.liquidity,
        isPlayMoney: m.isPlayMoney,
      })),
      maxSpread: g.maxSpread,
      realMoneySpread: (g as any).realMoneySpread ?? 0,
      spreadDetails: computeSpreads(normalized),
      matchConfidence: g.matchConfidence,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notedDifferences: JSON.parse(g.notedDifferences as any),
    });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkMarkets(markets: NormalizedMarket[], size: number): NormalizedMarket[][] {
  const chunks: NormalizedMarket[][] = [];
  for (let i = 0; i < markets.length; i += size) {
    chunks.push(markets.slice(i, i + size));
  }
  return chunks;
}

function dedupeAndRank(groups: MatchedGroup[]): MatchedGroup[] {
  // Remove groups whose market set is a subset of a larger group
  const seen = new Set<string>();
  const deduped: MatchedGroup[] = [];

  for (const g of groups.sort((a, b) => b.maxSpread - a.maxSpread)) {
    const key = g.markets
      .map((m) => `${m.venue}:${m.venueMarketId}`)
      .sort()
      .join("|");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(g);
    }
  }

  return deduped;
}
