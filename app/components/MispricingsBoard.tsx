"use client";

import { useState, useEffect, useCallback } from "react";
import { MispricingCard } from "./MispricingCard";
import { SpreadBadge } from "./SpreadBadge";
import type { RankedGroup, Tier3Row } from "@/lib/match";

const VENUE_COLORS: Record<string, string> = {
  kalshi: "text-blue-400",
  polymarket: "text-violet-400",
  manifold: "text-zinc-500",
  robinhood: "text-green-400",
};
const VENUE_LABELS: Record<string, string> = { kalshi: "K", polymarket: "P", manifold: "M", robinhood: "RH" };

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "politics", label: "Politics" },
  { key: "crypto", label: "Crypto" },
  { key: "econ", label: "Econ" },
  { key: "sports", label: "Sports" },
] as const;

// ── Spread ticker ─────────────────────────────────────────────────────────────

function SpreadTicker({ groups }: { groups: RankedGroup[] }) {
  const live = groups.filter((g) => g.realMoneySpread > 0).slice(0, 10);
  if (live.length === 0) return null;
  return (
    <div className="flex items-center gap-0 border-b border-zinc-800/80 overflow-x-auto mb-3 scrollbar-hide">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-600 pr-3 border-r border-zinc-800 mr-3 py-2">Live</span>
      <div className="flex items-center gap-5 overflow-x-auto pb-2 pt-2">
        {live.map((g, i) => (
          <span key={g.id} className="flex items-center gap-1.5 shrink-0 text-xs">
            {i > 0 && <span className="text-zinc-800 select-none">·</span>}
            <span className="text-zinc-400 max-w-[180px] truncate">{g.label}</span>
            <span className="font-mono tabular-nums text-amber-400 font-bold">{g.realMoneySpread.toFixed(1)}pt</span>
            <span className="text-green-400 text-[10px]">▲</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Group row (Tier 1 + Tier 2) ─────────────────────────────────────────────────

function GroupRow({ group, isExpanded, onToggle }: { group: RankedGroup; isExpanded: boolean; onToggle: () => void }) {
  const realMarkets = group.markets.filter((m) => !m.isPlayMoney);
  const hasSpread = group.realMoneySpread > 0;
  const topSpread = group.spreadDetails.find(
    (s) => !group.markets.find((m) => m.venue === s.venueA)?.isPlayMoney &&
           !group.markets.find((m) => m.venue === s.venueB)?.isPlayMoney
  );
  const cheaper = topSpread ? (topSpread.probA < topSpread.probB ? topSpread.venueA : topSpread.venueB) : null;

  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-900/70 transition-colors border-b border-zinc-800/50">
        <span className="flex-1 min-w-0 text-sm font-medium text-zinc-100 truncate leading-tight">{group.label}</span>
        <div className="hidden sm:flex gap-1 shrink-0">
          {realMarkets.map((m) => {
            const color = m.venue === cheaper ? "text-green-400 border-green-400/60"
              : (cheaper && hasSpread) ? "text-red-400 border-red-400/60"
              : `${VENUE_COLORS[m.venue] ?? "text-zinc-500"} border-current`;
            return <span key={m.venue} className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${color}`}>{VENUE_LABELS[m.venue] ?? m.venue}</span>;
          })}
          {group.tier === 2 && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-zinc-700 text-zinc-500">M</span>}
        </div>
        <span className={`font-mono tabular-nums text-xs w-16 text-right shrink-0 ${hasSpread ? "text-amber-400 font-bold" : "text-zinc-600"}`}>
          {hasSpread ? `${group.realMoneySpread.toFixed(1)} pt` : "—"}
        </span>
        <div className="shrink-0">
          {group.tier === 2
            ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-zinc-800 text-zinc-400">vs crowd</span>
            : <SpreadBadge pts={group.realMoneySpread} isRealMoney={hasSpread} />}
        </div>
        <span className="text-zinc-600 text-[10px] w-3 shrink-0 select-none">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className="border-b border-zinc-800/50 p-3 bg-zinc-950/40"><MispricingCard group={group} /></div>
      )}
    </div>
  );
}

// ── Tier 3 context row (single venue) ────────────────────────────────────────────

function Tier3RowView({ row }: { row: Tier3Row }) {
  const pct = row.yesProb != null ? row.yesProb * 100 : null;
  return (
    <a href={row.url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-zinc-900/70 transition-colors border-b border-zinc-800/40 last:border-0">
      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded border border-current ${VENUE_COLORS[row.venue] ?? "text-zinc-500"}`}>
        {VENUE_LABELS[row.venue] ?? row.venue}
      </span>
      <span className="flex-1 min-w-0 truncate text-zinc-300">{row.title}</span>
      {pct != null && (
        <span className="font-mono tabular-nums text-zinc-400 w-14 text-right shrink-0">{row.yesName} {pct.toFixed(0)}%</span>
      )}
      <span className="text-zinc-700 shrink-0">↗</span>
    </a>
  );
}

function SectionHeader({ title, sub, count, accent }: { title: string; sub: string; count: number; accent: string }) {
  return (
    <div className="flex items-baseline gap-2 mt-4 mb-1.5">
      <span className={`text-xs font-bold uppercase tracking-widest ${accent}`}>{title}</span>
      <span className="text-zinc-600 text-[11px]">{sub}</span>
      <span className="text-zinc-700 text-[11px] font-mono ml-auto">{count}</span>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

interface JobProgress { venue: string; label: string; status: string; error?: string | null }
const VENUE_DOT: Record<string, string> = { kalshi: "bg-blue-400", polymarket: "bg-violet-400", manifold: "bg-zinc-500", robinhood: "bg-green-400", panel: "bg-amber-400" };

export function MispricingsBoard({ onRunComplete }: { onRunComplete?: () => void } = {}) {
  const [tier1, setTier1] = useState<RankedGroup[]>([]);
  const [tier2, setTier2] = useState<RankedGroup[]>([]);
  const [tier3, setTier3] = useState<Tier3Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [runStatus, setRunStatus] = useState<string>("");
  const [cat, setCat] = useState<string>("all");

  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const inCat = (c: string) => cat === "all" || c === cat;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mispricings");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setTier1(d.tier1 ?? []);
      setTier2(d.tier2 ?? []);
      setTier3(d.tier3 ?? []);
      setSource(d.source ?? "demo");
      setLastUpdated(d.lastUpdated ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function runLive() {
    if (running) return;
    setRunning(true); setError(null); setRunStatus("submitting Wire tasks…"); setJobs([]);
    try {
      const startRes = await fetch("/api/ingest/start", { method: "POST" });
      const start = await startRes.json();
      if (!start.runId) throw new Error(start.error ?? "failed to start run");
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await (await fetch(`/api/ingest/status?run=${start.runId}`)).json();
        setJobs(s.jobs ?? []);
        setRunStatus(s.status ?? "polling");
        if (s.done) { await load(); onRunComplete?.(); break; }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false); setRunStatus("");
    }
  }

  const f1 = tier1.filter((g) => inCat(g.category));
  const f2 = tier2.filter((g) => inCat(g.category));
  const f3 = tier3.filter((r) => inCat(r.category));
  const allTicker = [...tier1, ...tier2];
  const jobsDone = jobs.filter((j) => j.status !== "pending").length;

  return (
    <div className="space-y-2">
      {/* Source banner */}
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
          {lastUpdated && <span className="text-green-600/70 text-xs font-mono">last updated {new Date(lastUpdated).toLocaleString()}</span>}
        </div>
      )}

      {/* Live-run progress strip */}
      {(running || jobs.length > 0) && (
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-400 font-bold uppercase tracking-widest">Live run</span>
            <span className="text-zinc-500">{running ? `${runStatus || "polling"} · ${jobsDone}/${jobs.length} jobs` : "complete"}</span>
            {running && <span className="ml-auto inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-amber-400 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-16 overflow-y-auto">
            {jobs.map((j, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px]">
                <span className={`h-1.5 w-1.5 rounded-full ${VENUE_DOT[j.venue] ?? "bg-zinc-500"}`} />
                <span className="text-zinc-500">{j.label}</span>
                <span className={j.status === "completed" ? "text-green-400" : j.status === "failed" ? "text-red-400" : "text-zinc-600"}>
                  {j.status === "completed" ? "✓" : j.status === "failed" ? "✕" : "…"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <SpreadTicker groups={allTicker} />

      {/* Toolbar: title + category chips + run live */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">Mispricings</h2>
          <span className="text-zinc-600 text-xs font-mono">{f1.length + f2.length} groups · {f3.length} context</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                  cat === c.key ? "border-amber-400/60 text-amber-400 bg-amber-400/10" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}>{c.label}</button>
            ))}
          </div>
          <button onClick={runLive} disabled={running}
            className="px-2.5 py-1 border border-amber-500/50 rounded text-amber-400 text-xs font-bold hover:bg-amber-400/10 transition-colors disabled:opacity-40">
            {running ? "running…" : "▶ Run live"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-600 text-xs py-8 text-center">Loading…</div>
      ) : error ? (
        <div className="text-red-400 text-xs p-4 border border-red-900 rounded">{error}</div>
      ) : f1.length + f2.length + f3.length === 0 ? (
        <div className="text-zinc-600 text-xs py-8 text-center space-y-2">
          <p>No rows in this category.</p>
          <p>Try “All”, or click ▶ Run live to pull fresh Wire data.</p>
        </div>
      ) : (
        <div>
          {/* TIER 1 — real-money spread */}
          {f1.length > 0 && (
            <>
              <SectionHeader title="① Real-money spread" sub="≥2 of Kalshi / Polymarket / Robinhood" count={f1.length} accent="text-amber-400" />
              <div className="border border-amber-400/30 rounded-lg overflow-hidden">
                {f1.map((g) => <GroupRow key={g.id} group={g} isExpanded={expanded.has(g.id)} onToggle={() => toggle(g.id)} />)}
              </div>
            </>
          )}

          {/* TIER 2 — real-money vs crowd */}
          {f2.length > 0 && (
            <>
              <SectionHeader title="② Real-money vs crowd" sub="one real-money venue vs Manifold (play money)" count={f2.length} accent="text-zinc-400" />
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                {f2.map((g) => <GroupRow key={g.id} group={g} isExpanded={expanded.has(g.id)} onToggle={() => toggle(g.id)} />)}
              </div>
            </>
          )}

          {/* TIER 3 — context */}
          {f3.length > 0 && (
            <>
              <SectionHeader title="③ Context" sub="notable single-venue markets by liquidity" count={f3.length} accent="text-zinc-500" />
              <div className="border border-zinc-800/70 rounded-lg overflow-hidden">
                {f3.map((r) => <Tier3RowView key={r.id} row={r} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
