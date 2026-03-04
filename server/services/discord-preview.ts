import type { Signal } from "@shared/schema";
import {
  buildSignalAlertEmbed,
  buildTargetHitEmbed,
  buildStopLossRaisedEmbed,
  buildStopLossHitEmbed,
  type DiscordEmbed,
} from "./discord";

export interface DiscordPreviewMessage {
  type: string;
  label: string;
  content: string;
  embed: DiscordEmbed;
}

export function generateDiscordPreviews(signal: Signal): DiscordPreviewMessage[] {
  const data = (signal.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "UNKNOWN";
  const previews: DiscordPreviewMessage[] = [];

  previews.push({
    type: "signal_alert",
    label: "Entry Signal",
    content: "@everyone",
    embed: buildSignalAlertEmbed(data, ticker),
  });

  const targets = data.targets && typeof data.targets === "object" ? data.targets as Record<string, { price?: number; raise_stop_loss?: { price?: number } }> : {};
  const targetEntries = Object.entries(targets)
    .filter(([, val]) => val?.price != null)
    .sort(([, a], [, b]) => Number(a.price) - Number(b.price));

  for (const [key, val] of targetEntries) {
    const price = Number(val.price);
    previews.push({
      type: "target_hit",
      label: `Target ${key.toUpperCase()} Hit`,
      content: "",
      embed: buildTargetHitEmbed(data, ticker, { key, price }),
    });
  }

  for (const [key, val] of targetEntries) {
    const newStop = val.raise_stop_loss?.price != null ? Number(val.raise_stop_loss.price) : null;
    if (newStop == null) continue;
    previews.push({
      type: "stop_loss_raised",
      label: `SL Raised (${key.toUpperCase()})`,
      content: "",
      embed: buildStopLossRaisedEmbed(data, ticker, key, newStop),
    });
  }

  const stopLoss = data.stop_loss != null ? Number(data.stop_loss) : null;
  if (stopLoss != null) {
    previews.push({
      type: "stop_loss_hit",
      label: "Stop Loss Hit",
      content: "@everyone",
      embed: buildStopLossHitEmbed(data, ticker, stopLoss),
    });
  }

  return previews;
}
