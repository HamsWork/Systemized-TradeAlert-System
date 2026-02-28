import type { Signal, ConnectedApp } from "@shared/schema";
import { storage } from "../storage";

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color: number;
  fields?: DiscordField[];
  footer?: { text: string };
  timestamp?: string;
}

const GREEN = 0x22c55e;
const RED = 0xef4444;
const ORANGE = 0xf59e0b;
const SPACER: DiscordField = { name: "\u200b", value: "", inline: false };
const DISCLAIMER = "Disclaimer: Not financial advice. Trade at your own risk.";

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "\u2014";
  return `$${Number(p).toFixed(2)}`;
}

async function sendWebhook(
  url: string,
  content: string,
  embeds: DiscordEmbed[],
  isRetry = false,
): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content || undefined, embeds }),
    });

    if (res.status === 429 && !isRetry) {
      const body = await res.json() as { retry_after?: number };
      const retryAfter = body.retry_after ?? 1;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return sendWebhook(url, content, embeds, true);
    }

    return res.ok;
  } catch {
    return false;
  }
}

function getWebhookForInstrument(
  app: ConnectedApp,
  instrumentType: string,
): string | null {
  switch (instrumentType) {
    case "Options":
      return app.discordWebhookOptions || null;
    case "Shares":
      return app.discordWebhookShares || null;
    case "LETF":
      return app.discordWebhookLetf || null;
    default:
      return app.discordWebhookShares || null;
  }
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
const hitTargets = new Map<string, Set<string>>();

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
  const filledEntry = orders.find(
    (o) => o.status === "filled" && o.orderType === "market",
  );

  if (!filledEntry) return;

  const currentPrice = filledEntry.lastPrice;
  if (!currentPrice || currentPrice <= 0) return;

  const bullish = isBullishTrade(data);
  const targets = parseTargets(data);
  const stopLoss = data.stop_loss ? Number(data.stop_loss) : null;
  const signalHits = hitTargets.get(signal.id) || new Set<string>();
  hitTargets.set(signal.id, signalHits);

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
      signalHits.add(target.key);
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
      }

      const updatedData = { ...(signal.data as Record<string, any>) };
      if (!updatedData.hit_targets) updatedData.hit_targets = {};
      updatedData.hit_targets[target.key] = {
        hitAt: new Date().toISOString(),
        price: currentPrice,
      };
      await storage.updateSignal(signal.id, { data: updatedData });

      await sendTargetHitDiscord(signal, app, target, currentPrice, ticker, data);

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

    if (slHit && !signalHits.has("stop_loss")) {
      signalHits.add("stop_loss");
      console.log(
        `[TradeMonitor] STOP LOSS HIT: ${ticker} @ ${fmtPrice(currentPrice)} (SL: ${fmtPrice(stopLoss)})`,
      );

      await storage.updateSignal(signal.id, { status: "stopped_out" });
      hitTargets.delete(signal.id);

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
    hitTargets.delete(signal.id);
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

async function sendTargetHitDiscord(
  signal: Signal,
  app: ConnectedApp | null,
  target: TargetInfo,
  currentPrice: number,
  ticker: string,
  data: Record<string, any>,
): Promise<void> {
  if (!app || !app.sendDiscordMessages) return;

  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl) return;

  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const pnlText = entryPrice
    ? `${(((currentPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%`
    : "\u2014";

  const fields: DiscordField[] = [
    { name: "📊 Ticker", value: ticker, inline: true },
    { name: "🎯 Target", value: target.key.toUpperCase(), inline: true },
    { name: "💰 Take Off", value: `${target.takeOffPercent}%`, inline: true },
    { ...SPACER },
    { name: "📈 Current Price", value: fmtPrice(currentPrice), inline: true },
    { name: "🎯 Target Price", value: fmtPrice(target.price), inline: true },
    { name: "📊 P&L", value: pnlText, inline: true },
  ];

  if (target.raiseStopLoss) {
    fields.push({ ...SPACER });
    fields.push({
      name: "🛡️ Stop Loss Raised",
      value: fmtPrice(target.raiseStopLoss),
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    description: `**🎯 Target Hit: ${ticker} — ${target.key.toUpperCase()}**`,
    color: GREEN,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };

  const sent = await sendWebhook(webhookUrl, "", [embed]);

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "target_hit",
    embedData: { embeds: [embed] },
  }).catch(() => {});
}

async function sendStopLossHitDiscord(
  signal: Signal,
  app: ConnectedApp | null,
  stopLoss: number,
  currentPrice: number,
  ticker: string,
  data: Record<string, any>,
): Promise<void> {
  if (!app || !app.sendDiscordMessages) return;

  const instrumentType = data.instrument_type || "Shares";
  const webhookUrl = getWebhookForInstrument(app, instrumentType);
  if (!webhookUrl) return;

  const entryPrice = data.entry_price ? Number(data.entry_price) : null;
  const pnlText = entryPrice
    ? `${(((currentPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%`
    : "\u2014";

  const fields: DiscordField[] = [
    { name: "📊 Ticker", value: ticker, inline: true },
    { name: "🛑 Stop Loss", value: fmtPrice(stopLoss), inline: true },
    { name: "💰 Current Price", value: fmtPrice(currentPrice), inline: true },
    { ...SPACER },
    { name: "📉 P&L", value: pnlText, inline: true },
  ];

  const embed: DiscordEmbed = {
    description: `**🛑 Stop Loss Hit: ${ticker}**`,
    color: RED,
    fields,
    footer: { text: DISCLAIMER },
    timestamp: new Date().toISOString(),
  };

  const sent = await sendWebhook(webhookUrl, "@everyone", [embed]);

  await storage.createDiscordMessage({
    signalId: signal.id,
    webhookUrl,
    channelType: "signal",
    instrumentType,
    status: sent ? "sent" : "error",
    messageType: "stop_loss_hit",
    embedData: { embeds: [embed] },
  }).catch(() => {});
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
