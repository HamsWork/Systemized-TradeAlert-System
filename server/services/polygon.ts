const POLYGON_BASE = "https://api.polygon.io";

interface PolygonBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

interface PolygonAggResponse {
  results?: PolygonBar[];
  status?: string;
  resultsCount?: number;
}

export interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildOptionsTicker(symbol: string, expiration: string, right: string, strike: number): string {
  const sym = symbol.toUpperCase().padEnd(6, " ");
  const exp = expiration.replace(/-/g, "").slice(2);
  const r = right.toUpperCase().startsWith("P") ? "P" : "C";
  const strikePadded = String(Math.round(strike * 1000)).padStart(8, "0");
  return `O:${sym.trim()}${exp}${r}${strikePadded}`;
}

export async function fetchPolygonBars(params: {
  symbol: string;
  secType?: string;
  strike?: number;
  expiration?: string;
  right?: string;
  days?: number;
}): Promise<ChartBar[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.warn("[Polygon] POLYGON_API_KEY not set");
    return [];
  }

  let ticker: string;
  if (params.secType === "OPT" && params.strike && params.expiration && params.right) {
    ticker = buildOptionsTicker(params.symbol, params.expiration, params.right, params.strike);
  } else {
    ticker = params.symbol.toUpperCase();
  }

  const days = params.days || 90;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${formatDate(from)}/${formatDate(to)}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[Polygon] API error ${res.status} for ${ticker}: ${text}`);
      return [];
    }

    const data: PolygonAggResponse = await res.json();
    if (!data.results || data.results.length === 0) {
      console.warn(`[Polygon] No results for ${ticker}`);
      return [];
    }

    return data.results.map((bar) => {
      const d = new Date(bar.t);
      return {
        time: formatDate(d),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v || 0,
      };
    });
  } catch (err: any) {
    console.warn(`[Polygon] Fetch error for ${ticker}: ${err.message}`);
    return [];
  }
}
