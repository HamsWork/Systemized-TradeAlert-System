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

function buildCacheKey(params: ChartParams): string {
  if (params.secType === "OPT" && params.strike && params.expiration && params.right) {
    return `OPT:${params.symbol.toUpperCase()}:${params.strike}:${params.expiration}:${params.right.toUpperCase()}`;
  }
  return `STK:${params.symbol.toUpperCase()}`;
}

export interface ChartParams {
  symbol: string;
  secType?: string;
  strike?: number;
  expiration?: string;
  right?: string;
}

interface CacheEntry {
  bars: ChartBar[];
  fetchedAt: number;
}

const chartCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const trackedSymbols = new Map<string, ChartParams>();

function resolveTicker(params: ChartParams): string {
  if (params.secType === "OPT" && params.strike && params.expiration && params.right) {
    return buildOptionsTicker(params.symbol, params.expiration, params.right, params.strike);
  }
  return params.symbol.toUpperCase();
}

async function fetchFromPolygon(params: ChartParams): Promise<ChartBar[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.warn("[Polygon] POLYGON_API_KEY not set");
    return [];
  }

  const ticker = resolveTicker(params);

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);

  const dailyUrl = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${formatDate(from)}/${formatDate(to)}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  try {
    const res = await fetch(dailyUrl);
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

    const dailyBars = data.results.map((bar) => {
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

    const intradayBars = await fetchIntradayBars(ticker, apiKey);
    if (intradayBars.length > 0) {
      const todayStr = formatDate(new Date());
      const filtered = dailyBars.filter(b => b.time !== todayStr);
      return [...filtered, ...intradayBars];
    }

    return dailyBars;
  } catch (err: any) {
    console.warn(`[Polygon] Fetch error for ${ticker}: ${err.message}`);
    return [];
  }
}

async function fetchIntradayBars(ticker: string, apiKey: string): Promise<ChartBar[]> {
  const today = new Date();
  const todayStr = formatDate(today);
  const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/5/minute/${todayStr}/${todayStr}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: PolygonAggResponse = await res.json();
    if (!data.results || data.results.length === 0) return [];

    return data.results.map((bar) => {
      const d = new Date(bar.t);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      return {
        time: `${todayStr}T${hh}:${mm}`,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v || 0,
      };
    });
  } catch {
    return [];
  }
}

export function getCachedBars(params: ChartParams): ChartBar[] | null {
  const key = buildCacheKey(params);
  const entry = chartCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
  return entry.bars;
}

export async function fetchPolygonBars(params: ChartParams): Promise<ChartBar[]> {
  const key = buildCacheKey(params);

  const cached = getCachedBars(params);
  if (cached !== null) return cached;

  const bars = await fetchFromPolygon(params);
  if (bars.length > 0) {
    chartCache.set(key, { bars, fetchedAt: Date.now() });
    trackedSymbols.set(key, { ...params });
  }
  return bars;
}

export function trackSymbol(params: ChartParams): void {
  const key = buildCacheKey(params);
  trackedSymbols.set(key, { ...params });
}

async function refreshAllTracked(): Promise<void> {
  if (trackedSymbols.size === 0) return;
  console.log(`[Polygon] Refreshing ${trackedSymbols.size} cached symbols...`);

  for (const [key, params] of Array.from(trackedSymbols)) {
    try {
      const bars = await fetchFromPolygon(params);
      if (bars.length > 0) {
        chartCache.set(key, { bars, fetchedAt: Date.now() });
      }
    } catch (err: any) {
      console.warn(`[Polygon] Refresh error for ${key}: ${err.message}`);
    }
  }
  console.log(`[Polygon] Refresh complete, ${chartCache.size} symbols cached`);
}

export async function prefetchSignalCharts(signals: Array<{ data: any }>): Promise<void> {
  if (!process.env.POLYGON_API_KEY) return;

  const seen = new Set<string>();
  for (const signal of signals) {
    const d = signal.data;
    if (!d?.ticker) continue;

    const stkKey = `STK:${d.ticker.toUpperCase()}`;
    if (!seen.has(stkKey)) {
      seen.add(stkKey);
      trackSymbol({ symbol: d.ticker, secType: "STK" });
    }

    if (d.instrument_type === "Options" && d.strike && d.expiration) {
      const right = d.option_type?.toUpperCase().startsWith("P") ? "P" : "C";
      const optKey = `OPT:${d.ticker.toUpperCase()}:${d.strike}:${d.expiration}:${right}`;
      if (!seen.has(optKey)) {
        seen.add(optKey);
        trackSymbol({
          symbol: d.ticker,
          secType: "OPT",
          strike: Number(d.strike),
          expiration: d.expiration,
          right,
        });
      }
    }
  }

  console.log(`[Polygon] Pre-fetching chart data for ${trackedSymbols.size} symbols...`);
  await refreshAllTracked();
}

interface SnapshotResponse {
  status?: string;
  ticker?: {
    lastTrade?: { p: number };
    lastQuote?: { P: number; p: number };
    min?: { c: number };
    prevDay?: { c: number };
    day?: { c: number };
  };
}

export async function fetchLastPrice(ticker: string): Promise<number | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;

  const isOption = ticker.startsWith("O:");
  if (isOption) {
    const url = `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(ticker)}?apiKey=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return fetchLastPriceFallback(ticker);
      }
      const data = await res.json();
      const result = data.results;
      if (!result) return fetchLastPriceFallback(ticker);
      const price = result.last_trade?.price ?? result.day?.close ?? result.prev_day?.close ?? null;
      return price;
    } catch {
      return fetchLastPriceFallback(ticker);
    }
  }

  const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker.toUpperCase())}?apiKey=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return fetchLastPriceFallback(ticker);
    }
    const data: SnapshotResponse = await res.json();
    const snap = data.ticker;
    if (!snap) return fetchLastPriceFallback(ticker);
    const price = snap.lastTrade?.p ?? snap.min?.c ?? snap.day?.c ?? snap.prevDay?.c ?? null;
    return price;
  } catch {
    return fetchLastPriceFallback(ticker);
  }
}

async function fetchLastPriceFallback(ticker: string): Promise<number | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;

  const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: PolygonAggResponse = await res.json();
    if (!data.results || data.results.length === 0) return null;
    return data.results[0].c;
  } catch {
    return null;
  }
}

export async function fetchOptionContractPrice(
  symbol: string,
  expiration: string,
  strike: number,
  right: string,
): Promise<{ exists: boolean; price: number | null }> {
  const ticker = buildOptionsTicker(symbol, expiration, right, strike);
  const price = await fetchLastPrice(ticker);
  return { exists: price !== null, price };
}

export async function fetchStockPrice(symbol: string): Promise<number | null> {
  return fetchLastPrice(symbol.toUpperCase());
}

export function startPolygonRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    refreshAllTracked().catch(err => console.warn(`[Polygon] Refresh cycle error: ${err.message}`));
  }, REFRESH_INTERVAL_MS);
  console.log(`[Polygon] Background refresh started (every ${REFRESH_INTERVAL_MS / 1000}s)`);
}
