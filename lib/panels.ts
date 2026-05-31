/**
 * Non-market panels backed by additional Wire catalogs:
 *   cboe, fear_greed, coingecko, fred_stlouisfed (macro ribbon)
 *   kalshi/polymarket/manifold/robinhood list pulls (trending)
 *   cnbc, google_news (market context)
 *
 * Each panel job is one Wire action. When it completes, normalizePanel()
 * produces a { key, data } cache entry written to PanelCache. Page load reads
 * PanelCache only — never fires Wire.
 */
import { normalizeKalshi } from "./normalize/kalshi";
import { normalizePolymarket } from "./normalize/polymarket";
import { normalizeManifold } from "./normalize/manifold";
import { normalizeRobinhood } from "./normalize/robinhood";

export interface PanelJob {
  kind: string;       // "panel:<key>"
  label: string;      // progress UI label
  actionId: string;
  params: Record<string, unknown>;
}

export const PANEL_JOBS: PanelJob[] = [
  // ── Macro ribbon ──────────────────────────────────────────────────────────
  { kind: "panel:vix",       label: "CBOE · VIX",            actionId: "cboe_volatility_index", params: { index: "VIX", limit: 2 } },
  { kind: "panel:feargreed", label: "CNN · Fear & Greed",    actionId: "fg_cnn_fear_greed",     params: {} },
  { kind: "panel:coins",     label: "CoinGecko · BTC/ETH",   actionId: "cg_coin_markets",       params: { vs_currency: "usd", ids: "bitcoin,ethereum", limit: 2 } },
  { kind: "panel:fedfunds",  label: "FRED · Fed funds",      actionId: "fr_series",             params: { series_id: "FEDFUNDS", limit: 2 } },
  { kind: "panel:unrate",    label: "FRED · Unemployment",   actionId: "fr_series",             params: { series_id: "UNRATE", limit: 2 } },

  // ── Trending across venues ──────────────────────────────────────────────────
  { kind: "panel:trending:kalshi",     label: "Trending · Kalshi",     actionId: "kl_events",       params: { limit: 30, status: "open", with_nested_markets: true } },
  { kind: "panel:trending:polymarket", label: "Trending · Polymarket", actionId: "pm_get_markets",  params: { limit: 30, closed: false, order: "volume" } },
  { kind: "panel:trending:manifold",   label: "Trending · Manifold",   actionId: "mm_markets",      params: { limit: 60 } },
  { kind: "panel:trending:robinhood",  label: "Trending · Robinhood",  actionId: "rh_get_markets",  params: { limit: 30, live_only: true } },

  // ── Market context (news) ───────────────────────────────────────────────────
  { kind: "panel:news:cnbc",   label: "News · CNBC",        actionId: "cn_top_stories", params: { limit: 8 } },
  { kind: "panel:news:google", label: "News · Google News", actionId: "gn_search",      params: { query: "Federal Reserve OR recession OR Bitcoin OR election 2026", limit: 8 } },
];

export const PANEL_KINDS = new Set(PANEL_JOBS.map((j) => j.kind));

// ─── Normalizers: raw Wire payload → { key, data } cache entry ────────────────

export interface PanelEntry {
  key: string;
  data: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePanel(kind: string, payload: any): PanelEntry | null {
  switch (kind) {
    case "panel:vix": {
      const latest = payload?.latest ?? payload?.data?.[0];
      const prev = payload?.data?.[1];
      if (!latest) return null;
      return {
        key: "vix",
        data: { value: latest.close, prevValue: prev?.close ?? null, date: latest.date },
      };
    }

    case "panel:feargreed": {
      if (payload?.score == null) return null;
      return {
        key: "feargreed",
        data: { score: payload.score, rating: payload.rating, prev: payload.previous_close ?? null },
      };
    }

    case "panel:coins": {
      const coins = payload?.coins ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pick = (id: string) => coins.find((c: any) => c.id === id);
      const btc = pick("bitcoin");
      const eth = pick("ethereum");
      if (!btc && !eth) return null;
      return {
        key: "coins",
        data: {
          btc: btc ? { price: btc.current_price, changePct: btc.price_change_pct_24h } : null,
          eth: eth ? { price: eth.current_price, changePct: eth.price_change_pct_24h } : null,
        },
      };
    }

    case "panel:fedfunds":
    case "panel:unrate": {
      const obs = payload?.data ?? [];
      if (!obs.length) return null;
      const latest = obs[0];
      const prev = obs[1];
      return {
        key: kind === "panel:fedfunds" ? "fedfunds" : "unrate",
        data: {
          value: latest.value,
          prevValue: prev?.value ?? null,
          date: latest.date,
          units: payload?.units ?? "Percent",
        },
      };
    }

    case "panel:trending:kalshi":
    case "panel:trending:polymarket":
    case "panel:trending:manifold":
    case "panel:trending:robinhood": {
      const venue = kind.split(":")[2];
      let markets;
      if (venue === "kalshi") markets = normalizeKalshi(payload);
      else if (venue === "polymarket") markets = normalizePolymarket(payload);
      else if (venue === "manifold") markets = normalizeManifold(payload);
      else markets = normalizeRobinhood(payload);

      const rows = markets
        .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
        .slice(0, 12)
        .map((m) => ({
          venue: m.venue,
          title: m.title,
          url: m.url,
          yesProb: m.outcomes[0]?.impliedProb ?? null,
          yesName: m.outcomes[0]?.name ?? "Yes",
          isPlayMoney: m.isPlayMoney,
        }));
      return { key: `trending:${venue}`, data: rows };
    }

    case "panel:news:cnbc": {
      const arr = payload?.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = arr.slice(0, 8).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: "CNBC",
        published: a.published ?? null,
      }));
      return { key: "news:cnbc", data: items };
    }

    case "panel:news:google": {
      const arr = payload?.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = arr.slice(0, 8).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: a.source ?? "Google News",
        published: a.published ?? null,
      }));
      return { key: "news:google", data: items };
    }

    default:
      return null;
  }
}
