/**
 * LETF ticker → underlying index/stock.
 * Used for price fetch, trade monitor, and Discord display.
 * Single-stock LETFs (e.g. NVDL, TSLL) use the underlying stock ticker.
 */
export const LETF_UNDERLYING: Record<string, string> = {
  // S&P 500: SPXL 3x bull, SPXU -3x bear (top liquid); UPRO/SPXS also SPY
  TQQQ: "QQQ",
  SQQQ: "QQQ",
  UPRO: "SPY",
  SPXU: "SPY",
  SPXL: "SPY",
  SPXS: "SPY",
  UDOW: "DIA",
  SDOW: "DIA",
  TNA: "IWM",
  TZA: "IWM",
  LABU: "XBI",
  LABD: "XBI",
  HIBL: "XHB",
  HIBS: "XHB",
  SOXL: "SOX",
  SOXS: "SOX",
  TECL: "XLK",
  TECS: "XLK",
  FAS: "XLF",
  FAZ: "XLF",
  YINN: "FXI",
  YANG: "FXI",
  NUGT: "GDX",
  DUST: "GDX",
  JNUG: "GDXJ",
  JDST: "GDXJ",
  // Single-stock: NVDA — NVDL 2x bull, NVDS -1.5x bear
  NVDL: "NVDA",
  NVDS: "NVDA",
  // Single-stock: TSLA — TSLL 2x bull, TSLQ -1x bear
  TSLL: "TSLA",
  TSLQ: "TSLA",
};

export function getLETFUnderlying(ticker: string | null | undefined): string | undefined {
  if (!ticker || typeof ticker !== "string") return undefined;
  return LETF_UNDERLYING[ticker.toUpperCase().trim()];
}
