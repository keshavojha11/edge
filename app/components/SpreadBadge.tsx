"use client";

interface Props {
  pts: number;        // real-money spread only
  isRealMoney: boolean;
}

export function SpreadBadge({ pts, isRealMoney }: Props) {
  // Amber only fires on real-money spread — never play-money-derived
  const color =
    !isRealMoney || pts === 0
      ? "bg-zinc-800 text-zinc-500"      // no real-money signal
      : pts >= 8
      ? "bg-amber-400 text-zinc-950"     // strong
      : pts >= 4
      ? "bg-amber-500/30 text-amber-300" // moderate
      : "bg-zinc-700 text-zinc-300";     // weak

  const label = pts === 0 ? "no real-money spread" : `${pts.toFixed(1)} pt spread`;

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums ${color}`}>
      {label}
    </span>
  );
}
