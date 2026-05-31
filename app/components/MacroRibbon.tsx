"use client";

interface MacroData {
  vix: { value: number; prevValue: number | null; date: string } | null;
  feargreed: { score: number; rating: string; prev: number | null } | null;
  coins: {
    btc: { price: number; changePct: number } | null;
    eth: { price: number; changePct: number } | null;
  } | null;
  fedfunds: { value: number; prevValue: number | null } | null;
  unrate: { value: number; prevValue: number | null } | null;
}

function dirColor(delta: number | null, invert = false): string {
  if (delta == null || delta === 0) return "text-zinc-400";
  const up = delta > 0;
  const good = invert ? !up : up;
  return good ? "text-green-400" : "text-red-400";
}

function Cell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</span>
      <span className={`font-mono tabular-nums text-xs font-bold ${color ?? "text-zinc-200"}`}>
        {value}
      </span>
      {sub && <span className={`font-mono tabular-nums text-[10px] ${color ?? "text-zinc-500"}`}>{sub}</span>}
    </div>
  );
}

export function MacroRibbon({ macro }: { macro: MacroData | null }) {
  if (!macro) return null;
  const { vix, feargreed, coins, fedfunds, unrate } = macro;

  const cells: React.ReactNode[] = [];

  if (coins?.btc) {
    cells.push(
      <Cell key="btc" label="BTC" value={`$${Math.round(coins.btc.price).toLocaleString()}`}
        sub={`${coins.btc.changePct >= 0 ? "+" : ""}${coins.btc.changePct.toFixed(2)}%`}
        color={dirColor(coins.btc.changePct)} />
    );
  }
  if (coins?.eth) {
    cells.push(
      <Cell key="eth" label="ETH" value={`$${Math.round(coins.eth.price).toLocaleString()}`}
        sub={`${coins.eth.changePct >= 0 ? "+" : ""}${coins.eth.changePct.toFixed(2)}%`}
        color={dirColor(coins.eth.changePct)} />
    );
  }
  if (vix) {
    const d = vix.prevValue != null ? vix.value - vix.prevValue : null;
    // VIX up = fear (red); down = calm (green) → invert
    cells.push(
      <Cell key="vix" label="VIX" value={vix.value.toFixed(2)}
        sub={d != null ? `${d >= 0 ? "+" : ""}${d.toFixed(2)}` : undefined}
        color={dirColor(d, true)} />
    );
  }
  if (feargreed) {
    const fgColor = feargreed.rating?.includes("greed") ? "text-green-400"
      : feargreed.rating?.includes("fear") ? "text-red-400" : "text-amber-400";
    cells.push(
      <Cell key="fg" label="Fear/Greed" value={feargreed.score.toFixed(0)} sub={feargreed.rating} color={fgColor} />
    );
  }
  if (fedfunds) {
    cells.push(<Cell key="ff" label="Fed Funds" value={`${fedfunds.value.toFixed(2)}%`} color="text-zinc-200" />);
  }
  if (unrate) {
    const d = unrate.prevValue != null ? unrate.value - unrate.prevValue : null;
    cells.push(
      <Cell key="ur" label="Unemployment" value={`${unrate.value.toFixed(1)}%`}
        sub={d != null && d !== 0 ? `${d >= 0 ? "+" : ""}${d.toFixed(1)}` : undefined}
        color={dirColor(d, true)} />
    );
  }

  if (cells.length === 0) return null;

  return (
    <div className="flex items-center gap-5 overflow-x-auto border-b border-zinc-800 bg-zinc-950/80 px-4 py-2 scrollbar-hide">
      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80 shrink-0 pr-3 border-r border-zinc-800">
        Macro
      </span>
      {cells.map((c, i) => (
        <div key={i} className="flex items-center gap-5">
          {i > 0 && <span className="text-zinc-800 select-none">·</span>}
          {c}
        </div>
      ))}
    </div>
  );
}
