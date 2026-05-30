"use client";

import { useState, useEffect } from "react";

interface Watch {
  id: string;
  matchGroupId: string;
  thresholdPct: number;
  status: string;
  lastSpread: number | null;
  label?: string;
}

export function WatchesPanel() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watches")
      .then((r) => r.json())
      .then((d) => setWatches(d.watches ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 font-bold text-sm">WATCHES</span>
        <span className="text-zinc-600 text-xs">alert when a spread hits your threshold</span>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-600">Loading...</p>
      ) : watches.length === 0 ? (
        <div className="text-xs text-zinc-600 space-y-1">
          <p>No active watches.</p>
          <p className="text-zinc-700">Pin a match group from the board above to watch it.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {watches.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-2 text-xs border border-zinc-800 rounded p-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-zinc-300 truncate">{w.label ?? w.matchGroupId.slice(0, 20)}</p>
                <p className="text-zinc-600 mt-0.5">
                  Alert at &gt;{w.thresholdPct}pt spread
                  {w.lastSpread != null && ` · current: ${w.lastSpread.toFixed(1)}pt`}
                </p>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  w.status === "triggered"
                    ? "bg-amber-400/20 text-amber-400"
                    : w.status === "active"
                    ? "bg-green-900/30 text-green-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {w.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
