"use client";

import { useState, useEffect, useCallback } from "react";
import { MispricingsBoard } from "./MispricingsBoard";
import { ChatPanel } from "./ChatPanel";
import { MarketContext } from "./MarketContext";
import { MacroRibbon } from "./MacroRibbon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Panels = { macro: any; trending: any; news: any[]; newsFetchedAt: string | null };

export function Terminal() {
  const [panels, setPanels] = useState<Panels | null>(null);

  const loadPanels = useCallback(async () => {
    try {
      const data = await (await fetch("/api/panels")).json();
      if (!data.error) setPanels(data);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { loadPanels(); }, [loadPanels]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold text-lg tracking-tight">EDGE</span>
          <span className="text-zinc-600 text-xs hidden sm:block">prediction market intelligence</span>
        </div>
        <span className="text-zinc-600 text-xs hidden md:block">Kalshi · Polymarket · Robinhood · Manifold</span>
      </header>

      {/* Thin macro context ribbon */}
      <MacroRibbon macro={panels?.macro ?? null} />

      {/* Left: spreads (hero) + explore. Right: Ask Edge + news. */}
      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MispricingsBoard onRunComplete={loadPanels} trending={panels?.trending ?? null} />
        </div>
        <div className="space-y-4 flex flex-col">
          <div className="min-h-[360px] flex-1">
            <ChatPanel />
          </div>
          <MarketContext news={panels?.news ?? []} fetchedAt={panels?.newsFetchedAt ?? null} />
        </div>
      </div>

      <footer className="sticky bottom-0 border-t border-zinc-800/80 bg-zinc-950/95 px-6 py-2 text-center backdrop-blur-sm shrink-0">
        <p className="text-[11px] text-zinc-700">
          A spread is a signal, not risk-free arbitrage — resolution criteria, dates, fees &amp; liquidity differ between venues.{" "}
          <span className="text-zinc-800">Not financial advice.</span>
        </p>
      </footer>
    </div>
  );
}
