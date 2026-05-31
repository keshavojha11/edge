"use client";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  published: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function MarketContext({ news, fetchedAt }: { news: NewsItem[]; fetchedAt: string | null }) {
  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <span className="text-amber-400 font-bold text-sm">MARKET CONTEXT</span>
        {fetchedAt && (
          <span className="text-zinc-700 text-[10px] font-mono ml-auto">
            {new Date(fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {news.length === 0 ? (
          <div className="text-zinc-600 text-xs p-4">Headlines populate after a live run.</div>
        ) : (
          news.map((n, i) => (
            <a
              key={i}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/70 transition-colors"
            >
              <p className="text-xs text-zinc-200 leading-snug line-clamp-2">{n.title}</p>
              <p className="text-[10px] text-zinc-600 mt-1 flex items-center gap-2">
                <span className="text-zinc-500">{n.source}</span>
                {n.published && <span>· {timeAgo(n.published)} ago</span>}
              </p>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
