import { MispricingsBoard } from "./components/MispricingsBoard";
import { ChatPanel } from "./components/ChatPanel";
import { WatchesPanel } from "./components/WatchesPanel";

export default function Home() {
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
          <span>Kalshi · Polymarket · Manifold · Robinhood</span>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: mispricings board (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <MispricingsBoard />
        </div>

        {/* Right: chat + watches */}
        <div className="space-y-4 flex flex-col">
          <div className="flex-1 min-h-[400px]">
            <ChatPanel />
          </div>
          <WatchesPanel />
        </div>
      </div>

      {/* Sticky disclaimer footer — shown once here, never on individual cards */}
      <footer className="sticky bottom-0 border-t border-zinc-800/80 bg-zinc-950/95 px-6 py-2 text-center backdrop-blur-sm shrink-0">
        <p className="text-[11px] text-zinc-700">
          Spread is a signal — not risk-free arbitrage. Resolution criteria, dates, fees &amp; liquidity differ between venues.{" "}
          <span className="text-zinc-800">Not financial advice.</span>
        </p>
      </footer>
    </div>
  );
}
