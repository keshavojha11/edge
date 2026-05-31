/* eslint-disable @typescript-eslint/no-explicit-any */
// Serves all panel data from PanelCache (Postgres). Pure cache read — NEVER
// fires a Wire call. Refreshed only by the live run + scheduled cron.

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");
    const rows = await prisma.panelCache.findMany();

    const byKey: Record<string, { data: any; fetchedAt: string }> = {};
    let totalCredits = 0;
    for (const r of rows as any[]) {
      byKey[r.key] = { data: JSON.parse(r.payloadJson), fetchedAt: r.fetchedAt.toISOString() };
      totalCredits += r.creditsSpent ?? 0;
    }

    const get = (k: string) => byKey[k]?.data ?? null;
    const ts = (k: string) => byKey[k]?.fetchedAt ?? null;

    const macro = {
      vix: get("vix"),
      feargreed: get("feargreed"),
      coins: get("coins"),
      fedfunds: get("fedfunds"),
      unrate: get("unrate"),
      fetchedAt: ts("coins") ?? ts("vix"),
    };

    const trending = {
      kalshi: get("trending:kalshi") ?? [],
      polymarket: get("trending:polymarket") ?? [],
      manifold: get("trending:manifold") ?? [],
      robinhood: get("trending:robinhood") ?? [],
      fetchedAt: ts("trending:kalshi") ?? ts("trending:polymarket"),
    };

    // Merge news feeds, newest first
    const news = [
      ...(get("news:cnbc") ?? []),
      ...(get("news:google") ?? []),
    ]
      .filter((n: any) => n?.title)
      .sort((a: any, b: any) => {
        const ta = a.published ? Date.parse(a.published) : 0;
        const tb = b.published ? Date.parse(b.published) : 0;
        return tb - ta;
      })
      .slice(0, 14);
    const newsFetchedAt = ts("news:cnbc") ?? ts("news:google");

    return Response.json({
      macro,
      trending,
      news,
      newsFetchedAt,
      panelCredits: totalCredits,
      hasData: rows.length > 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
