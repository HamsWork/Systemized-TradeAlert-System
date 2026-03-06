/**
 * Convert stock/underlying target prices to instrument prices for Options and LETFs.
 * Used when underlying_price_based to set current_instrument_price for Discord and stored fills.
 */

export type InstrumentTypeForConvert =
  | "SHARES"
  | "OPTION"
  | "LEVERAGED_ETF"
  | "LETF_OPTIONS";

export function convertStockTargetsToInstrument(
  stockEntry: number,
  instrumentEntry: number,
  stockT1: number | null,
  stockT2: number | null,
  stockStop: number | null,
  delta: number | null,
  leverage: number,
  instrumentType: InstrumentTypeForConvert,
): { t1: number | null; t2: number | null; stop: number | null } {
  if (instrumentType === "SHARES") {
    return { t1: stockT1, t2: stockT2, stop: stockStop };
  }

  if (instrumentType === "OPTION" && delta != null && Math.abs(delta) > 0) {
    const t1 =
      stockT1 != null ? instrumentEntry + (stockT1 - stockEntry) * delta : null;
    const t2 =
      stockT2 != null ? instrumentEntry + (stockT2 - stockEntry) * delta : null;
    const stop =
      stockStop != null
        ? instrumentEntry + (stockStop - stockEntry) * delta
        : null;
    return {
      t1: t1 != null ? Math.max(0.01, t1) : null,
      t2: t2 != null ? Math.max(0.01, t2) : null,
      stop: stop != null ? Math.max(0.01, stop) : null,
    };
  }

  if (instrumentType === "LEVERAGED_ETF" && leverage > 0 && stockEntry > 0) {
    const t1 =
      stockT1 != null
        ? instrumentEntry *
          (1 + (leverage * (stockT1 - stockEntry)) / stockEntry)
        : null;
    const t2 =
      stockT2 != null
        ? instrumentEntry *
          (1 + (leverage * (stockT2 - stockEntry)) / stockEntry)
        : null;
    const stop =
      stockStop != null
        ? instrumentEntry *
          (1 + (leverage * (stockStop - stockEntry)) / stockEntry)
        : null;
    return {
      t1: t1 != null ? Math.max(0.01, t1) : null,
      t2: t2 != null ? Math.max(0.01, t2) : null,
      stop: stop != null ? Math.max(0.01, stop) : null,
    };
  }

  if (
    instrumentType === "LETF_OPTIONS" &&
    delta != null &&
    Math.abs(delta) > 0 &&
    leverage > 0 &&
    stockEntry > 0
  ) {
    const effectiveDelta = leverage * delta;
    const t1 =
      stockT1 != null
        ? instrumentEntry + (stockT1 - stockEntry) * effectiveDelta
        : null;
    const t2 =
      stockT2 != null
        ? instrumentEntry + (stockT2 - stockEntry) * effectiveDelta
        : null;
    const stop =
      stockStop != null
        ? instrumentEntry + (stockStop - stockEntry) * effectiveDelta
        : null;
    return {
      t1: t1 != null ? Math.max(0.01, t1) : null,
      t2: t2 != null ? Math.max(0.01, t2) : null,
      stop: stop != null ? Math.max(0.01, stop) : null,
    };
  }

  return { t1: null, t2: null, stop: null };
}

/**
 * Convert a single stock/underlying price to instrument price.
 * Returns null if conversion not applicable or inputs missing.
 */
export function convertStockPriceToInstrument(
  stockEntry: number,
  instrumentEntry: number,
  stockPrice: number,
  delta: number | null,
  leverage: number,
  instrumentType: InstrumentTypeForConvert,
): number | null {
  const { t1 } = convertStockTargetsToInstrument(
    stockEntry,
    instrumentEntry,
    stockPrice,
    null,
    null,
    delta,
    leverage,
    instrumentType,
  );
  return t1;
}

const INSTRUMENT_TYPE_MAP: Record<string, InstrumentTypeForConvert> = {
  Shares: "SHARES",
  Options: "OPTION",
  LETF: "LEVERAGED_ETF",
  "LETF Option": "LETF_OPTIONS",
  Crypto: "SHARES",
};

/**
 * Get conversion type from signal data instrument_type.
 */
export function getInstrumentTypeForConvert(
  instrumentType: string | undefined,
): InstrumentTypeForConvert {
  return INSTRUMENT_TYPE_MAP[instrumentType || ""] ?? "SHARES";
}
