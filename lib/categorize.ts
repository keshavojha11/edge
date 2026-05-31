/**
 * Keyword classification for market rows.
 *  - category(): broad bucket for the filter chips (politics/crypto/sports/econ/other)
 *  - topicKey(): finer cross-venue bucket key for matching. Markets sharing a
 *    topicKey across venues are LLM-verified as a candidate group. null = no
 *    cross-venue topic (won't be matched, but can still appear as context).
 */

export type Category = "politics" | "crypto" | "sports" | "econ" | "other";

const SPORTS_RE =
  /\b(vs\.?|nba|nfl|nhl|mlb|ncaa|premier league|la liga|serie a|bundesliga|world cup|super bowl|playoff|champions league|ufc|f1|grand prix|tennis|golf|masters|stanley cup|finals|wins? the (series|game|title|championship)|over\/under|spread:|moneyline|game \d)\b/i;
const CRYPTO_RE =
  /\b(bitcoin|btc|ethereum|eth|crypto|solana|sol|xrp|dogecoin|stablecoin|coinbase|binance|altcoin|defi|nft)\b/i;
const ECON_RE =
  /\b(fed|fomc|federal reserve|interest rate|rate cut|rate hike|recession|gdp|inflation|cpi|unemployment|jobless|jobs report|treasury|yield|debt ceiling|government shutdown|s&p|nasdaq|dow|stock market)\b/i;
const POLITICS_RE =
  /\b(president|presidential|election|senate|congress|governor|primary|nominee|democrat|republican|gop|trump|biden|harris|vance|parliament|prime minister|impeach|supreme court|cabinet|secretary of|speaker of the house|vote|ballot|poll)\b/i;

export function categorize(title: string, venueCategory?: string): Category {
  const t = `${title} ${venueCategory ?? ""}`;
  // Order matters: sports first (its "vs"/"wins" patterns are specific),
  // then crypto, econ, politics.
  if (SPORTS_RE.test(t)) return "sports";
  if (CRYPTO_RE.test(t)) return "crypto";
  if (ECON_RE.test(t)) return "econ";
  if (POLITICS_RE.test(t)) return "politics";
  return "other";
}

// Finer topic key for cross-venue bucketing. Returns null when a market has no
// recognizable cross-venue topic. The LLM verifies/splits within each bucket,
// so coarse keys are fine — over-grouping is corrected, under-grouping just
// means a missed match (acceptable; the market still shows as context).
export function topicKey(title: string): string | null {
  const t = title.toLowerCase();

  // ── Macro / Fed ────────────────────────────────────────────────────────────
  if (/recession/.test(t)) return "recession";
  if (/(rate cut|cut rates|rate hike|number of (rate )?cuts|how many.*cut)/.test(t)) return "fed-rate-moves";
  if (/(fed|fomc|federal reserve).*(june|jun )/.test(t)) return "fed-meeting-june";
  if (/(fed|fomc|federal reserve).*(meeting|decision|funds rate|basis point|bps|25bp)/.test(t)) return "fed-decision";
  if (/inflation|cpi/.test(t)) return "inflation";
  if (/government shutdown/.test(t)) return "govt-shutdown";

  // ── Crypto price levels ──────────────────────────────────────────────────────
  const btc = t.match(/(bitcoin|btc).*?\$?\s?(\d{2,3})\s?k|\$?(\d{2,3}),?000.*(bitcoin|btc)/);
  if (/bitcoin|btc/.test(t) && /150|150k|150,000/.test(t)) return "btc-150k";
  if (/bitcoin|btc/.test(t) && /200|200k|200,000/.test(t)) return "btc-200k";
  if (/bitcoin|btc/.test(t) && /100|100k|100,000/.test(t)) return "btc-100k";
  if (btc) return "btc-price";
  if (/ethereum|eth/.test(t) && /\$?\s?\d/.test(t)) return "eth-price";

  // ── Elections (2026/2028) ─────────────────────────────────────────────────────
  if (/2028.*president|president.*2028/.test(t)) return "pres-2028";
  if (/government control|house|senate|midterm/.test(t) && /2026/.test(t)) return "midterms-2026";

  return null;
}
