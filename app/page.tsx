import { MispricingsBoard } from "./components/MispricingsBoard";
import { ChatPanel } from "./components/ChatPanel";
import { WatchesPanel } from "./components/WatchesPanel";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
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
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
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

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-4 text-center text-xs text-zinc-700 space-y-1">
        <p>
          Spreads are signals, not guaranteed risk-free arbitrage. Resolution criteria, dates, fees,
          and liquidity differ between venues.
        </p>
        <p className="text-zinc-800">Not financial advice. Data via Anakin Wire (Holocron).</p>
      </footer>
    </div>
  );
}
