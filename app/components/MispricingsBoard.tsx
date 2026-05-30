"use client";

import { useState, useEffect, useCallback } from "react";
import { MispricingCard } from "./MispricingCard";
import type { RankedGroup } from "@/lib/match";

export function MispricingsBoard() {
  const [groups, setGroups] = useState<RankedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creditsSpent, setCreditsSpent] = useState(0);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">
            MISPRICINGS
          </h2>
          {groups.length > 0 && (
            <span className="text-zinc-600 text-xs">{groups.length} match groups</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-600 tabular-nums">
            {creditsSpent} credits used
          </span>
          {lastFetched && (
            <span className="text-zinc-700 tabular-nums">
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
        <div className="grid gap-3">
          {groups.map((g, i) => (
            <MispricingCard key={g.id} group={g} isHero={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
