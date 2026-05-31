"use client";

import { useState } from "react";

interface TrendingRow {
  venue: string;
  title: string;
  url: string;
  yesProb: number | null;
  yesName: string;
  isPlayMoney: boolean;
}

interface TrendingData {
  kalshi: TrendingRow[];
  polymarket: TrendingRow[];
  manifold: TrendingRow[];
  robinhood: TrendingRow[];
  fetchedAt: string | null;
}

const VENUES = [
  { key: "kalshi", label: "Kalshi", color: "text-blue-400" },
  { key: "polymarket", label: "Polymarket", color: "text-violet-400" },
  { key: "robinhood", label: "Robinhood", color: "text-green-400" },
  { key: "manifold", label: "Manifold ◎", color: "text-zinc-400" },
] as const;

export function TrendingTable({ trending }: { trending: TrendingData | null }) {
  const [tab, setTab] = useState<string>("kalshi");
  if (!trending) return null;

  const rows: TrendingRow[] = (trending as unknown as Record<string, TrendingRow[]>)[tab] ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">Trending</h2>
        {trending.fetchedAt && (
          <span className="text-zinc-700 text-[10px] font-mono">
            updated {new Date(trending.fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Venue tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {VENUES.map((v) => {
          const count = ((trending as unknown as Record<string, TrendingRow[]>)[v.key] ?? []).length;
          return (
            <button
              key={v.key}
              onClick={() => setTab(v.key)}
              className={`px-3 py-1.5 text-xs font-bold border-b-2 -mb-px transition-colors ${
                tab === v.key
                  ? `${v.color} border-current`
                  : "text-zinc-600 border-transparent hover:text-zinc-400"
              }`}
            >
              {v.label} <span className="font-mono text-[10px] text-zinc-600">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Rows */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-zinc-600 text-xs py-6 text-center">No data yet — run live to populate.</div>
        ) : (
          rows.map((r, i) => {
            const pct = r.yesProb != null ? r.yesProb * 100 : null;
            return (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-zinc-900/70 transition-colors border-b border-zinc-800/50 last:border-0"
              >
                <span className="flex-1 min-w-0 truncate text-zinc-200">{r.title}</span>
                {pct != null && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:block w-16 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono tabular-nums text-zinc-300 w-14 text-right">
                      {r.yesName} {pct.toFixed(0)}%
                    </span>
                  </div>
                )}
                <span className="text-zinc-700 shrink-0">↗</span>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
