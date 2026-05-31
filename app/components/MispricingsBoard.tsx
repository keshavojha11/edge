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

  // Green/red directional: top spread pair — cheaper side green, richer side red
  const topSpread = group.spreadDetails.find(
    (s) =>
      !group.markets.find((m) => m.venue === s.venueA)?.isPlayMoney &&
      !group.markets.find((m) => m.venue === s.venueB)?.isPlayMoney
  );
  const cheaperVenue = topSpread
    ? topSpread.probA < topSpread.probB
      ? topSpread.venueA
      : topSpread.venueB
    : null;

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

        {/* Venue chips with green/red directional coloring */}
        <div className="hidden sm:flex gap-1 shrink-0">
          {realMarkets.map((m) => {
            const isChеaper = m.venue === cheaperVenue;
            const isRicher = cheaperVenue && m.venue !== cheaperVenue && hasSpread;
            const color = isChеaper
              ? "text-green-400 border-green-400/60"
              : isRicher
              ? "text-red-400 border-red-400/60"
              : VENUE_COLORS[m.venue] ?? "text-zinc-500";
            return (
              <span
                key={m.venue}
                className={`px-1.5 py-0.5 text-[10px] font-bold tracking-wide rounded border ${color}`}
              >
                {VENUE_LABELS[m.venue] ?? m.venue}
              </span>
            );
          })}
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

interface JobProgress {
  venue: string;
  label: string;
  status: string;
  error?: string | null;
}

const VENUE_DOT: Record<string, string> = {
  kalshi: "bg-blue-400",
  polymarket: "bg-violet-400",
  manifold: "bg-zinc-500",
  robinhood: "bg-green-400",
};

export function MispricingsBoard() {
  const [groups, setGroups] = useState<RankedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [runStatus, setRunStatus] = useState<string>("");

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
        source?: "live" | "demo";
        lastUpdated?: string | null;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setGroups(data.groups ?? []);
      setSource(data.source ?? "demo");
      setLastUpdated(data.lastUpdated ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // P0: genuine async live run — /start submits Wire tasks, then poll /status
  // every 3s. No single request exceeds 60s; total run ~2-3 min.
  async function runLive() {
    if (running) return;
    setRunning(true);
    setError(null);
    setRunStatus("submitting Wire tasks…");
    setJobs([]);
    try {
      const startRes = await fetch("/api/ingest/start", { method: "POST" });
      const start = (await startRes.json()) as { runId?: string; error?: string };
      if (!start.runId) throw new Error(start.error ?? "failed to start run");
      const runId = start.runId;

      // Poll until done (cap ~4 min of polling)
      const deadline = Date.now() + 4 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const sRes = await fetch(`/api/ingest/status?run=${runId}`);
        const s = (await sRes.json()) as {
          status?: string;
          done?: boolean;
          jobs?: JobProgress[];
          groups?: RankedGroup[];
        };
        setJobs(s.jobs ?? []);
        setRunStatus(s.status ?? "polling");
        if (s.groups && s.groups.length > 0) {
          setGroups(s.groups);
          setSource("live");
        }
        if (s.done) {
          await load(); // pull final board (latest completed run)
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setRunStatus("");
    }
  }

  return (
    <div className="space-y-3">
      {/* Source banner: LIVE (with timestamp) or labeled SAMPLE SNAPSHOT */}
      {source === "demo" ? (
        <div className="flex items-center gap-2 rounded border border-yellow-600/40 bg-yellow-600/10 px-3 py-1.5">
          <span className="text-yellow-500 font-bold text-xs uppercase tracking-widest">Sample snapshot</span>
          <span className="text-yellow-600/70 text-xs">— illustrative data, not live. Click Run live for real Wire prices.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded border border-green-700/40 bg-green-900/10 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="text-green-400 font-bold text-xs uppercase tracking-widest">Live</span>
          {lastUpdated && (
            <span className="text-green-600/70 text-xs font-mono">
              last updated {new Date(lastUpdated).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Live-run progress strip */}
      {(running || jobs.length > 0) && (
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-400 font-bold uppercase tracking-widest">Live run</span>
            <span className="text-zinc-500">{running ? runStatus || "polling…" : "complete"}</span>
            {running && (
              <span className="ml-auto inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-amber-400 animate-spin" />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {jobs.map((j, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[11px]">
                <span className={`h-1.5 w-1.5 rounded-full ${VENUE_DOT[j.venue] ?? "bg-zinc-500"}`} />
                <span className="text-zinc-400">{j.label}</span>
                <span className={
                  j.status === "completed" ? "text-green-400"
                  : j.status === "failed" ? "text-red-400"
                  : "text-zinc-600"
                }>
                  {j.status === "completed" ? "✓" : j.status === "failed" ? "✕" : "polling…"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

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
          <button
            onClick={runLive}
            disabled={running}
            className="px-2.5 py-1 border border-amber-500/50 rounded text-amber-400 font-bold hover:bg-amber-400/10 transition-colors disabled:opacity-40"
          >
            {running ? "running live…" : "▶ Run live"}
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
          <p>Click ▶ Run live to pull real Wire prices and run LLM matching (~2-3 min).</p>
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
