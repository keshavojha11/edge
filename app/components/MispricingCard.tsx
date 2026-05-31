"use client";

import { SpreadBadge } from "./SpreadBadge";
import type { RankedGroup } from "@/lib/match";

const VENUE_COLORS: Record<string, string> = {
  kalshi: "text-blue-400",
  polymarket: "text-violet-400",
  manifold: "text-zinc-500",   // de-emphasised — play money
  robinhood: "text-green-400",
};

const VENUE_LABELS: Record<string, string> = {
  kalshi: "Kalshi",
  polymarket: "Polymarket",
  manifold: "Manifold ◎",     // ◎ = play money marker
  robinhood: "Robinhood",
};

interface Props {
  group: RankedGroup;
  isHero?: boolean;
}

export function MispricingCard({ group, isHero }: Props) {
  const realMarkets = group.markets.filter((m) => !m.isPlayMoney);
  const playMarkets = group.markets.filter((m) => m.isPlayMoney);
  const hasRealMoneySpread = group.realMoneySpread > 0;

  // Top spread pair from real-money venues only
  const realMoneyDetails = group.spreadDetails.filter(
    (s) => !group.markets.find((m) => m.venue === s.venueA)?.isPlayMoney &&
            !group.markets.find((m) => m.venue === s.venueB)?.isPlayMoney
  );
  const topRealSpread = realMoneyDetails[0] ?? null;

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        isHero && hasRealMoneySpread
          ? "border-amber-400/60 bg-amber-400/5"
          : "border-zinc-800 bg-zinc-900/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isHero && (
            <div className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">
              ▶ Biggest real-money spread
            </div>
          )}
          <h3 className="text-sm font-medium text-zinc-100 leading-snug">
            {group.label}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {realMarkets.length} real-money venue{realMarkets.length !== 1 ? "s" : ""}
            {playMarkets.length > 0 ? ` + ${playMarkets.length} crowd sentiment` : ""}
            {" · "}{(group.matchConfidence * 100).toFixed(0)}% match confidence
          </p>
        </div>
        <SpreadBadge pts={group.realMoneySpread} isRealMoney={hasRealMoneySpread} />
      </div>

      {/* Real-money venues */}
      <div className="grid gap-1.5">
        {realMarkets.map((m) => {
          const yes = m.outcomes.find((o) => o.name === "Yes") ?? m.outcomes[0];
          const no = m.outcomes.find((o) => o.name === "No") ?? m.outcomes[1];
          const pct = (yes?.impliedProb ?? 0) * 100;

          return (
            <div key={`${m.venue}-${m.title}`} className="flex items-center gap-2 text-xs">
              <span className={`w-24 shrink-0 font-bold ${VENUE_COLORS[m.venue] ?? "text-zinc-400"}`}>
                {VENUE_LABELS[m.venue] ?? m.venue}
              </span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="tabular-nums text-zinc-200 w-10 text-right">
                  {yes?.name ?? "—"} {pct.toFixed(1)}%
                </span>
                {no && (
                  <span className="tabular-nums text-zinc-500 w-10 text-right">
                    {no.name} {(no.impliedProb * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <a href={m.url} target="_blank" rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1" title="Open on venue">↗</a>
            </div>
          );
        })}
      </div>

      {/* Crowd sentiment (play-money) — visually separated */}
      {playMarkets.length > 0 && (
        <div className="border-t border-zinc-800/60 pt-2 space-y-1">
          <p className="text-xs text-zinc-600 uppercase tracking-widest">Crowd sentiment (play money — excluded from spread)</p>
          {playMarkets.map((m) => {
            const yes = m.outcomes.find((o) => o.name === "Yes") ?? m.outcomes[0];
            const pct = (yes?.impliedProb ?? 0) * 100;
            return (
              <div key={`${m.venue}-${m.title}`} className="flex items-center gap-2 text-xs opacity-60">
                <span className="w-24 shrink-0 text-zinc-500">{VENUE_LABELS[m.venue] ?? m.venue}</span>
                <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-zinc-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="tabular-nums text-zinc-500 w-10 text-right">{pct.toFixed(1)}%</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  className="text-zinc-700 hover:text-zinc-500 ml-1">↗</a>
              </div>
            );
          })}
        </div>
      )}

      {/* Real-money spread callout */}
      {topRealSpread && (
        <div className="text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span className="text-amber-400 font-bold">
            {VENUE_LABELS[topRealSpread.venueA] ?? topRealSpread.venueA} {(topRealSpread.probA * 100).toFixed(1)}%
          </span>
          {" vs "}
          <span className="text-amber-400 font-bold">
            {VENUE_LABELS[topRealSpread.venueB] ?? topRealSpread.venueB} {(topRealSpread.probB * 100).toFixed(1)}%
          </span>
          {" on "}{topRealSpread.outcomeName}
          {group.realMoneySpread > 0 && (
            <span className="text-zinc-600"> ({group.realMoneySpread.toFixed(1)}pt real-money spread)</span>
          )}
        </div>
      )}

      {/* Noted differences */}
      {group.notedDifferences.length > 0 && (
        <div className="space-y-1">
          {group.notedDifferences.map((d, i) => (
            <p key={i} className="text-xs text-zinc-500 leading-relaxed">⚠ {d}</p>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-600 border-t border-zinc-800 pt-2">
        Spread is a signal — not risk-free arbitrage. Resolution criteria, dates, fees &amp; liquidity differ between venues. Not financial advice.
      </p>
    </div>
  );
}
