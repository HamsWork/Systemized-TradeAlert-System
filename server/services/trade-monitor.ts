import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { sendTargetHitDiscordAlert, sendStopLossRaisedDiscord, sendStopLossHitDiscord } from "./discord";
import { fetchStockPrice, fetchOptionContractPrice } from "./polygon";

function getUnderlyingTicker(data: Record<string, any>): string {
  return data.underlying_symbol || data.ticker || "";
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
}

function parseTargets(data: Record<string, any>, bullish?: boolean): TargetInfo[] {
  if (!data.targets || typeof data.targets !== "object") return [];
  return Object.entries(data.targets)
    .filter(([, val]) => (val as any)?.price)
    .map(([key, val]) => {
      const t = val as any;
      return {
        key,
        price: Number(t.price),
        takeOffPercent: Number(t.take_off_percent) || 100,
        raiseStopLoss: t.raise_stop_loss?.price
          ? Number(t.raise_stop_loss.price)
          : undefined,
      };
    })
    .sort((a, b) => bullish === false ? b.price - a.price : a.price - b.price);
}

function isBullishTrade(data: Record<string, any>): boolean {
  const instrumentType = data.instrument_type || "Shares";
  if (instrumentType === "Options" || instrumentType === "LETF Option") {
    return data.direction === "Call";
  }
  return data.direction === "Long" || data.direction !== "Short";
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
        console.error(`[TradeMonitor] Error checking signal ${signal.id}: ${err.message}`);
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
  const data = signal.data as Record<string, any>;
  const ticker = data.ticker;
  if (!ticker) return;
  if (!isAutoTrackEnabled(data)) {
    return;
  }

  const orders = await storage.getIbkrOrdersBySignal(signal.id);
  const fromOrder =
    orders.find((o) => o.status === "filled" && o.orderType === "market")?.lastPrice ??
    orders.find((o) => o.lastPrice != null && o.lastPrice > 0)?.lastPrice ??
    null;
  const fromData =
    data.current_price != null ? Number(data.current_price) :
    data.last_price != null ? Number(data.last_price) : null;
  let currentPrice =
    fromOrder ??
    (fromData != null && fromData > 0 ? fromData : null);

  const instrumentType = data.instrument_type || "Shares";
  const underlyingPriceBased = data.underlying_price_based === true;
  const needsUnderlyingPrice = underlyingPriceBased && (instrumentType === "Options" || instrumentType === "LETF" || instrumentType === "LETF Option");

  if (needsUnderlyingPrice) {
    const underlyingTicker = getUnderlyingTicker(data);
    const underlyingPrice = await fetchStockPrice(underlyingTicker);
    if (underlyingPrice && underlyingPrice > 0) {
      currentPrice = underlyingPrice;
    }
  } else if (!currentPrice || currentPrice <= 0) {
    if ((instrumentType === "Options" || instrumentType === "LETF Option") && data.strike != null && data.expiration && data.direction) {
      const right = data.direction === "Put" ? "P" : "C";
      const strikeNum = Number(data.strike);
      const result = await fetchOptionContractPrice(ticker, data.expiration, strikeNum, right);
      currentPrice = result.price ?? null;
    } else if (instrumentType === "Crypto") {
      return;
    } else {
      currentPrice = await fetchStockPrice(ticker);
    }
  }

  if (!currentPrice || currentPrice <= 0) return;

  const bullish = isBullishTrade(data);
  const targets = parseTargets(data, bullish);
  const stopLoss = data.stop_loss ? Number(data.stop_loss) : null;
  // Target hit status and stop-loss state from signal data (DB is source of truth)
  const hitTargetsData = (data.hit_targets && typeof data.hit_targets === "object")
    ? (data.hit_targets as Record<string, unknown>)
    : {};
  const signalHits = new Set<string>(Object.keys(hitTargetsData));
  const stopLossAlreadyHit = data.stop_loss_hit === true;

  let app: ConnectedApp | null = null;
  if (signal.sourceAppId) {
    app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (signalHits.has(target.key)) continue;

    const prevTarget = i > 0 ? targets[i - 1] : null;
    if (prevTarget && !signalHits.has(prevTarget.key)) break;

    const targetHit = bullish
      ? currentPrice >= target.price
      : currentPrice <= target.price;

    if (targetHit) {
      signalHits.add(target.key); // so allTargetsHit check below includes this run
      console.log(
        `[TradeMonitor] TARGET HIT: ${target.key} for ${ticker} @ ${fmtPrice(currentPrice)} (target: ${fmtPrice(target.price)})`,
      );

      if (target.raiseStopLoss) {
        const updatedData = { ...data };
        updatedData.stop_loss = target.raiseStopLoss;
        await storage.updateSignal(signal.id, { data: updatedData });
        console.log(
          `[TradeMonitor] Stop loss raised to ${fmtPrice(target.raiseStopLoss)} for ${ticker}`,
        );
        await sendStopLossRaisedDiscord(
          signal,
          app,
          target.raiseStopLoss,
          target.key,
          currentPrice,
          ticker,
          data,
        );
        storage
          .createActivity({
            type: "stop_loss_raised",
            title: `Stop loss raised to ${fmtPrice(target.raiseStopLoss)} for ${ticker}`,
            description: `Stop loss raised to ${fmtPrice(target.raiseStopLoss)} after ${target.key.toUpperCase()} hit (current price: ${fmtPrice(currentPrice)})`,
            symbol: ticker,
            signalId: signal.id,
            metadata: {
              newStopLoss: target.raiseStopLoss,
              targetKey: target.key,
              currentPrice,
              sourceApp: app?.name || null,
            },
          })
          .catch(() => {});
      }

      const updatedData = { ...(signal.data as Record<string, any>) };
      if (!updatedData.hit_targets) updatedData.hit_targets = {};
      updatedData.hit_targets[target.key] = {
        hitAt: new Date().toISOString(),
        price: currentPrice,
      };
      await storage.updateSignal(signal.id, { data: updatedData });

      await sendTargetHitDiscordAlert(signal, app, target, currentPrice, ticker, data);

      storage
        .createActivity({
          type: "target_hit",
          title: `${target.key.toUpperCase()} hit for ${ticker}`,
          description: `${target.key.toUpperCase()} reached at ${fmtPrice(currentPrice)} (target: ${fmtPrice(target.price)})`,
          symbol: ticker,
          signalId: signal.id,
          metadata: {
            targetKey: target.key,
            targetPrice: target.price,
            currentPrice,
            raiseStopLoss: target.raiseStopLoss || null,
            sourceApp: app?.name || null,
          },
        })
        .catch(() => {});
    }
  }

  if (stopLoss) {
    const slHit = bullish
      ? currentPrice <= stopLoss
      : currentPrice >= stopLoss;

    if (slHit && !stopLossAlreadyHit) {
      console.log(
        `[TradeMonitor] STOP LOSS HIT: ${ticker} @ ${fmtPrice(currentPrice)} (SL: ${fmtPrice(stopLoss)})`,
      );

      const updatedData = { ...(signal.data as Record<string, any>) };
      updatedData.stop_loss_hit = true;
      updatedData.stop_loss_hit_at = new Date().toISOString();
      updatedData.stop_loss_hit_price = currentPrice;
      await storage.updateSignal(signal.id, { data: updatedData, status: "stopped_out" });

      await sendStopLossHitDiscord(signal, app, stopLoss, currentPrice, ticker, data);

      storage
        .createActivity({
          type: "stop_loss_hit",
          title: `Stop loss hit for ${ticker}`,
          description: `Stop loss triggered at ${fmtPrice(currentPrice)} (SL: ${fmtPrice(stopLoss)})`,
          symbol: ticker,
          signalId: signal.id,
          metadata: {
            stopLoss,
            currentPrice,
            sourceApp: app?.name || null,
          },
        })
        .catch(() => {});
    }
  }

  const allTargetsHit = targets.length > 0 && targets.every((t) => signalHits.has(t.key));
  if (allTargetsHit) {
    await storage.updateSignal(signal.id, { status: "completed" });
    console.log(`[TradeMonitor] All targets hit for ${ticker} — signal completed`);

    storage
      .createActivity({
        type: "signal_completed",
        title: `All targets hit for ${ticker}`,
        description: `Signal completed — all ${targets.length} target(s) reached`,
        symbol: ticker,
        signalId: signal.id,
      })
      .catch(() => {});
  }
}

/**
 * Manually record a target hit for an active signal (e.g. from API or UI).
 * Updates signal data (hit_targets, stop_loss if raise_stop_loss), sends Discord, creates activity.
 * If all targets become hit, sets signal status to "completed".
 */
export async function recordManualTargetHit(
  signal: Signal,
  targetKey: string,
  currentPrice?: number | null,
): Promise<{ signal: Signal; error?: string }> {
  const data = signal.data as Record<string, any>;
  if (data.auto_track !== false) {
    return {
      signal,
      error: "Manual target hit is only allowed when auto_track is false. Disable auto tracking for this signal first.",
    };
  }
  const ticker = data.ticker || "UNKNOWN";
  const bullish = isBullishTrade(data);
  const targets = parseTargets(data, bullish);
  const target = targets.find((t) => t.key === targetKey);
  if (!target) {
    return {
      signal,
      error: `Target "${targetKey}" not found. Valid keys: ${targets.map((t) => t.key).join(", ") || "none"}`,
    };
  }
  const hitTargetsData = (data.hit_targets && typeof data.hit_targets === "object")
    ? (data.hit_targets as Record<string, unknown>)
    : {};
  if (hitTargetsData[targetKey]) {
    return { signal, error: `Target "${targetKey}" was already marked as hit` };
  }
  if (signal.status !== "active") {
    return { signal, error: `Signal is not active (status: ${signal.status}). Only active signals can have targets marked as hit.` };
  }
  const targetIdx = targets.findIndex((t) => t.key === targetKey);
  if (targetIdx > 0) {
    const prevTarget = targets[targetIdx - 1];
    if (!hitTargetsData[prevTarget.key]) {
      return { signal, error: `Cannot hit ${targetKey.toUpperCase()} before ${prevTarget.key.toUpperCase()} is hit` };
    }
  }

  let app: ConnectedApp | null = null;
  if (signal.sourceAppId) {
    app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  }

  const priceAtHit = currentPrice != null && currentPrice > 0 ? currentPrice : target.price;
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
      updated,
      app,
      target.raiseStopLoss,
      targetKey,
      priceAtHit,
      ticker,
      updatedData,
    );
    await storage.createActivity({
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
    }).catch(() => {});
  }

  const targetForDiscord = {
    key: target.key,
    price: target.price,
    takeOffPercent: target.takeOffPercent,
    raiseStopLoss: target.raiseStopLoss,
  };
  await sendTargetHitDiscordAlert(updated, app, targetForDiscord, priceAtHit, ticker, updatedData);

  await storage.createActivity({
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
  }).catch(() => {});

  const allTargetsHit = targets.every((t) =>
    t.key === targetKey || !!(updatedData.hit_targets as Record<string, unknown>)?.[t.key],
  );
  if (allTargetsHit) {
    await storage.updateSignal(signal.id, { status: "completed" });
    const completedSignal = await storage.getSignal(signal.id);
    console.log(`[TradeMonitor] All targets hit for ${ticker} (manual) — signal completed`);
    await storage.createActivity({
      type: "signal_completed",
      title: `All targets hit for ${ticker}`,
      description: `Signal completed — all ${targets.length} target(s) reached (manual)`,
      symbol: ticker,
      signalId: signal.id,
    }).catch(() => {});
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
    return { signal, error: `Signal is not active (status: ${signal.status}). Only active signals can have stop loss marked as hit.` };
  }
  const data = signal.data as Record<string, any>;
  if (data.auto_track !== false) {
    return {
      signal,
      error: "Manual stop loss hit is only allowed when auto_track is false. Disable auto tracking for this signal first.",
    };
  }
  const stopLoss = data.stop_loss != null ? Number(data.stop_loss) : null;
  if (stopLoss == null || isNaN(stopLoss)) {
    return { signal, error: "Signal has no stop_loss set. Cannot mark stop loss as hit." };
  }
  if (data.stop_loss_hit === true) {
    return { signal, error: "Stop loss was already marked as hit for this signal." };
  }

  let app: ConnectedApp | null = null;
  if (signal.sourceAppId) {
    app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  }

  const ticker = data.ticker || "UNKNOWN";
  const priceAtHit = currentPrice != null && currentPrice > 0 ? currentPrice : stopLoss;

  const updatedData = { ...data };
  updatedData.stop_loss_hit = true;
  updatedData.stop_loss_hit_at = new Date().toISOString();
  updatedData.stop_loss_hit_price = priceAtHit;
  updatedData.stop_loss_hit_manual = true;

  const updated = await storage.updateSignal(signal.id, { data: updatedData, status: "stopped_out" });
  if (!updated) return { signal, error: "Failed to update signal" };

  console.log(
    `[TradeMonitor] STOP LOSS HIT (manual): ${ticker} @ ${fmtPrice(priceAtHit)} (SL: ${fmtPrice(stopLoss)})`,
  );

  await sendStopLossHitDiscord(updated, app, stopLoss, priceAtHit, ticker, updatedData);

  await storage.createActivity({
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
  }).catch(() => {});

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
