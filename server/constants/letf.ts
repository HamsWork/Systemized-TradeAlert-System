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

// Approximate leverage for common LETFs. Sign indicates bull (>0) vs bear (<0).
const LETF_LEVERAGE: Record<string, number> = {
  // Index / sector 3x pairs
  TQQQ: 3,
  SQQQ: -3,
  UPRO: 3,
  SPXU: -3,
  SPXL: 3,
  SPXS: -3,
  UDOW: 3,
  SDOW: -3,
  TNA: 3,
  TZA: -3,
  LABU: 3,
  LABD: -3,
  HIBL: 3,
  HIBS: -3,
  SOXL: 3,
  SOXS: -3,
  TECL: 3,
  TECS: -3,
  FAS: 3,
  FAZ: -3,
  YINN: 3,
  YANG: -3,
  NUGT: 2, // some gold miners ETFs are 2x; treat as 2x here
  DUST: -2,
  JNUG: 2,
  JDST: -2,
  // Single-stock examples
  NVDL: 2,
  NVDS: -1.5,
  TSLL: 2,
  TSLQ: -1,
};

export function getLETFLeverage(
  ticker: string | null | undefined,
): number | undefined {
  if (!ticker || typeof ticker !== "string") return undefined;
  return LETF_LEVERAGE[ticker.toUpperCase().trim()];
}
