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
- Only group markets that are genuinely asking the same question about the SAME outcome scope
- SCOPE must match exactly: a series-winner market and a single-game winner market are DIFFERENT bets even for the same teams — do NOT group them
- Do NOT group per-game markets with series-outcome markets
- Do NOT group markets that resolve on different events (e.g. Game 1 vs Game 7 vs who wins the series)
- RESOLUTION must be compatible: close dates within ~30 days AND similar criteria
- A binary Yes/No market may match a single outcome of a multi-outcome market only if semantically equivalent
- Confidence: 0.9+ = nearly identical criteria and dates, 0.7-0.9 = same event minor wording difference, below 0.75 = do not output
- Only output groups with confidence >= 0.75
- When unsure whether two markets resolve on the same real-world outcome, omit the group

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

Only include groups with 2+ markets from DIFFERENT venues. Skip singletons. When uncertain, omit.`;

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

  // Title patterns that indicate non-matchable intraday/price-bracket markets.
  // These are Kalshi series like "ETH price at 12pm EDT?" — identical titles,
  // high liquidity, but no cross-venue equivalent. Deduplicate before capping.
  const SKIP_TITLE_RE =
    /price (range|at) |close (at|above|below) \$|above \$\d|below \$\d|Up or Down|at \d+(am|pm)|O\/U \d|Spread:|Handicap|first inning|first blood|halftime/i;

  const capped: NormalizedMarket[][] = Object.values(byVenue).map((ms) => {
    // 1. Filter out obvious price-bracket / intraday / sports prop markets
    const filtered = ms.filter((m) => !SKIP_TITLE_RE.test(m.title));

    // 2. Title-dedup: keep highest-liquidity market per normalised title prefix
    //    (handles Kalshi ETH/BTC bracket series with near-identical titles)
    const seen = new Map<string, NormalizedMarket>();
    for (const m of filtered.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))) {
      const key = m.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 40);
      if (!seen.has(key)) seen.set(key, m);
    }
    return Array.from(seen.values()).slice(0, perVenueCap);
  });

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
      { maxTokens: 4000 }
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

    // Hard guard 1: require 2+ markets from DISTINCT venues
    const venues = new Set(groupMarkets.map((m) => m.venue));
    if (venues.size < 2) continue;

    // Hard guard 2: require 2+ distinct real-money venues
    // (groups with only play-money cross-venue matches have no edge)
    const realMoneyVenues = new Set(
      groupMarkets.filter((m) => !m.isPlayMoney).map((m) => m.venue)
    );
    if (realMoneyVenues.size < 1) continue; // must have at least 1 real-money venue

    // Hard guard 3: reject if LLM confidence is below threshold
    const confidence = g.confidence ?? 0.8;
    if (confidence < 0.75) continue;

    // Hard guard 4: close-date spread check — if markets close > 90 days apart,
    // require very high confidence (0.9+) to avoid cross-season false matches
    const closeDates = groupMarkets
      .map((m) => m.closeTime?.getTime())
      .filter((t): t is number => t != null);
    if (closeDates.length >= 2) {
      const dateRangeMs = Math.max(...closeDates) - Math.min(...closeDates);
      const dateRangeDays = dateRangeMs / (1000 * 60 * 60 * 24);
      if (dateRangeDays > 90 && confidence < 0.9) continue;
    }

    const spreadDetails = computeSpreads(groupMarkets);
    const maxSpread = spreadDetails.reduce((max, s) => Math.max(max, s.spreadPts), 0);
    const realMoneySpread = computeRealMoneySpread(groupMarkets);

    groups.push({
      label: g.label,
      markets: groupMarkets,
      matchConfidence: confidence,
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

      // Never compare markets from the same venue — that's not a cross-venue spread
      if (a.venue === b.venue) continue;

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

// Remove groups whose constituent markets no longer exist, or that have
// fewer than 2 distinct real-money venues after recomputing.
export async function pruneStaleGroups(): Promise<number> {
  const { prisma } = await import("./db");
  const groups = await prisma.matchGroup.findMany();
  let pruned = 0;

  for (const g of groups) {
    const marketIds: string[] = JSON.parse(g.marketIds as string);
    const existing = await prisma.market.findMany({
      where: { id: { in: marketIds } },
    });

    // Prune if too few markets remain
    if (existing.length < 2) {
      await prisma.matchGroup.delete({ where: { id: g.id } });
      pruned++;
      continue;
    }

    // Prune if stored ID count > existing count: some markets were deleted.
    // These are stale groups that reference no-longer-existent markets.
    if (marketIds.length > existing.length) {
      await prisma.matchGroup.delete({ where: { id: g.id } });
      pruned++;
      continue;
    }

    // Prune if only one distinct venue remains
    const distinctVenues = new Set(existing.map((m: { venue: string }) => m.venue));
    if (distinctVenues.size < 2) {
      await prisma.matchGroup.delete({ where: { id: g.id } });
      pruned++;
      continue;
    }

    // Prune if confidence is below threshold
    if (g.matchConfidence < 0.75) {
      await prisma.matchGroup.delete({ where: { id: g.id } });
      pruned++;
      continue;
    }
  }

  if (pruned > 0) console.log(`[match] pruned ${pruned} stale/invalid groups`);
  return pruned;
}

export async function clearDemoGroups(): Promise<number> {
  const { prisma } = await import("./db");
  const demoGroups = await prisma.matchGroup.findMany({
    where: { id: { startsWith: "demo-" } },
  });
  if (demoGroups.length === 0) return 0;
  await prisma.matchGroup.deleteMany({ where: { id: { startsWith: "demo-" } } });
  // Delete seed markets that only exist for demo (venueMarketId starts with "demo-")
  await prisma.market.deleteMany({ where: { venueMarketId: { startsWith: "demo-" } } });
  console.log(`[match] cleared ${demoGroups.length} demo match groups`);
  return demoGroups.length;
}

export async function getRankedGroups(): Promise<RankedGroup[]> {
  const { prisma } = await import("./db");

  // Strict source separation: DEMO_MODE → seed only; live → live only. Never mix.
  const demoMode = process.env.DEMO_MODE === "true";
  const whereClause = demoMode
    ? { id: { startsWith: "demo-" } }
    : { id: { not: { startsWith: "demo-" } } };

  const groups = await prisma.matchGroup.findMany({
    where: whereClause,
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

    // Always recompute realMoneySpread from live isPlayMoney flags —
    // stored value may be stale (created before backfill or schema change)
    const liveRealMoneySpread = computeRealMoneySpread(normalized);

    // Bug 2 guard: update stored value if it differs significantly
    const stored = (g as Record<string, unknown>).realMoneySpread as number ?? 0;
    if (Math.abs(stored - liveRealMoneySpread) > 0.5) {
      await prisma.matchGroup.update({
        where: { id: g.id },
        data: { realMoneySpread: liveRealMoneySpread },
      }).catch(() => null);
    }

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
      realMoneySpread: liveRealMoneySpread,
      spreadDetails: computeSpreads(normalized),
      matchConfidence: g.matchConfidence,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notedDifferences: JSON.parse(g.notedDifferences as any),
    });
  }

  // Sort by live realMoneySpread (recomputed above, not stale stored value)
  result.sort((a, b) => b.realMoneySpread - a.realMoneySpread);
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
