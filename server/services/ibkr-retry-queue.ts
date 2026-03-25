import type { Signal, ConnectedApp } from "@shared/schema";
import { executeIbkrTrade } from "./trade-executor";
import { storage } from "../storage";

interface RetryEntry {
  signalId: string;
  appId: string;
  quantity: number;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  queuedAt: number;
  lastError: string;
}

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [15_000, 30_000, 60_000, 120_000, 300_000];
const RETRY_CHECK_INTERVAL = 10_000;
const MAX_SIGNAL_AGE_MS = 10 * 60 * 1000;

const retryQueue: Map<string, RetryEntry> = new Map();
let retryInterval: ReturnType<typeof setInterval> | null = null;

export function queueIbkrRetry(
  signalId: string,
  appId: string,
  quantity: number,
  error: string,
): void {
  if (retryQueue.has(signalId)) {
    console.log(`[IBKR Retry] Signal ${signalId} already in retry queue, skipping`);
    return;
  }

  const entry: RetryEntry = {
    signalId,
    appId,
    quantity,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRetryAt: Date.now() + RETRY_DELAYS[0],
    queuedAt: Date.now(),
    lastError: error,
  };

  retryQueue.set(signalId, entry);
  console.log(
    `[IBKR Retry] Queued signal ${signalId} for retry (next attempt in ${RETRY_DELAYS[0] / 1000}s)`,
  );

  storage.createActivity({
    type: "ibkr_retry_queued",
    title: `IBKR trade queued for retry`,
    description: `Initial attempt failed: ${error}. Will retry up to ${MAX_ATTEMPTS} times.`,
    signalId,
    metadata: { error, maxAttempts: MAX_ATTEMPTS },
  }).catch(() => {});
}

export function getRetryQueueStatus(): {
  queueSize: number;
  entries: Array<{
    signalId: string;
    attempts: number;
    maxAttempts: number;
    nextRetryIn: number;
    lastError: string;
  }>;
} {
  const entries = Array.from(retryQueue.values()).map((e) => ({
    signalId: e.signalId,
    attempts: e.attempts,
    maxAttempts: e.maxAttempts,
    nextRetryIn: Math.max(0, e.nextRetryAt - Date.now()),
    lastError: e.lastError,
  }));
  return { queueSize: retryQueue.size, entries };
}

async function processRetryQueue(): Promise<void> {
  const now = Date.now();

  for (const [signalId, entry] of retryQueue) {
    if (now < entry.nextRetryAt) continue;

    const signal = await storage.getSignal(signalId).catch(() => null);
    if (!signal) {
      console.log(`[IBKR Retry] Signal ${signalId} no longer exists, removing from queue`);
      retryQueue.delete(signalId);
      continue;
    }

    if (signal.status !== "active") {
      console.log(`[IBKR Retry] Signal ${signalId} status is ${signal.status}, removing from queue`);
      retryQueue.delete(signalId);
      continue;
    }

    const signalData = signal.data as Record<string, any>;

    if (signalData.ibkr_fill_price != null) {
      console.log(`[IBKR Retry] Signal ${signalId} already has IBKR fill, removing from queue`);
      retryQueue.delete(signalId);
      continue;
    }

    const signalAge = now - entry.queuedAt;
    if (signalAge > MAX_SIGNAL_AGE_MS) {
      console.log(`[IBKR Retry] Signal ${signalId} is too old (${Math.round(signalAge / 1000)}s), abandoning`);
      retryQueue.delete(signalId);
      storage.createActivity({
        type: "ibkr_retry_expired",
        title: `IBKR retry expired for ${signalData.ticker || "UNKNOWN"}`,
        description: `Signal too old (${Math.round(signalAge / 60000)}min). Gave up after ${entry.attempts} attempts. Last error: ${entry.lastError}`,
        symbol: signalData.ticker,
        signalId,
        metadata: { attempts: entry.attempts, lastError: entry.lastError, ageMs: signalAge },
      }).catch(() => {});
      continue;
    }

    const app = entry.appId ? await storage.getConnectedApp(entry.appId).catch(() => null) : null;
    if (!app) {
      console.log(`[IBKR Retry] App ${entry.appId} not found for signal ${signalId}, removing`);
      retryQueue.delete(signalId);
      continue;
    }

    entry.attempts++;
    console.log(
      `[IBKR Retry] Attempt ${entry.attempts}/${entry.maxAttempts} for ${signalData.ticker} (signal ${signalId})`,
    );

    try {
      const tradeExecution = await executeIbkrTrade(signal, app, entry.quantity);

      if (tradeExecution.executed && tradeExecution.trade) {
        const t = tradeExecution.trade;
        console.log(
          `[IBKR Retry] SUCCESS on attempt ${entry.attempts}: ${t.side} ${t.quantity} ${t.symbol} | orderId=${t.orderId}`,
        );

        if (t.avgFillPrice && t.avgFillPrice > 0) {
          const prevEntry = signalData.entry_instrument_price;
          signalData.ibkr_fill_price = t.avgFillPrice;
          signalData.entry_instrument_price = t.avgFillPrice;
          console.log(
            `[IBKR Retry] Saved fill price $${t.avgFillPrice} (was $${prevEntry})`,
          );
          await storage.updateSignal(signal.id, { data: signalData });
        }

        retryQueue.delete(signalId);

        storage.createActivity({
          type: "ibkr_retry_success",
          title: `IBKR retry succeeded for ${signalData.ticker}`,
          description: `Trade executed on attempt ${entry.attempts}: ${t.side} ${t.quantity} ${t.symbol} @ $${t.avgFillPrice ?? "MKT"}`,
          symbol: signalData.ticker,
          signalId,
          metadata: {
            attempt: entry.attempts,
            orderId: t.orderId,
            fillPrice: t.avgFillPrice,
            sourceApp: app.name,
          },
        }).catch(() => {});
        continue;
      }

      entry.lastError = tradeExecution.error || "Unknown error";
      console.error(
        `[IBKR Retry] Attempt ${entry.attempts} failed for ${signalData.ticker}: ${entry.lastError}`,
      );
    } catch (err: any) {
      entry.lastError = err.message;
      console.error(
        `[IBKR Retry] Attempt ${entry.attempts} error for ${signalData.ticker}: ${err.message}`,
      );
    }

    if (entry.attempts >= entry.maxAttempts) {
      console.error(
        `[IBKR Retry] Exhausted all ${entry.maxAttempts} attempts for ${signalData.ticker} (signal ${signalId})`,
      );
      retryQueue.delete(signalId);

      storage.createActivity({
        type: "ibkr_retry_failed",
        title: `IBKR retry exhausted for ${signalData.ticker}`,
        description: `All ${entry.maxAttempts} retry attempts failed. Last error: ${entry.lastError}`,
        symbol: signalData.ticker,
        signalId,
        metadata: {
          attempts: entry.attempts,
          lastError: entry.lastError,
          sourceApp: app.name,
        },
      }).catch(() => {});
    } else {
      const delayIndex = Math.min(entry.attempts, RETRY_DELAYS.length - 1);
      entry.nextRetryAt = now + RETRY_DELAYS[delayIndex];
      console.log(
        `[IBKR Retry] Next attempt for ${signalData.ticker} in ${RETRY_DELAYS[delayIndex] / 1000}s`,
      );
    }
  }
}

export function startIbkrRetryQueue(): void {
  if (retryInterval) return;
  console.log("[IBKR Retry] Starting retry queue...");
  retryInterval = setInterval(() => {
    processRetryQueue().catch((err) => {
      console.error(`[IBKR Retry] Queue processing error: ${err.message}`);
    });
  }, RETRY_CHECK_INTERVAL);
}

export function stopIbkrRetryQueue(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
}
