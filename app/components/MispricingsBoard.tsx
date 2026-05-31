"use client";

import { useState, useEffect, useCallback } from "react";
import { MispricingCard } from "./MispricingCard";
import { SpreadBadge } from "./SpreadBadge";
import type { RankedGroup } from "@/lib/match";

const VENUE_COLORS: Record<string, string> = {
  kalshi: "text-blue-400",
  polymarket: "text-violet-400",
  manifold: "text-zinc-500",
  robinhood: "text-green-400",
};

const VENUE_LABELS: Record<string, string> = {
  kalshi: "K",
  polymarket: "P",
  manifold: "M",
  robinhood: "RH",
};

// ── Spread ticker ─────────────────────────────────────────────────────────────

function SpreadTicker({ groups }: { groups: RankedGroup[] }) {
  const live = groups.filter((g) => g.realMoneySpread > 0).slice(0, 10);
  if (live.length === 0) return null;

  return (
    <div className="flex items-center gap-0 border-b border-zinc-800/80 overflow-x-auto mb-3 scrollbar-hide">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-600 pr-3 border-r border-zinc-800 mr-3 py-2">
        Live
      </span>
      <div className="flex items-center gap-5 overflow-x-auto pb-2 pt-2">
        {live.map((g, i) => {
          const pts = g.realMoneySpread;
          const arrowColor = pts >= 5 ? "text-green-400" : "text-amber-400";
          return (
            <span key={g.id} className="flex items-center gap-1.5 shrink-0 text-xs">
              {i > 0 && <span className="text-zinc-800 select-none">·</span>}
              <span className="text-zinc-400 max-w-[180px] truncate">{g.label}</span>
              <span className="font-mono tabular-nums text-amber-400 font-bold">{pts.toFixed(1)}pt</span>
              <span className={`${arrowColor} text-[10px]`}>▲</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Compact row ───────────────────────────────────────────────────────────────

function CompactRow({
  group,
  isExpanded,
  onToggle,
}: {
  group: RankedGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const realMarkets = group.markets.filter((m) => !m.isPlayMoney);
  const hasSpread = group.realMoneySpread > 0;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-900/70 transition-colors border-b border-zinc-800/50"
      >
        {/* Event label */}
        <span className="flex-1 min-w-0 text-sm font-medium text-zinc-100 truncate leading-tight">
          {group.label}
        </span>

        {/* Venue chips — desktop only */}
        <div className="hidden sm:flex gap-1 shrink-0">
          {realMarkets.map((m) => (
            <span
              key={m.venue}
              className={`px-1.5 py-0.5 text-[10px] font-bold tracking-wide rounded border border-current ${VENUE_COLORS[m.venue] ?? "text-zinc-500"}`}
            >
              {VENUE_LABELS[m.venue] ?? m.venue}
            </span>
          ))}
        </div>

        {/* Spread value */}
        <span
          className={`font-mono tabular-nums text-xs w-16 text-right shrink-0 ${
            hasSpread ? "text-amber-400 font-bold" : "text-zinc-600"
          }`}
        >
          {hasSpread ? `${group.realMoneySpread.toFixed(1)} pt` : "—"}
        </span>

        {/* Spread badge */}
        <div className="shrink-0">
          <SpreadBadge pts={group.realMoneySpread} isRealMoney={hasSpread} />
        </div>

        {/* Expand toggle */}
        <span className="text-zinc-600 text-[10px] w-3 shrink-0 select-none">
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {isExpanded && (
        <div className="border-b border-zinc-800/50 p-3 bg-zinc-950/40">
          <MispricingCard group={group} />
        </div>
      )}
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

export function MispricingsBoard() {
  const [groups, setGroups] = useState<RankedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creditsSpent, setCreditsSpent] = useState(0);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mispricings");
      const data = (await res.json()) as {
        groups?: RankedGroup[];
        creditsSpent?: number;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setGroups(data.groups ?? []);
      setCreditsSpent(data.creditsSpent ?? 0);
      setLastFetched(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/ingest?force=true", { method: "POST" });
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Spread ticker */}
      {groups.length > 0 && <SpreadTicker groups={groups} />}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">
            Mispricings
          </h2>
          {groups.length > 0 && (
            <span className="text-zinc-600 text-xs font-mono">{groups.length} groups</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-600 font-mono tabular-nums">
            {creditsSpent} credits
          </span>
          {lastFetched && (
            <span className="text-zinc-700 font-mono tabular-nums">
              {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="px-2 py-1 border border-zinc-700 rounded text-zinc-400 hover:border-amber-400/50 hover:text-amber-400 transition-colors disabled:opacity-40"
          >
            {refreshing ? "fetching..." : "↻ refresh"}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-zinc-600 text-xs py-8 text-center">Loading markets...</div>
      ) : error ? (
        <div className="text-red-400 text-xs p-4 border border-red-900 rounded">{error}</div>
      ) : groups.length === 0 ? (
        <div className="text-zinc-600 text-xs py-8 text-center space-y-2">
          <p>No match groups yet.</p>
          <p>Click ↻ refresh to pull live markets and run LLM matching.</p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {/* Column header */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/80">
            <span className="flex-1 text-[10px] uppercase tracking-widest text-zinc-600">Event</span>
            <span className="hidden sm:block w-20 text-[10px] uppercase tracking-widest text-zinc-600 text-right">Venues</span>
            <span className="font-mono w-16 text-[10px] uppercase tracking-widest text-zinc-600 text-right">Spread</span>
            <span className="w-24 text-[10px] uppercase tracking-widest text-zinc-600 text-right">Signal</span>
            <span className="w-3" />
          </div>
          {groups.map((g) => (
            <CompactRow
              key={g.id}
              group={g}
              isExpanded={expanded.has(g.id)}
              onToggle={() => toggle(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
