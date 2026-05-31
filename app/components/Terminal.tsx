"use client";

import { useState, useEffect, useCallback } from "react";
import { MispricingsBoard } from "./MispricingsBoard";
import { ChatPanel } from "./ChatPanel";
import { WatchesPanel } from "./WatchesPanel";
import { MacroRibbon } from "./MacroRibbon";
import { TrendingTable } from "./TrendingTable";
import { MarketContext } from "./MarketContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Panels = { macro: any; trending: any; news: any[]; newsFetchedAt: string | null };

export function Terminal() {
  const [panels, setPanels] = useState<Panels | null>(null);

  // Cache-only fetch — /api/panels reads PanelCache, never fires Wire.
  const loadPanels = useCallback(async () => {
    try {
      const res = await fetch("/api/panels");
      const data = await res.json();
      if (!data.error) setPanels(data);
    } catch {
      /* panels are best-effort */
    }
  }, []);

  useEffect(() => {
    loadPanels();
  }, [loadPanels]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold text-lg tracking-tight">EDGE</span>
          <span className="text-zinc-600 text-xs hidden sm:block">
            prediction market intelligence terminal
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span className="hidden md:block">Kalshi · Polymarket · Manifold · Robinhood</span>
        </div>
      </header>

      {/* Macro ribbon (top, full width) */}
      <MacroRibbon macro={panels?.macro ?? null} />

      {/* Main layout: left 2/3 board + trending; right 1/3 chat + context + watches */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-6">
          <MispricingsBoard onRunComplete={loadPanels} />
          <TrendingTable trending={panels?.trending ?? null} />
        </div>

        <div className="space-y-4 flex flex-col">
          <div className="min-h-[340px] flex-1">
            <ChatPanel />
          </div>
          <MarketContext news={panels?.news ?? []} fetchedAt={panels?.newsFetchedAt ?? null} />
          <WatchesPanel />
        </div>
      </div>

      {/* Sticky disclaimer footer */}
      <footer className="sticky bottom-0 border-t border-zinc-800/80 bg-zinc-950/95 px-6 py-2 text-center backdrop-blur-sm shrink-0">
        <p className="text-[11px] text-zinc-700">
          Spread is a signal — not risk-free arbitrage. Resolution criteria, dates, fees &amp; liquidity differ between venues.{" "}
          <span className="text-zinc-800">Not financial advice.</span>
        </p>
      </footer>
    </div>
  );
}
