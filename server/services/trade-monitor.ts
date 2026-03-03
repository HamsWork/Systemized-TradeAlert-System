import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { sendTargetHitDiscordAlert, sendStopLossRaisedDiscord, sendStopLossHitDiscord } from "./discord";
import { fetchStockPrice, fetchOptionContractPrice } from "./polygon";

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

function parseTargets(data: Record<string, any>): TargetInfo[] {
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
    .sort((a, b) => a.price - b.price);
}

function isBullishTrade(data: Record<string, any>): boolean {
  const instrumentType = data.instrument_type || "Shares";
  if (instrumentType === "Options") {
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

async function checkSignalTargets(signal: Signal): Promise<void> {
  const data = signal.data as Record<string, any>;
  const ticker = data.ticker;
  if (!ticker) return;

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

  if (!currentPrice || currentPrice <= 0) {
    const instrumentType = data.instrument_type || "Shares";
    if (instrumentType === "Options" && data.strike != null && data.expiration && data.direction) {
      const right = data.direction === "Put" ? "P" : "C";
      const strikeNum = Number(data.strike);
      const result = await fetchOptionContractPrice(ticker, data.expiration, strikeNum, right);
      currentPrice = result.price ?? null;
    } else {
      currentPrice = await fetchStockPrice(ticker);
    }
  }
  if (!currentPrice || currentPrice <= 0) return;

  const bullish = isBullishTrade(data);
  const targets = parseTargets(data);
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

  for (const target of targets) {
    if (signalHits.has(target.key)) continue;

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
