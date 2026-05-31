import { jsonChat } from "./llm";
import { topicKey } from "./categorize";
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

// Tier 1: ≥2 distinct real-money venues; Tier 2: 1 real-money + Manifold crowd.
export function tierOfGroup(g: MatchedGroup): 1 | 2 {
  const realVenues = new Set(g.markets.filter((m) => !m.isPlayMoney).map((m) => m.venue));
  return realVenues.size >= 2 ? 1 : 2;
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

/**
 * Topic-bucketed cross-venue matcher.
 *
 * Blind interleaved batching can't reliably co-locate a Kalshi recession market
 * and a Polymarket recession market in the same LLM batch. Instead we bucket
 * markets by a coarse topicKey(), keep only buckets that span ≥2 venues, and
 * LLM-verify each multi-venue bucket in parallel. The LLM applies the scope/
 * date/structure guards and may split or reject a bucket. This finds genuine
 * cross-venue pairs comprehensively and cheaply (LLM runs only on candidates).
 */
export async function matchMarkets(
  markets: NormalizedMarket[],
  // opts kept for back-compat; bucketing ignores batchSize/perVenueCap
  _opts: { batchSize?: number; perVenueCap?: number } = {}
): Promise<MatchedGroup[]> {
  if (markets.length === 0) return [];

  // Bucket by topic key; drop markets with no cross-venue topic.
  const buckets = new Map<string, NormalizedMarket[]>();
  for (const m of markets) {
    const key = topicKey(m.title);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(m);
  }

  // Keep buckets spanning ≥2 distinct venues. Cap bucket size to keep prompts
  // tight (dedupe near-identical titles, take highest-liquidity per title).
  const candidates: Array<{ topic: string; markets: NormalizedMarket[] }> = [];
  for (const [topic, ms] of buckets) {
    const venues = new Set(ms.map((m) => m.venue));
    if (venues.size < 2) continue;
    const seen = new Map<string, NormalizedMarket>();
    for (const m of ms.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))) {
      const k = m.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 45);
      if (!seen.has(k)) seen.set(k, m);
    }
    candidates.push({ topic, markets: Array.from(seen.values()).slice(0, 24) });
  }

  console.log(`[match] ${markets.length} markets → ${candidates.length} multi-venue topic buckets`);
  if (candidates.length === 0) return [];

  // Verify all candidate buckets in parallel (one LLM call each).
  const results = await Promise.all(
    candidates.map((c) =>
      matchBatch(c.markets).catch((e) => {
        console.warn(`[match] bucket ${c.topic} failed: ${e}`);
        return [] as MatchedGroup[];
      })
    )
  );

  return dedupeAndRank(results.flat());
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
  tier: 1 | 2 | 3;
  category: string;
}

export interface Tier3Row {
  id: string;
  venue: string;
  title: string;
  url: string;
  yesProb: number | null;
  yesName: string;
  liquidity: number | null;
  category: string;
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

export interface BoardState {
  groups: RankedGroup[];      // back-compat: tier1 + tier2 combined
  tier1: RankedGroup[];
  tier2: RankedGroup[];
  tier3: Tier3Row[];
  source: "live" | "demo";
  lastUpdated: string | null;
}

/**
 * Tiered board, defaulting to the most recent COMPLETED live run from Postgres.
 * Tier 1: real-money (≥2 of K/P/R). Tier 2: real-money vs Manifold crowd.
 * Tier 3: notable single-venue context rows (top unmatched by liquidity).
 * Falls back to the labeled DEMO snapshot only when no completed run exists.
 */
export async function getBoardState(): Promise<BoardState> {
  const forceDemo = process.env.DEMO_MODE === "true";

  if (!forceDemo) {
    const { prisma } = await import("./db");
    const lastRun = await prisma.run.findFirst({
      where: { status: "completed" },
      orderBy: { createdAt: "desc" },
    });
    if (lastRun) {
      const groups = await loadGroupsForRun(lastRun.id);
      const tier1 = groups.filter((g) => g.tier === 1);
      const tier2 = groups.filter((g) => g.tier === 2);
      const tier3 = await loadTier3(lastRun.id, groups);
      if (tier1.length + tier2.length + tier3.length > 0) {
        return {
          groups, tier1, tier2, tier3,
          source: "live", lastUpdated: lastRun.createdAt.toISOString(),
        };
      }
    }
  }

  // Fallback: labeled sample snapshot
  const { DEMO_GROUPS } = await import("./demo-snapshot");
  const demo = DEMO_GROUPS as RankedGroup[];
  return {
    groups: demo,
    tier1: demo.filter((g) => g.tier === 1),
    tier2: demo.filter((g) => g.tier === 2),
    tier3: [],
    source: "demo",
    lastUpdated: null,
  };
}

async function loadGroupsForRun(runId: string): Promise<RankedGroup[]> {
  const { prisma } = await import("./db");
  const groups = await prisma.matchGroup.findMany({
    where: { runId },
    orderBy: { realMoneySpread: "desc" },
    take: 80,
  });

  const result: RankedGroup[] = [];
  for (const g of groups) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marketIds: string[] = JSON.parse(g.marketIds as any);
    const markets = await prisma.market.findMany({ where: { id: { in: marketIds } } });
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
      realMoneySpread: computeRealMoneySpread(normalized),
      spreadDetails: computeSpreads(normalized),
      matchConfidence: g.matchConfidence,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notedDifferences: JSON.parse(g.notedDifferences as any),
      tier: (g as { tier?: number }).tier === 1 ? 1 : 2,
      category: (g as { category?: string }).category ?? "other",
    });
  }
  // Tier 1 first (by real-money spread), then tier 2 (by max spread)
  result.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.tier === 1 ? b.realMoneySpread : b.maxSpread) - (a.tier === 1 ? a.realMoneySpread : a.maxSpread);
  });
  return result;
}

// Tier 3: notable single-venue context rows — top markets by liquidity from the
// run that are NOT already part of a matched group. Real data, clearly labeled.
async function loadTier3(runId: string, groups: RankedGroup[]): Promise<Tier3Row[]> {
  const { prisma } = await import("./db");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await prisma.market.findMany({ where: { runId } });

  const usedTitles = new Set<string>();
  for (const g of groups) for (const m of g.markets) usedTitles.add(m.title);

  // Build candidate rows: real-money, unmatched, "interesting" odds (not
  // near-certain longshots), deduped by title prefix.
  const seen = new Set<string>();
  type Row = Tier3Row & { _liq: number };
  const byVenue: Record<string, Row[]> = {};
  for (const m of rows.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))) {
    if (m.isPlayMoney || usedTitles.has(m.title) || (m.liquidity ?? 0) <= 0) continue;
    const outcomes = JSON.parse(m.outcomesJson);
    const yes = outcomes[0]?.impliedProb ?? null;
    if (yes == null || yes < 0.04 || yes > 0.96) continue; // skip near-certain
    const key = m.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 30);
    if (seen.has(key)) continue;
    seen.add(key);
    (byVenue[m.venue] ??= []).push({
      id: m.id, venue: m.venue, title: m.title, url: m.url,
      yesProb: yes, yesName: outcomes[0]?.name ?? "Yes",
      liquidity: m.liquidity, category: m.category ?? "other", _liq: m.liquidity ?? 0,
    });
  }

  // Round-robin across venues so the context section is diverse, not one venue.
  const venues = Object.keys(byVenue);
  const out: Tier3Row[] = [];
  for (let i = 0; out.length < 40 && venues.some((v) => byVenue[v][i]); i++) {
    for (const v of venues) {
      const r = byVenue[v][i];
      if (r && out.length < 40) {
        const { _liq, ...row } = r;
        void _liq;
        out.push(row);
      }
    }
  }
  return out;
}

// Back-compat wrapper used by the chat route
export async function getRankedGroups(): Promise<RankedGroup[]> {
  const { groups } = await getBoardState();
  return groups;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


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
