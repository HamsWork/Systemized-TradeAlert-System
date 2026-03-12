import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { getLETFUnderlyingSync } from "../constants/letf";
import {
  sendTargetHitDiscordAlert,
  sendStopLossRaisedDiscord,
  sendStopLossHitDiscord,
  profitPctFromInstrument,
} from "./discord";
import { fetchStockPrice, fetchOptionContractPrice } from "./polygon";

function getUnderlyingTicker(data: Record<string, any>): string {
  return (
    data.underlying_ticker ||
    data.underlying_symbol ||
    getLETFUnderlyingSync(data.ticker) ||
    data.ticker ||
    ""
  );
}

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "\u2014";
  return `$${Number(p).toFixed(2)}`;
}

interface TargetInfo {
  key: string;
  price: number;
  takeOffPercent: number;
  raiseStopLoss?: number;
  tpNumber?: number;
}

function parseTargets(
  data: Record<string, any>,
  bullish?: boolean,
): TargetInfo[] {
  if (!data.targets || typeof data.targets !== "object") return [];
  const entries = Object.entries(data.targets)
    .filter(([, val]) => (val as any)?.price)
    .map(([key, val]) => {
      const t = val as any;
      return {
        key,
        price: Number(t.price),
        takeOffPercent:
          t.take_off_percent != null ? Number(t.take_off_percent) : 100,
        raiseStopLoss: t.raise_stop_loss?.price
          ? Number(t.raise_stop_loss.price)
          : undefined,
      };
    })
    .sort((a, b) =>
      bullish === false ? b.price - a.price : a.price - b.price,
    );
  let index = 0;
  return entries.map((t) => ({
    ...t,
    tpNumber: t.takeOffPercent > 0 ? ++index : undefined,
  }));
}

function isBullishTrade(data: Record<string, any>): boolean {
  const instrumentType = data.instrument_type || "Shares";
  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    return data.direction === "Call";
  }
  return data.direction === "Long";
}

/** Fetch current instrument price for Discord profit display. Options use underlying symbol for Polygon. Exported for use in routes when sending Discord. */
export async function getCurrentInstrumentPrice(
  data: Record<string, any>,
  ticker: string,
): Promise<number | null> {
  if (ticker == null) return null;
  const instrumentType = data.instrument_type;
  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    if (data.strike == null || !data.expiration || !data.direction || data.right == null) return null;
    const contractTicker = typeof data.ticker === "string" && data.ticker.startsWith("O:")
      ? data.ticker
      : undefined;
    const result = await fetchOptionContractPrice(
      ticker,
      data.expiration,
      Number(data.strike),
      data.right,
      contractTicker,
    );
    return result.price ?? null;
  }
  if (instrumentType === "LETF" || instrumentType === "Shares") {
    return await fetchStockPrice(ticker);
  }
  
  return null;
}

/** Current instrument price at this moment: tracking price when it is instrument, else fetched. Used to save instrumentXxxFilled. */
async function getCurrentInstrumentPriceForSave(
  data: Record<string, any>,
  ticker: string,
  instrumentType: string,
  needsUnderlyingPrice: boolean,
  currentTrackingPrice: number | null,
): Promise<number | null> {
  if (instrumentType === "Shares" || instrumentType === "Crypto") {
    return currentTrackingPrice;
  }
  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    return !needsUnderlyingPrice && currentTrackingPrice != null
      ? currentTrackingPrice
      : await getCurrentInstrumentPrice(data, ticker);
  }
  if (instrumentType === "LETF") {
    return getCurrentInstrumentPrice(data, ticker);
  }
  return currentTrackingPrice;
}

function instrumentFilledFieldName(targetKey: string): string {
  const cap = targetKey.charAt(0).toUpperCase() + targetKey.slice(1);
  return `instrument${cap}Filled`;
}

const MONITOR_INTERVAL = 10000;
let monitorInterval: ReturnType<typeof setInterval> | null = null;

async function checkActiveTrades(): Promise<void> {
  try {
    const allSignals = await storage.getSignals();
    const activeSignals = allSignals.filter((s) => s.status === "active");

    if (activeSignals.length === 0) return;

    for (const signal of activeSignals) {
      try {
        await checkSignalTargets(signal);
      } catch (err: any) {
        console.error(
          `[TradeMonitor] Error checking signal ${signal.id}: ${err.message}`,
        );
      }
    }
  } catch (err: any) {
    console.error(`[TradeMonitor] Monitor cycle error: ${err.message}`);
  }
}

function isAutoTrackEnabled(data: Record<string, any>): boolean {
  const v = data.auto_track;
  if (v === false) return false;
  if (v === "false" || v === 0) return false;
  return true;
}

async function checkSignalTargets(signal: Signal): Promise<void> {
  if (signal.status !== "active") return;
  const signalData = signal.data as Record<string, any>;
  if (signal.sourceAppId == null) return;
  const app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  if (!app) return;

  const isBullish = signalData.underlying_price_based 
    ? signalData.direction === "Long" || signalData.direction === "Call"
    : signalData.direction !== "Short";

  const ticker = signalData.ticker;
  if (!ticker) return;
  const currentInstrumentPrice = await getCurrentInstrumentPrice(signalData, ticker);
  const underlyingTicker = signalData.underlying_symbol || signalData.underlying_ticker || ticker;
  const currentTrackingPrice = signalData.underlying_price_based 
    ? await fetchStockPrice(underlyingTicker)
    : currentInstrumentPrice;
  
  

  if (!currentTrackingPrice || currentTrackingPrice <= 0) return;
  if (!currentInstrumentPrice || currentInstrumentPrice <= 0) return;

  signalData.current_tracking_price = currentTrackingPrice;
  signalData.current_instrument_price = currentInstrumentPrice;

  const tpLevels = parseTargets(signalData, isBullish);
  const nextTargetIndex = signalData.next_target_number ?? 0;
  if (tpLevels.length > 0 && nextTargetIndex < tpLevels.length) {
    const nextTarget = tpLevels[nextTargetIndex];
    const nextTargetHit = isBullish ? currentTrackingPrice >= nextTarget.price : currentTrackingPrice <= nextTarget.price;
    if (nextTargetHit) {
      const takeOffPct = nextTarget.takeOffPercent ?? 100;
      const takeOffQty = signalData.remain_quantity * (takeOffPct / 100);
      const targetKey = nextTarget.key ?? `tp${nextTargetIndex + 1}`;
      signalData.hit_targets[targetKey] = {
        hitAt: new Date().toISOString(),
        trackingPrice: currentTrackingPrice,
        instrumentPrice: currentInstrumentPrice,
        profitPct: profitPctFromInstrument(signalData.entry_instrument_price, currentInstrumentPrice, signalData.instrument_type, signalData.direction),
        take_off_quantity: takeOffQty
      };
      signalData.current_target_number = nextTargetIndex + 1;
      signalData.next_target_number = nextTargetIndex + 1;
      signalData.remain_quantity -= takeOffQty;

      const allTargetsHit = nextTargetIndex + 1 >= tpLevels.length;
      if (signalData.remain_quantity <= 0 || allTargetsHit) {
        signalData.status = "completed";
      }

      if (takeOffPct > 0) {
        signalData.current_tp_number = (signalData.current_tp_number ?? 0) + 1;
        await sendTargetHitDiscordAlert(signalData, app, signal.id);
      }

      const keyLabel = (targetKey ?? "").toUpperCase();
      storage.createActivity({
        type: "target_hit",
        title: `${keyLabel} hit for ${signalData.ticker}`,
        description: `${keyLabel} reached at ${fmtPrice(currentTrackingPrice)} (target: ${fmtPrice(nextTarget.price)})`,
        symbol: signalData.ticker,
        signalId: signal.id,
        metadata: {
          target: nextTarget,
          signalData: signalData,
        },
      }).catch(() => {});

      const raiseStopLoss = nextTarget.raiseStopLoss ?? (nextTarget as any).raise_stop_loss;
      if (raiseStopLoss != null){
        const slValue = typeof raiseStopLoss === "number" ? raiseStopLoss : (raiseStopLoss?.price != null ? Number(raiseStopLoss.price) : null);
        if (slValue != null) {
          const isValidRaiseStopLoss = isBullish ? slValue >= signalData.stop_loss : slValue <= signalData.stop_loss;
          if (isValidRaiseStopLoss) {
            signalData.current_stop_loss = slValue;

            signalData.stop_loss_is_break_even = Math.abs(slValue - signalData.entry_tracking_price) < 0.01;
            signalData.risk_value = signalData.stop_loss_is_break_even ? "0% (Risk-Free)" : 
              `${profitPctFromInstrument(signalData.entry_tracking_price, slValue, signalData.instrument_type, signalData.direction).toFixed(1)}%`;
            await sendStopLossRaisedDiscord(signalData, app, signal.id);
            storage.createActivity({
              type: "stop_loss_raised",
              title: `Stop loss raised to ${fmtPrice(slValue)} for ${signalData.ticker}`,
              description: `Stop loss raised to ${fmtPrice(slValue)} after ${keyLabel} hit (current price: ${fmtPrice(currentTrackingPrice)})`,
              symbol: signalData.ticker,
              signalId: signal.id,
              metadata: {
                target: nextTarget,
                signalData: signalData,
              },
            }).catch(() => {});
          }
        }
      }
      const completed = signalData.status === "completed";
      await storage.updateSignal(signal.id, { data: signalData, ...(completed ? { status: "completed" } : {}) });
    }
  }

  if (signalData.current_stop_loss){
    const stopLossHit = isBullish ? currentTrackingPrice <= signalData.current_stop_loss : currentTrackingPrice >= signalData.current_stop_loss;
    if (stopLossHit) {
      signalData.status = "stopped_out";
      signalData.stop_loss_hit = true;
      signalData.stop_loss_hit_at = new Date().toISOString();
      signalData.stop_loss_hit_tracking_price = currentTrackingPrice;
      signalData.stop_loss_hit_instrument_price = currentInstrumentPrice;
      signalData.remain_quantity = 0;
      signalData.stop_loss_percent = profitPctFromInstrument(signalData.entry_instrument_price, currentInstrumentPrice, signalData.instrument_type, signalData.direction);
      await sendStopLossHitDiscord(signalData, app, signal.id);
      storage.createActivity({
        type: "stop_loss_hit",
        title: `Stop loss hit for ${signalData.ticker}`,
        description: `Stop loss triggered at ${fmtPrice(currentTrackingPrice)} (SL: ${fmtPrice(signalData.current_stop_loss)})`,
        symbol: signalData.ticker,
        signalId: signal.id,
      }).catch(() => {});
      await storage.updateSignal(signal.id, { data: signalData, status: "stopped_out" });
    }
  }
  
}

/**
 * Manually record a target hit for an active signal (e.g. from API or UI).
 * Updates signal data (hit_targets, stop_loss if raise_stop_loss), sends Discord, creates activity.
 * If all targets become hit, sets signal status to "completed".
 */
export async function recordManualTargetHit(
  signal: Signal,
  currentPrice?: number | null,
): Promise<{ signal: Signal; error?: string }> {
  const data = signal.data as Record<string, any>;
  if (data.auto_track !== false) {
    return {
      signal,
      error:
        "Manual target hit is only allowed when auto_track is false. Disable auto tracking for this signal first.",
    };
  }
  if (signal.status !== "active") {
    return {
      signal,
      error: `Signal is not active (status: ${signal.status}). Only active signals can have targets marked as hit.`,
    };
  }
  const ticker = data.ticker || "UNKNOWN";
  const bullish = isBullishTrade(data);
  const targets = parseTargets(data, bullish);
  if (targets.length === 0) {
    return { signal, error: "Signal has no targets defined." };
  }
  const hitTargetsData =
    data.hit_targets && typeof data.hit_targets === "object"
      ? (data.hit_targets as Record<string, unknown>)
      : {};
  const target = targets.find((t) => !hitTargetsData[t.key]);
  if (!target) {
    return { signal, error: "All targets have already been hit." };
  }
  const targetKey = target.key;

  let app: ConnectedApp | null = null;
  if (signal.sourceAppId) {
    app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  }

  const priceAtHit =
    currentPrice != null && currentPrice > 0 ? currentPrice : target.price;
  const updatedData = { ...data };
  if (!updatedData.hit_targets) updatedData.hit_targets = {};
  (updatedData.hit_targets as Record<string, any>)[targetKey] = {
    hitAt: new Date().toISOString(),
    price: priceAtHit,
    manual: true,
  };

  if (target.raiseStopLoss) {
    updatedData.stop_loss = target.raiseStopLoss;
    console.log(
      `[TradeMonitor] Stop loss raised to ${fmtPrice(target.raiseStopLoss)} for ${ticker} (manual target hit)`,
    );
  }

  const updated = await storage.updateSignal(signal.id, { data: updatedData });
  if (!updated) return { signal, error: "Failed to update signal" };

  if (target.raiseStopLoss) {
    await sendStopLossRaisedDiscord(
      updatedData,
      app,
      { key: targetKey, raiseStopLoss: target.raiseStopLoss },
      priceAtHit,
      updatedData.current_instrument_price ?? priceAtHit,
      updated.id,
    );
    await storage
      .createActivity({
        type: "stop_loss_raised",
        title: `Stop loss raised to ${fmtPrice(target.raiseStopLoss)} for ${ticker}`,
        description: `Stop loss raised to ${fmtPrice(target.raiseStopLoss)} after ${targetKey.toUpperCase()} hit (manual)`,
        symbol: ticker,
        signalId: signal.id,
        metadata: {
          newStopLoss: target.raiseStopLoss,
          targetKey,
          currentPrice: priceAtHit,
          manual: true,
          sourceApp: app?.name || null,
        },
      })
      .catch(() => {});
  }

  const targetForDiscord = {
    key: target.key,
    price: target.price,
    takeOffPercent: target.takeOffPercent,
    raiseStopLoss: target.raiseStopLoss,
  };
  await sendTargetHitDiscordAlert(
    updatedData,
    app,
    targetForDiscord,
    priceAtHit,
    updatedData.current_instrument_price ?? priceAtHit,
    updated.id,
  );

  await storage
    .createActivity({
      type: "target_hit",
      title: `${targetKey.toUpperCase()} hit for ${ticker} (manual)`,
      description: `${targetKey.toUpperCase()} marked as hit at ${fmtPrice(priceAtHit)} (target: ${fmtPrice(target.price)})`,
      symbol: ticker,
      signalId: signal.id,
      metadata: {
        targetKey,
        targetPrice: target.price,
        currentPrice: priceAtHit,
        raiseStopLoss: target.raiseStopLoss ?? null,
        manual: true,
        sourceApp: app?.name || null,
      },
    })
    .catch(() => {});

  const allTargetsHit = targets.every(
    (t) =>
      t.key === targetKey ||
      !!(updatedData.hit_targets as Record<string, unknown>)?.[t.key],
  );
  if (allTargetsHit) {
    await storage.updateSignal(signal.id, { status: "completed" });
    const completedSignal = await storage.getSignal(signal.id);
    console.log(
      `[TradeMonitor] All targets hit for ${ticker} (manual) — signal completed`,
    );
    await storage
      .createActivity({
        type: "signal_completed",
        title: `All targets hit for ${ticker}`,
        description: `Signal completed — all ${targets.length} target(s) reached (manual)`,
        symbol: ticker,
        signalId: signal.id,
      })
      .catch(() => {});
    return { signal: completedSignal || updated };
  }

  return { signal: updated };
}

/**
 * Manually record a stop loss hit for an active signal (e.g. from API or UI).
 * Sets stop_loss_hit, stop_loss_hit_at, stop_loss_hit_price, status to "stopped_out",
 * sends Discord, and creates activity.
 */
export async function recordManualStopLossHit(
  signal: Signal,
  currentPrice?: number | null,
): Promise<{ signal: Signal; error?: string }> {
  if (signal.status !== "active") {
    return {
      signal,
      error: `Signal is not active (status: ${signal.status}). Only active signals can have stop loss marked as hit.`,
    };
  }
  const data = signal.data as Record<string, any>;
  if (data.auto_track !== false) {
    return {
      signal,
      error:
        "Manual stop loss hit is only allowed when auto_track is false. Disable auto tracking for this signal first.",
    };
  }
  const stopLoss = data.stop_loss != null ? Number(data.stop_loss) : null;
  if (stopLoss == null || isNaN(stopLoss)) {
    return {
      signal,
      error: "Signal has no stop_loss set. Cannot mark stop loss as hit.",
    };
  }
  if (data.stop_loss_hit === true) {
    return {
      signal,
      error: "Stop loss was already marked as hit for this signal.",
    };
  }

  let app: ConnectedApp | null = null;
  if (signal.sourceAppId) {
    app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  }

  const ticker = data.ticker || "UNKNOWN";
  const priceAtHit =
    currentPrice != null && currentPrice > 0 ? currentPrice : stopLoss;

  const updatedData = { ...data };
  updatedData.stop_loss_hit = true;
  updatedData.stop_loss_hit_at = new Date().toISOString();
  updatedData.stop_loss_hit_price = priceAtHit;
  updatedData.stop_loss_hit_manual = true;

  const updated = await storage.updateSignal(signal.id, {
    data: updatedData,
    status: "stopped_out",
  });
  if (!updated) return { signal, error: "Failed to update signal" };

  console.log(
    `[TradeMonitor] STOP LOSS HIT (manual): ${ticker} @ ${fmtPrice(priceAtHit)} (SL: ${fmtPrice(stopLoss)})`,
  );

  await sendStopLossHitDiscord(
    updatedData,
    app,
    priceAtHit,
    updatedData.current_instrument_price ?? priceAtHit,
    signal.id,
  );

  await storage
    .createActivity({
      type: "stop_loss_hit",
      title: `Stop loss hit for ${ticker} (manual)`,
      description: `Stop loss triggered at ${fmtPrice(priceAtHit)} (SL: ${fmtPrice(stopLoss)})`,
      symbol: ticker,
      signalId: signal.id,
      metadata: {
        stopLoss,
        currentPrice: priceAtHit,
        manual: true,
        sourceApp: app?.name || null,
      },
    })
    .catch(() => {});

  return { signal: updated };
}

export function startTradeMonitor(): void {
  if (monitorInterval) return;
  console.log("[TradeMonitor] Starting trade monitor...");
  monitorInterval = setInterval(() => {
    checkActiveTrades().catch((err) => {
      console.error(`[TradeMonitor] Unhandled error: ${err.message}`);
    });
  }, MONITOR_INTERVAL);

  checkActiveTrades().catch(() => {});
}

export function stopTradeMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[TradeMonitor] Stopped.");
  }
}
