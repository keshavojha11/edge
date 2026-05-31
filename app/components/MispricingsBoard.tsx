"use client";

import { useState, useEffect, useCallback } from "react";
import { MispricingCard } from "./MispricingCard";
import { TrendingTable } from "./TrendingTable";
import type { RankedGroup, Tier3Row } from "@/lib/match";

const VENUE_COLORS: Record<string, string> = {
  kalshi: "text-blue-400", polymarket: "text-violet-400", manifold: "text-zinc-500", robinhood: "text-green-400",
};
const VENUE_LABELS: Record<string, string> = { kalshi: "K", polymarket: "P", manifold: "M", robinhood: "RH" };
const VENUE_DOT: Record<string, string> = { kalshi: "bg-blue-400", polymarket: "bg-violet-400", manifold: "bg-zinc-500", robinhood: "bg-green-400", panel: "bg-amber-400" };

interface JobProgress { venue: string; label: string; status: string; error?: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Trending = any;

// ── Tier 2 compact row (real-money vs crowd) ─────────────────────────────────────
function CrowdRow({ group }: { group: RankedGroup }) {
  const real = group.markets.find((m) => !m.isPlayMoney);
  const crowd = group.markets.find((m) => m.isPlayMoney);
  const rp = real ? (real.outcomes[0]?.impliedProb ?? 0) * 100 : null;
  const cp = crowd ? (crowd.outcomes[0]?.impliedProb ?? 0) * 100 : null;
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs border-b border-zinc-800/50 last:border-0">
      <span className="flex-1 min-w-0 truncate text-zinc-300">{group.label}</span>
      {real && rp != null && (
        <span className="font-mono tabular-nums text-zinc-300">
          <span className={`font-bold ${VENUE_COLORS[real.venue]}`}>{VENUE_LABELS[real.venue]}</span> {rp.toFixed(0)}%
        </span>
      )}
      {crowd && cp != null && (
        <span className="font-mono tabular-nums text-zinc-600">M {cp.toFixed(0)}%</span>
      )}
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-500 shrink-0">vs crowd</span>
    </div>
  );
}

// ── Tier 3 context row ───────────────────────────────────────────────────────────
function ContextRow({ row }: { row: Tier3Row }) {
  const pct = row.yesProb != null ? row.yesProb * 100 : null;
  return (
    <a href={row.url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-zinc-900/70 border-b border-zinc-800/40 last:border-0">
      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded border border-current ${VENUE_COLORS[row.venue] ?? "text-zinc-500"}`}>
        {VENUE_LABELS[row.venue] ?? row.venue}
      </span>
      <span className="flex-1 min-w-0 truncate text-zinc-400">{row.title}</span>
      {pct != null && <span className="font-mono tabular-nums text-zinc-400 w-12 text-right shrink-0">{row.yesName} {pct.toFixed(0)}%</span>}
      <span className="text-zinc-700 shrink-0">↗</span>
    </a>
  );
}

export function MispricingsBoard({ onRunComplete, trending }: { onRunComplete?: () => void; trending?: Trending } = {}) {
  const [tier1, setTier1] = useState<RankedGroup[]>([]);
  const [tier2, setTier2] = useState<RankedGroup[]>([]);
  const [tier3, setTier3] = useState<Tier3Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [runStatus, setRunStatus] = useState("");
  const [explore, setExplore] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await (await fetch("/api/mispricings")).json();
      if (d.error) throw new Error(d.error);
      setTier1(d.tier1 ?? []); setTier2(d.tier2 ?? []); setTier3(d.tier3 ?? []);
      setSource(d.source ?? "demo"); setLastUpdated(d.lastUpdated ?? null); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function runLive() {
    if (running) return;
    setRunning(true); setError(null); setRunStatus("submitting…"); setJobs([]);
    try {
      const start = await (await fetch("/api/ingest/start", { method: "POST" })).json();
      if (!start.runId) throw new Error(start.error ?? "failed to start");
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await (await fetch(`/api/ingest/status?run=${start.runId}`)).json();
        setJobs(s.jobs ?? []); setRunStatus(s.status ?? "polling");
        if (s.done) { await load(); onRunComplete?.(); break; }
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); setRunStatus(""); }
  }

  const jobsDone = jobs.filter((j) => j.status !== "pending").length;

  return (
    <div className="space-y-4">
      {/* Source banner + Run live */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {source === "demo" ? (
          <div className="flex items-center gap-2 rounded border border-yellow-600/40 bg-yellow-600/10 px-3 py-1.5">
            <span className="text-yellow-500 font-bold text-xs uppercase tracking-widest">Sample snapshot</span>
            <span className="text-yellow-600/70 text-xs">not live — click Run live</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded border border-green-700/40 bg-green-900/10 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-green-400 font-bold text-xs uppercase tracking-widest">Live</span>
            {lastUpdated && <span className="text-green-600/70 text-xs font-mono">{new Date(lastUpdated).toLocaleString()}</span>}
          </div>
        )}
        <button onClick={runLive} disabled={running}
          className="px-3 py-1.5 border border-amber-500/50 rounded text-amber-400 text-xs font-bold hover:bg-amber-400/10 disabled:opacity-40">
          {running ? `running… ${jobsDone}/${jobs.length}` : "▶ Run live"}
        </button>
      </div>

      {/* Live-run progress strip */}
      {running && (
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="text-amber-400 font-bold uppercase tracking-widest">Pulling Wire data</span>
            <span className="text-zinc-500">{runStatus} · {jobsDone}/{jobs.length}</span>
            <span className="ml-auto inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-amber-400 animate-spin" />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-12 overflow-y-auto">
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

      {/* Headline */}
      <div>
        <h1 className="text-lg font-bold text-zinc-100">Real-money mispricings</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          The same event priced differently across Kalshi, Polymarket &amp; Robinhood. Manifold (play money) shown as crowd sentiment only.
        </p>
      </div>

      {loading ? (
        <div className="text-zinc-600 text-xs py-10 text-center">Loading…</div>
      ) : error ? (
        <div className="text-red-400 text-xs p-4 border border-red-900 rounded">{error}</div>
      ) : (
        <>
          {/* TIER 1 — big hero spread cards */}
          {tier1.length === 0 ? (
            <div className="text-zinc-500 text-sm py-8 text-center border border-zinc-800 rounded-lg bg-zinc-900/30">
              <p>No real-money cross-venue spread right now.</p>
              <p className="text-zinc-600 text-xs mt-1">Genuine overlaps are sparse — click ▶ Run live to refresh, or open Explore below.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tier1.map((g, i) => <MispricingCard key={g.id} group={g} isHero={i === 0} />)}
            </div>
          )}

          {/* TIER 2 — real-money vs crowd (compact) */}
          {tier2.length > 0 && (
            <div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Real-money vs crowd</span>
                <span className="text-zinc-600 text-[11px]">one venue vs Manifold play money</span>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                {tier2.map((g) => <CrowdRow key={g.id} group={g} />)}
              </div>
            </div>
          )}

          {/* EXPLORE — everything dense, hidden by default */}
          <div>
            <button onClick={() => setExplore((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
              <span className="font-bold uppercase tracking-widest">{explore ? "▲ Hide" : "▼ Explore"} all markets</span>
              <span className="text-zinc-600">{tier3.length} context rows · trending across 4 venues</span>
            </button>

            {explore && (
              <div className="mt-3 space-y-5">
                {trending && <TrendingTable trending={trending} />}
                {tier3.length > 0 && (
                  <div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Context</span>
                      <span className="text-zinc-600 text-[11px]">notable single-venue markets by activity</span>
                    </div>
                    <div className="border border-zinc-800/70 rounded-lg overflow-hidden">
                      {tier3.map((r) => <ContextRow key={r.id} row={r} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
