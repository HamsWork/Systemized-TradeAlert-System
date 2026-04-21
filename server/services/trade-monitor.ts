import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";
import { getLETFUnderlyingSync } from "../constants/letf";
import {
  sendTargetHitDiscordAlert,
  sendStopLossRaisedDiscord,
  sendStopLossHitDiscord,
  sendProfitMilestoneDiscordAlert,
  profitPctFromInstrument,
} from "./discord";
import { fetchStockPrice, fetchOptionContractPrice } from "./polygon";
import { executeIbkrClose } from "./trade-executor";
import { isBullishTrade } from "./signal-processor";

async function getIbkrEntryFillPrice(signalId: string, direction?: string): Promise<number | null> {
  try {
    const orders = await storage.getIbkrOrdersBySignal(signalId);
    const isShort = direction === "Short";
    const expectedSide = isShort ? "sell" : "buy";
    const entryOrder = orders
      .filter(
        (o) => o.side === expectedSide && o.status === "filled" && o.avgFillPrice != null && o.avgFillPrice > 0,
      )
      .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())[0];
    return entryOrder?.avgFillPrice ?? null;
  } catch {
    return null;
  }
}

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
  trailingStopPercent?: number;
  tpNumber?: number;
}

function hasProfitBeenAlerted(signalData: Record<string, any>): boolean {
  if (signalData.profit_alerted === true) return true;
  if ((signalData.last_milestone_alerted ?? 0) > 0) return true;
  const hitTargets = signalData.hit_targets;
  if (hitTargets && typeof hitTargets === "object" && Object.keys(hitTargets).length > 0) {
    return true;
  }
  return false;
}

function markProfitAlerted(signalData: Record<string, any>): void {
  signalData.profit_alerted = true;
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
        trailingStopPercent: t.trailing_stop_percent != null
          ? Number(t.trailing_stop_percent)
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

async function applyTargetHitAuto(
  signal: Signal,
  signalData: Record<string, any>,
  app: ConnectedApp,
  nextTarget: TargetInfo,
  nextTargetIndex: number,
  currentTrackingPrice: number,
  currentInstrumentPrice: number,
  isBullish: boolean,
): Promise<void> {
  const takeOffPct = nextTarget.takeOffPercent ?? 100;
  const prevRemainQty = signalData.remain_quantity;
  const takeOffQty = prevRemainQty * (takeOffPct / 100);
  const isFullExit = takeOffQty >= prevRemainQty - 0.001;
  const targetKey = nextTarget.key ?? `tp${nextTargetIndex + 1}`;
  signalData.hit_targets[targetKey] = {
    hitAt: new Date().toISOString(),
    trackingPrice: currentTrackingPrice,
    instrumentPrice: currentInstrumentPrice,
    profitPct: profitPctFromInstrument(
      signalData.entry_instrument_price,
      currentInstrumentPrice,
      signalData.instrument_type,
      signalData.direction,
    ),
    take_off_quantity: takeOffQty,
  };
  signalData.current_target_number = nextTargetIndex + 1;
  signalData.next_target_number = nextTargetIndex + 1;
  signalData.remain_quantity -= takeOffQty;

  const allTargetsHit = nextTargetIndex + 1 >=
    (parseTargets(signalData, isBullish).length || 0);
  const trailingPctOnTarget = nextTarget.trailingStopPercent ?? (nextTarget as any).trailing_stop_percent;
  const willActivateTrailing = trailingPctOnTarget != null && trailingPctOnTarget > 0 && signalData.remain_quantity > 0;
  if (signalData.remain_quantity <= 0) {
    signalData.status = "completed";
  } else if (allTargetsHit && !willActivateTrailing) {
    signalData.status = "completed";
  }

  if (isFullExit || signalData.status === "completed") {
    try {
      const closeResult = await executeIbkrClose(signal, app);
      if (closeResult.executed && closeResult.avgFillPrice && closeResult.avgFillPrice > 0) {
        signalData.ibkr_close_fill_price = closeResult.avgFillPrice;
        signalData.hit_targets[targetKey].ibkrCloseFillPrice = closeResult.avgFillPrice;
        console.log(
          `[TradeMonitor] IBKR close filled at $${closeResult.avgFillPrice} for ${signalData.ticker} ${targetKey}`,
        );
      } else if (closeResult.error && closeResult.error !== "No filled position to close for this signal") {
        console.warn(
          `[TradeMonitor] IBKR close failed for ${signalData.ticker}: ${closeResult.error}`,
        );
      }
    } catch (err: any) {
      console.error(`[TradeMonitor] IBKR close error for ${signalData.ticker}: ${err.message}`);
    }
  }

  await storage.updateSignal(signal.id, {
    data: signalData,
    ...(signalData.status === "completed" ? { status: "completed" } : {}),
  });

  if (takeOffPct > 0) {
    signalData.current_tp_number = (signalData.current_tp_number ?? 0) + 1;
    markProfitAlerted(signalData);
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
  if (raiseStopLoss != null) {
    const slValue = typeof raiseStopLoss === "number"
      ? raiseStopLoss
      : (raiseStopLoss?.price != null ? Number(raiseStopLoss.price) : null);
    if (slValue != null) {
      const isValidRaiseStopLoss = isBullish
        ? slValue >= signalData.stop_loss
        : slValue <= signalData.stop_loss;
      if (isValidRaiseStopLoss) {
        signalData.current_stop_loss = slValue;

        signalData.current_stop_loss_is_break_even =
          Math.abs(slValue - signalData.entry_tracking_price) < 0.01;
        signalData.risk_value = signalData.current_stop_loss_is_break_even
          ? "0% (Risk-Free)"
          : `${profitPctFromInstrument(
            signalData.entry_tracking_price,
            slValue,
            signalData.instrument_type,
            signalData.direction,
          ).toFixed(1)}%`;
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

  const trailingPct = nextTarget.trailingStopPercent ?? (nextTarget as any).trailing_stop_percent;
  if (trailingPct != null && trailingPct > 0 && signalData.status !== "completed") {
    signalData.trailing_stop_active = true;
    signalData.trailing_stop_percent = trailingPct;
    signalData.trailing_stop_high = currentTrackingPrice;
    signalData.trailing_stop_activated_at = new Date().toISOString();

    const trailingStopLevel = isBullish
      ? currentTrackingPrice * (1 - trailingPct / 100)
      : currentTrackingPrice * (1 + trailingPct / 100);
    if (
      signalData.current_stop_loss == null ||
      (isBullish ? trailingStopLevel > signalData.current_stop_loss : trailingStopLevel < signalData.current_stop_loss)
    ) {
      signalData.current_stop_loss = Math.round(trailingStopLevel * 100) / 100;
    }

    console.log(
      `[TradeMonitor] Trailing stop activated for ${signalData.ticker}: ${trailingPct}% trail from ${fmtPrice(currentTrackingPrice)}, SL at ${fmtPrice(signalData.current_stop_loss)}`,
    );
    storage.createActivity({
      type: "trailing_stop_activated",
      title: `Trailing stop activated for ${signalData.ticker}`,
      description: `${trailingPct}% trailing stop activated after ${keyLabel} hit at ${fmtPrice(currentTrackingPrice)}`,
      symbol: signalData.ticker,
      signalId: signal.id,
      metadata: { trailingStopPercent: trailingPct, activatedAt: currentTrackingPrice },
    }).catch(() => {});
  }

  const completed = signalData.status === "completed";
  await storage.updateSignal(signal.id, {
    data: signalData,
    ...(completed ? { status: "completed" } : {}),
  });
}

const MILESTONE_STEP = 10;
const MILESTONE_TRAILING_STOP_TRIGGER = 50;
const MILESTONE_TRAILING_STOP_PCT = 30;

async function checkMilestoneMode(
  signal: Signal,
  signalData: Record<string, any>,
  app: ConnectedApp,
  currentInstrumentPrice: number,
  currentTrackingPrice: number,
  isBullish: boolean,
): Promise<void> {
  const entryPrice = signalData.entry_instrument_price ?? signalData.entry_price;
  if (!entryPrice || entryPrice <= 0) return;

  const currentProfitPct = profitPctFromInstrument(
    entryPrice,
    currentInstrumentPrice,
    signalData.instrument_type || "Shares",
    signalData.direction || "Long",
  );

  const lastMilestone: number = signalData.last_milestone_alerted ?? 0;

  if (currentProfitPct >= lastMilestone + MILESTONE_STEP) {
    const highestMilestone =
      Math.floor(currentProfitPct / MILESTONE_STEP) * MILESTONE_STEP;

    signalData.current_instrument_price = currentInstrumentPrice;
    signalData.current_tracking_price = currentTrackingPrice;

    for (let m = lastMilestone + MILESTONE_STEP; m <= highestMilestone; m += MILESTONE_STEP) {
      signalData.last_milestone_alerted = m;

      if (m >= MILESTONE_TRAILING_STOP_TRIGGER && !signalData.milestone_trailing_stop_active) {
        signalData.milestone_trailing_stop_active = true;
        signalData.milestone_trailing_stop_percent = MILESTONE_TRAILING_STOP_PCT;
        signalData.milestone_trailing_stop_high = currentInstrumentPrice;
        const trailAmount = Math.round(entryPrice * (MILESTONE_TRAILING_STOP_PCT / 100) * 100) / 100;
        const trailingStopPrice = isBullish
          ? Math.round((currentInstrumentPrice - trailAmount) * 100) / 100
          : Math.round((currentInstrumentPrice + trailAmount) * 100) / 100;
        signalData.milestone_trailing_stop_amount = trailAmount;
        signalData.current_stop_loss = trailingStopPrice;
        console.log(
          `[TradeMonitor] Milestone trailing stop activated for ${signalData.ticker} at +${m}%: high=${fmtPrice(currentInstrumentPrice)}, trail=$${trailAmount} (${MILESTONE_TRAILING_STOP_PCT}% of entry ${fmtPrice(entryPrice)}), SL=${fmtPrice(trailingStopPrice)}`,
        );
      }

      await storage.updateSignal(signal.id, { data: signalData });

      markProfitAlerted(signalData);
      await sendProfitMilestoneDiscordAlert(signalData, app, signal.id, m);

      storage.createActivity({
        type: "profit_milestone",
        title: `+${m}% profit milestone for ${signalData.ticker}`,
        description: `Profit reached +${currentProfitPct.toFixed(1)}% (milestone: +${m}%) at instrument price ${fmtPrice(currentInstrumentPrice)}`,
        symbol: signalData.ticker,
        signalId: signal.id,
        metadata: { milestonePct: m, currentProfitPct },
      }).catch(() => {});

      console.log(
        `[TradeMonitor] Milestone +${m}% hit for ${signalData.ticker} (actual: +${currentProfitPct.toFixed(1)}%)`,
      );
    }
  }

  if (signalData.milestone_trailing_stop_active && signalData.milestone_trailing_stop_percent > 0) {
    const trailAmount = signalData.milestone_trailing_stop_amount
      ?? Math.round(entryPrice * (signalData.milestone_trailing_stop_percent / 100) * 100) / 100;
    signalData.milestone_trailing_stop_amount = trailAmount;

    const prevHigh = signalData.milestone_trailing_stop_high ?? currentInstrumentPrice;
    const newHigh = isBullish
      ? Math.max(prevHigh, currentInstrumentPrice)
      : Math.min(prevHigh, currentInstrumentPrice);

    if (newHigh !== prevHigh) {
      signalData.milestone_trailing_stop_high = newHigh;
      const newTrailingStop = isBullish
        ? Math.round((newHigh - trailAmount) * 100) / 100
        : Math.round((newHigh + trailAmount) * 100) / 100;

      const isTighter = signalData.current_stop_loss == null
        || (isBullish ? newTrailingStop > signalData.current_stop_loss : newTrailingStop < signalData.current_stop_loss);

      if (isTighter) {
        signalData.current_stop_loss = newTrailingStop;
        await storage.updateSignal(signal.id, { data: signalData });
        console.log(
          `[TradeMonitor] Milestone trailing stop updated for ${signalData.ticker}: high=${fmtPrice(newHigh)}, trail=$${trailAmount}, SL=${fmtPrice(newTrailingStop)}`,
        );
      }
    }
  }

  if (signalData.current_stop_loss) {
    const stopLossHit = isBullish
      ? currentTrackingPrice <= signalData.current_stop_loss
      : currentTrackingPrice >= signalData.current_stop_loss;

    if (stopLossHit) {
      const currentMilestone = signalData.last_milestone_alerted ?? 0;
      const hadProfitMilestone = currentMilestone > 0;
      const finalStatus = hadProfitMilestone ? "closed" : "stopped_out";

      signalData.status = finalStatus;
      signalData.stop_loss_hit = true;
      signalData.stop_loss_hit_at = new Date().toISOString();
      signalData.stop_loss_hit_tracking_price = currentTrackingPrice;
      signalData.stop_loss_hit_instrument_price = currentInstrumentPrice;
      signalData.remain_quantity = 0;
      signalData.current_stop_loss_percent = profitPctFromInstrument(
        entryPrice, currentInstrumentPrice, signalData.instrument_type, signalData.direction,
      );

      try {
        const closeResult = await executeIbkrClose(signal, app);
        if (closeResult.executed && closeResult.avgFillPrice && closeResult.avgFillPrice > 0) {
          signalData.ibkr_close_fill_price = closeResult.avgFillPrice;
          signalData.stop_loss_hit_ibkr_fill_price = closeResult.avgFillPrice;
        }
      } catch (err: any) {
        console.error(`[TradeMonitor] IBKR close error for ${signalData.ticker} (milestone SL): ${err.message}`);
      }

      await storage.updateSignal(signal.id, { data: signalData, status: finalStatus });

      const shouldAlertStopLoss = !hasProfitBeenAlerted(signalData);
      if (shouldAlertStopLoss) {
        await sendStopLossHitDiscord(signalData, app, signal.id);
      }

      const slLabel = hadProfitMilestone
        ? `Trailing stop hit after +${currentMilestone}% milestone — closed with profit`
        : "Stop loss hit — no milestones reached";
      storage.createActivity({
        type: hadProfitMilestone ? "trade_closed" : "stop_loss_hit",
        title: hadProfitMilestone
          ? `Trade closed for ${signalData.ticker} (trailing stop after +${currentMilestone}%)`
          : `Stop loss hit for ${signalData.ticker}`,
        description: `${slLabel} at ${fmtPrice(currentTrackingPrice)} (SL: ${fmtPrice(signalData.current_stop_loss)})`,
        symbol: signalData.ticker,
        signalId: signal.id,
        metadata: { lastMilestone: currentMilestone, alertSent: shouldAlertStopLoss, finalStatus },
      }).catch(() => {});

      console.log(
        `[TradeMonitor] ${signalData.ticker} ten_percent ${finalStatus}: milestone=+${currentMilestone}%, exit=${fmtPrice(currentTrackingPrice)}`,
      );
    }
  }
}

async function checkSignalTargets(signal: Signal): Promise<void> {
  if (signal.status !== "active") return;
  const signalData = signal.data as Record<string, any>;
  if (!isAutoTrackEnabled(signalData)) return;
  if (signal.sourceAppId == null) return;
  const app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  if (!app) return;

  const isBullish = signalData.underlying_price_based
    ? signalData.direction === "Long" || signalData.direction === "Call"
    : signalData.instrument_type === "Shares"
      ? signalData.direction === "Long"
      : true;

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

  if (signalData.ibkr_fill_price == null) {
    const fillPrice = await getIbkrEntryFillPrice(signal.id, signalData.direction);
    if (fillPrice != null) {
      const prevEntry = signalData.entry_instrument_price;
      signalData.ibkr_fill_price = fillPrice;
      signalData.entry_instrument_price = fillPrice;
      console.log(
        `[TradeMonitor] Using IBKR fill price $${fillPrice} for ${signalData.ticker} (was Polygon snapshot $${prevEntry})`,
      );
      await storage.updateSignal(signal.id, { data: signalData });
    }
  }

  if (signalData.alert_mode === "ten_percent") {
    await checkMilestoneMode(signal, signalData, app, currentInstrumentPrice, currentTrackingPrice, isBullish);
    return;
  } else if (signalData.alert_mode === "normal") {

    const tpLevels = parseTargets(signalData, isBullish);
    const nextTargetIndex = signalData.next_target_number ?? 0;
    if (tpLevels.length > 0 && nextTargetIndex < tpLevels.length) {
      const nextTarget = tpLevels[nextTargetIndex];
      const nextTargetHit = isBullish ? currentTrackingPrice >= nextTarget.price : currentTrackingPrice <= nextTarget.price;
      if (nextTargetHit) {
        await applyTargetHitAuto(
          signal,
          signalData,
          app,
          nextTarget,
          nextTargetIndex,
          currentTrackingPrice,
          currentInstrumentPrice,
          isBullish,
        );
      }
    }

    if (signalData.trailing_stop_active && signalData.trailing_stop_percent > 0) {
      const trailPct = signalData.trailing_stop_percent;
      const prevHigh = signalData.trailing_stop_high ?? currentTrackingPrice;
      const newHigh = isBullish
        ? Math.max(prevHigh, currentTrackingPrice)
        : Math.min(prevHigh, currentTrackingPrice);

      if (newHigh !== prevHigh) {
        signalData.trailing_stop_high = newHigh;
        const newTrailingStop = isBullish
          ? Math.round(newHigh * (1 - trailPct / 100) * 100) / 100
          : Math.round(newHigh * (1 + trailPct / 100) * 100) / 100;

        if (
          signalData.current_stop_loss == null ||
          (isBullish ? newTrailingStop > signalData.current_stop_loss : newTrailingStop < signalData.current_stop_loss)
        ) {
          signalData.current_stop_loss = newTrailingStop;
          signalData.current_stop_loss_is_break_even =
            Math.abs(newTrailingStop - (signalData.entry_tracking_price ?? signalData.entry_price ?? 0)) < 0.01;
          signalData.risk_value = signalData.current_stop_loss_is_break_even
            ? "0% (Risk-Free)"
            : `${profitPctFromInstrument(
              signalData.entry_tracking_price ?? signalData.entry_price,
              newTrailingStop,
              signalData.instrument_type,
              signalData.direction,
            ).toFixed(1)}%`;
          await storage.updateSignal(signal.id, { data: signalData });
        }
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
        signalData.current_stop_loss_percent = profitPctFromInstrument(signalData.entry_instrument_price, currentInstrumentPrice, signalData.instrument_type, signalData.direction);

        try {
          const closeResult = await executeIbkrClose(signal, app);
          if (closeResult.executed && closeResult.avgFillPrice && closeResult.avgFillPrice > 0) {
            signalData.ibkr_close_fill_price = closeResult.avgFillPrice;
            signalData.stop_loss_hit_ibkr_fill_price = closeResult.avgFillPrice;
            console.log(
              `[TradeMonitor] IBKR close filled at $${closeResult.avgFillPrice} for ${signalData.ticker} (stop loss)`,
            );
          } else if (closeResult.error && closeResult.error !== "No filled position to close for this signal") {
            console.warn(
              `[TradeMonitor] IBKR close failed for ${signalData.ticker} (stop loss): ${closeResult.error}`,
            );
          }
        } catch (err: any) {
          console.error(`[TradeMonitor] IBKR close error for ${signalData.ticker} (stop loss): ${err.message}`);
        }

        await storage.updateSignal(signal.id, { data: signalData, status: "stopped_out" });

        const shouldAlertStopLoss = !hasProfitBeenAlerted(signalData);
        if (shouldAlertStopLoss) {
          await sendStopLossHitDiscord(signalData, app, signal.id);
        }
        const slType = signalData.trailing_stop_active ? "Trailing stop" : "Stop loss";
        storage.createActivity({
          type: "stop_loss_hit",
          title: `${slType} hit for ${signalData.ticker}`,
          description: `${slType} triggered at ${fmtPrice(currentTrackingPrice)} (SL: ${fmtPrice(signalData.current_stop_loss)})${signalData.trailing_stop_active ? ` [${signalData.trailing_stop_percent}% trail]` : ""}`,
          symbol: signalData.ticker,
          signalId: signal.id,
        }).catch(() => {});
      }
    }
  } else {
    console.log("No alert mode found for signal", signal.id);
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
  fullExit: boolean = false,
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
  const bullish = isBullishTrade(signal.data as StoredSignalData);
  const targets = parseTargets(data, bullish);
  console.log("targets", targets);
  console.log("data", data);
  if (targets.length === 0) {
    return { signal, error: "Signal has no targets defined." };
  }

  // Determine the next target to hit based on the signal's current_target_number.
  // This keeps manual hits aligned with the auto-tracking progression.
  const current_target_number = data.current_target_number ?? 0;
  const next_target_number = current_target_number + 1;
  if (next_target_number > targets.length) {
    return { signal, error: "All targets have already been hit." };
  }
  const nextTargetIndex = next_target_number - 1;
  const nextTarget = targets[nextTargetIndex];
  if (!nextTarget) {
    return { signal, error: "No next target found." };
  }

  const currentInstrumentPrice =
    typeof currentPrice === "number" && currentPrice > 0
      ? currentPrice
      : await getCurrentInstrumentPrice(data, ticker);

  const underlyingTicker = getUnderlyingTicker(data) || ticker;
  const currentTrackingPrice = data.underlying_price_based
    ? await fetchStockPrice(underlyingTicker)
    : currentInstrumentPrice;

  if (!currentTrackingPrice || !currentInstrumentPrice) {
    return { signal, error: "Failed to resolve current prices for manual target hit." };
  }

  let app: ConnectedApp | null = null;
  if (signal.sourceAppId) {
    app = (await storage.getConnectedApp(signal.sourceAppId)) || null;
  }

  const updatedData = { ...data };
  if (!updatedData.hit_targets) updatedData.hit_targets = {};
  updatedData.current_tracking_price = currentTrackingPrice;
  updatedData.current_instrument_price = currentInstrumentPrice;

  // Reuse the same applyTargetHitAuto logic used by the auto-tracker so that
  // manual hits behave identically.
  await applyTargetHitAuto(
    signal,
    updatedData,
    app as ConnectedApp,
    {
      key: nextTarget.key,
      price: nextTarget.price,
      takeOffPercent: nextTarget.takeOffPercent,
      raiseStopLoss: nextTarget.raiseStopLoss,
      trailingStopPercent: nextTarget.trailingStopPercent,
    } as TargetInfo,
    nextTargetIndex,
    currentTrackingPrice,
    currentInstrumentPrice,
    bullish,
  );

  const latest = await storage.getSignal(signal.id);
  return { signal: latest || signal };
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
  const underlyingTicker = getUnderlyingTicker(data) || ticker;

  let resolvedInstrumentPrice: number | null = null;
  if (typeof currentPrice === "number" && currentPrice > 0) {
    resolvedInstrumentPrice = currentPrice;
  } else {
    resolvedInstrumentPrice = await getCurrentInstrumentPrice(data, ticker);
  }

  let resolvedTrackingPrice: number | null = null;
  if (data.underlying_price_based) {
    resolvedTrackingPrice = await fetchStockPrice(underlyingTicker);
  } else {
    resolvedTrackingPrice = resolvedInstrumentPrice;
  }

  const priceAtHit =
    resolvedTrackingPrice != null && resolvedTrackingPrice > 0
      ? resolvedTrackingPrice
      : stopLoss;

  const updatedData = { ...data };
  updatedData.stop_loss_hit = true;
  updatedData.stop_loss_hit_at = new Date().toISOString();
  updatedData.stop_loss_hit_price = priceAtHit;
  updatedData.stop_loss_hit_manual = true;

  if (resolvedInstrumentPrice != null && resolvedInstrumentPrice > 0) {
    updatedData.current_instrument_price = resolvedInstrumentPrice;
  }
  if (resolvedTrackingPrice != null && resolvedTrackingPrice > 0) {
    updatedData.current_tracking_price = resolvedTrackingPrice;
  }

  const updated = await storage.updateSignal(signal.id, {
    data: updatedData,
    status: "stopped_out",
  });
  if (!updated) return { signal, error: "Failed to update signal" };

  console.log(
    `[TradeMonitor] STOP LOSS HIT (manual): ${ticker} @ ${fmtPrice(priceAtHit)} (SL: ${fmtPrice(stopLoss)})`,
  );

  if (!hasProfitBeenAlerted(updatedData)) {
    await sendStopLossHitDiscord(updatedData, app, signal.id);
  }

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
