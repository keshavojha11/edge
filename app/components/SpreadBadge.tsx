"use client";

interface Props {
  pts: number;
}

export function SpreadBadge({ pts }: Props) {
  const color =
    pts >= 8
      ? "bg-amber-400 text-zinc-950"
      : pts >= 4
      ? "bg-amber-500/30 text-amber-300"
      : "bg-zinc-700 text-zinc-300";

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums ${color}`}>
      {pts.toFixed(1)} pt spread
    </span>
  );
}
