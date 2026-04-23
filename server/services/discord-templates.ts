import { getLETFLeverage, getLETFUnderlyingSync } from "../constants/letf";

export interface TemplateEmbed {
  description?: string;
  color: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  timestamp?: boolean;
  image?: { url: string };
  thumbnail?: { url: string };
}

// Store the literal escape sequence so it shows as "\u200b" in JSON,
// and convert it back to a real zero-width space only when rendering.
const ZWS = "\\u200b";
const SPACER_FIELD = { name: ZWS, value: "", inline: false } as const;

export interface MessageTemplate {
  type: string;
  label: string;
  content: string;
  embed: TemplateEmbed;
}

export interface TemplateGroupWithVars {
  instrumentType: string;
  ticker: string;
  templates: MessageTemplate[];
}

const GREEN = "#22c55e";
const RED = "#ef4444";
const ORANGE = "#f59e0b";
const GRAY = "#6b7280";
const DISCLAIMER = "Disclaimer: Not financial advice. Trade at your own risk.";

function optionsEntryTemplate(): TemplateEmbed {
  const result: TemplateEmbed = {
    description: "**🚨 {{ticker}} Options Entry - {{trade_type}} Trade**",
    color: GREEN,
    fields: [
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📊 Stock Price", value: "{{stock_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
      { name: "💵 Option Price", value: "{{option_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📝 Trade Plan", value: "{{trade_plan}}", inline: false },
      { ...SPACER_FIELD },
      { name: "💰 Take Profit Plan", value: "{{take_profit_plan}}", inline: false },
    ],
    footer: DISCLAIMER,
  };
  
  return result;
}

function sharesEntryTemplate(): TemplateEmbed {
  return {
    description: "**🚨 {{ticker}} Shares Entry - {{trade_type}} Trade**",
    color: GREEN,
    fields: [
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📊 Stock Price", value: "{{stock_price}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📝 Trade Plan", value: "{{trade_plan}}", inline: false },
      { ...SPACER_FIELD },
      { name: "💰 Take Profit Plan", value: "{{take_profit_plan}}", inline: false },
    ],
    footer: DISCLAIMER,
  };
}

function letfEntryTemplate(): TemplateEmbed {
  return {
    description: "**🚨 {{underlying}} Shares Entry - {{trade_type}} Trade**",
    color: GREEN,
    fields: [
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{underlying}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📹 LETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { name: "💰 LETF Entry", value: "{{letf_entry}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📝 Trade Plan", value: "{{trade_plan}}", inline: false },
      { ...SPACER_FIELD },
      { name: "💰 Take Profit Plan", value: "{{take_profit_plan}}", inline: false },
    ],
    footer: DISCLAIMER,
  };
}

function letfOptionEntryTemplate(): TemplateEmbed {
  return {
    description: "**🚨 {{underlying}} Options Entry - {{trade_type}} Trade**",
    color: GREEN,
    fields: [
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{underlying}}", inline: true },
      { name: "📊 LETF Price", value: "{{stock_price}}", inline: true },
      { name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { ...SPACER_FIELD },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
      { name: "💵 Option Price", value: "{{option_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📝 Trade Plan", value: "{{trade_plan}}", inline: false },
      { ...SPACER_FIELD },
      { name: "💰 Take Profit Plan", value: "{{take_profit_plan}}", inline: false },
    ],
    footer: DISCLAIMER,
  };
}

function cryptoEntryTemplate(): TemplateEmbed {
  return {
    description: "**🚨 {{ticker}} Crypto Entry - {{trade_type}} Trade**",
    color: GREEN,
    fields: [
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { name: "💵 Entry Price", value: "{{entry_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📝 Trade Plan", value: "{{trade_plan}}", inline: false },
      { ...SPACER_FIELD },
      { name: "💰 Take Profit Plan", value: "{{take_profit_plan}}", inline: false },
    ],
    footer: DISCLAIMER,
  };
}

function targetHitTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : instrumentType === "Crypto" ? "Crypto" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  const fields: TemplateEmbed["fields"] = [{ ...SPACER_FIELD }];

  if (instrumentType === "LETF") {
    fields.push({ name: "💹 LETF: {{letf_ticker}} ({{leverage}}x {{letf_direction}})", value: "", inline: true });
    fields.push({ ...SPACER_FIELD });
  } else if (instrumentType === "LETF Option") {
    fields.push({ name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true });
    fields.push({ name: "❌ Expiration", value: "{{expiry}}", inline: true });
    fields.push({ name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true });
  } else if (instrumentType === "Options") {
    fields.push({ name: "❌ Expiration", value: "{{expiry}}", inline: true });
    fields.push({ name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true });
    fields.push({ name: "💵 Option Price", value: "{{tp_price}}", inline: true });
  }

  fields.push(
    { name: "✅ Entry", value: "{{entry_price}}", inline: true },
    { name: "🎯 TP{{tp_number}} Hit", value: "{{tp_price}}", inline: true },
    { name: "💸 Profit", value: "{{profit_pct}}", inline: true },
    { ...SPACER_FIELD },
    { name: "🚨 Status: TP{{tp_number}} Reached 🚨", value: "​", inline: false },
    { name: "🔍 Position Management", value: "{{position_mgmt}}", inline: false },
    { ...SPACER_FIELD },
    { name: "🛡️ Risk Management", value: "{{risk_mgmt}}", inline: false },
  );

  return {
    description: `**🎯 ${tickerVar} ${label} Take Profit {{tp_number}} HIT**`,
    color: GREEN,
    fields,
    footer: DISCLAIMER,
  };
}

function stopLossRaisedTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : instrumentType === "Crypto" ? "Crypto" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  const fields: TemplateEmbed["fields"] = [{ ...SPACER_FIELD }];

  if (instrumentType === "LETF") {
    fields.push({ name: "💹 LETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true });
    fields.push({ name: "💵 LETF Entry", value: "{{letf_entry}}", inline: true });
    fields.push({ name: "📊 Underlying Price", value: "{{stock_price}}", inline: true });
  } else if (instrumentType === "LETF Option") {
    fields.push({ name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true });
    fields.push({ name: "❌ Expiration", value: "{{expiry}}", inline: true });
    fields.push({ name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true });
  } else if (instrumentType === "Options") {
    fields.push({ name: "❌ Expiration", value: "{{expiry}}", inline: true });
    fields.push({ name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true });
    fields.push({ name: "💵 Option Price", value: "{{option_price}}", inline: true });
  }

  fields.push(
    { name: "✅ Entry", value: "{{entry_price}}", inline: true },
    { name: "🛡️ New Stop", value: "{{new_stop_loss}}", inline: true },
    { name: "💸 Risk", value: "{{risk_value}}", inline: true },
    { ...SPACER_FIELD },
    { name: "🚨 Status: Stop Loss Raised 🚨", value: "​", inline: false },
    { name: "🛡️ Risk Management", value: "{{risk_mgmt}}", inline: false },
  );

  return {
    description: `**🛡️ ${tickerVar} ${label} Stop Loss Raised**`,
    color: ORANGE,
    fields,
    footer: DISCLAIMER,
  };
}

function stopLossHitTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : instrumentType === "Crypto" ? "Crypto" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  const fields: TemplateEmbed["fields"] = [{ ...SPACER_FIELD }];

  if (instrumentType === "LETF") {
    fields.push({ name: "💹 LETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true });
    fields.push({ name: "💵 LETF Entry", value: "{{letf_entry}}", inline: true });
    fields.push({ name: "📊 Underlying Price", value: "{{stock_price}}", inline: true });
  } else if (instrumentType === "LETF Option") {
    fields.push({ name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true });
    fields.push({ name: "❌ Expiration", value: "{{expiry}}", inline: true });
    fields.push({ name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true });
  } else if (instrumentType === "Options") {
    fields.push({ name: "❌ Expiration", value: "{{expiry}}", inline: true });
    fields.push({ name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true });
    fields.push({ name: "💵 Option Price", value: "{{exit_price}}", inline: true });
  }

  fields.push(
    { name: "✅ Entry", value: "{{entry_price}}", inline: true },
    { name: "🛑 Stop Hit", value: "{{exit_price}}", inline: true },
    { name: "💸 Result", value: "{{profit_pct}}", inline: true },
    { ...SPACER_FIELD },
    { name: "🚨 Status: Position Closed 🚨", value: "​", inline: false },
    { name: "🛡️ Discipline Matters", value: "Following the plan keeps you in the game for winning trades", inline: false },
  );

  return {
    description: `**🛑 ${tickerVar} ${label} Stop Loss HIT**`,
    color: RED,
    fields,
    footer: DISCLAIMER,
    timestamp: true,
  };
}


function tenPctEntryTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  const fields: TemplateEmbed["fields"] = [];

  if (instrumentType === "Options") {
    fields.push(
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📊 Stock Price", value: "{{stock_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
      { name: "💵 Option Price", value: "{{option_price}}", inline: true },
      { ...SPACER_FIELD },
    );
  } else if (instrumentType === "Shares") {
    fields.push(
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📊 Stock Price", value: "{{stock_price}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { ...SPACER_FIELD },
    );
  } else if (instrumentType === "LETF") {
    fields.push(
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{underlying}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📹 LETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { name: "💰 LETF Entry", value: "{{letf_entry}}", inline: true },
      { ...SPACER_FIELD },
    );
  } else if (instrumentType === "LETF Option") {
    fields.push(
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{underlying}}", inline: true },
      { name: "📊 LETF Price", value: "{{stock_price}}", inline: true },
      { name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { ...SPACER_FIELD },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
      { name: "💵 Option Price", value: "{{option_price}}", inline: true },
      { ...SPACER_FIELD },
    );
  } else if (instrumentType === "Crypto") {
    fields.push(
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { name: "💵 Entry Price", value: "{{entry_price}}", inline: true },
      { ...SPACER_FIELD },
    );
  }

  fields.push({ name: "🛑 Stop Loss", value: "{{stop_loss}}", inline: true });
  fields.push({ ...SPACER_FIELD });
  fields.push({ name: "📝 Notes", value: "{{trade_plan}}", inline: false });

  return {
    description: `**🚨 ${tickerVar} ${label} Entry**`,
    color: GREEN,
    fields,
    footer: DISCLAIMER,
  };
}

function tenPctMilestoneTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  const fields: TemplateEmbed["fields"] = [];

  if (instrumentType === "LETF") {
    fields.push(
      { name: "💹 LETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { name: "💵 LETF Entry", value: "{{letf_entry}}", inline: true },
      { name: "📊 Underlying Price", value: "{{stock_price}}", inline: true },
    );
  } else if (instrumentType === "LETF Option") {
    fields.push(
      { name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
    );
  } else if (instrumentType === "Options") {
    fields.push(
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
    );
  } else {
    fields.push(
      { name: "📊 Direction", value: "{{direction}}", inline: true },
    );
  }

  fields.push(
    { name: "📈 Entry Price", value: "{{entry_price}}", inline: true },
    { name: "💵 Current Price", value: "{{current_price}}", inline: true },
    { name: "📊 Profit", value: "{{current_profit_pct}}", inline: true },
    { ...SPACER_FIELD },
    { name: "{{milestone_title}}", value: "{{milestone_text}}", inline: false },
  );

  return {
    description: `**💰 ${tickerVar} ${label} +{{milestone_pct}}% Profit Milestone**`,
    color: GREEN,
    fields,
    footer: "{{milestone_footer}}",
    thumbnail: { url: "{{milestone_image}}" },
  };
}

function currentStatusTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : instrumentType === "Crypto" ? "Crypto" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  const fields: TemplateEmbed["fields"] = [{ ...SPACER_FIELD }];

  if (instrumentType === "Options") {
    fields.push(
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📊 Stock Price", value: "{{stock_price}}", inline: true },
      { name: "💵 Option Price", value: "{{current_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
    );
  } else if (instrumentType === "LETF Option") {
    fields.push(
      { name: "🟢 Ticker", value: "{{underlying}}", inline: true },
      { name: "💹 Leveraged ETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { name: "💵 Option Price", value: "{{current_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "❌ Expiration", value: "{{expiry}}", inline: true },
      { name: "✍️ Strike", value: "{{strike}} {{right}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
    );
  } else if (instrumentType === "LETF") {
    fields.push(
      { name: "🟢 Ticker", value: "{{underlying}}", inline: true },
      { name: "💹 LETF", value: "{{letf_ticker}} ({{leverage}}x {{letf_direction}})", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { ...SPACER_FIELD },
      { name: "📊 Underlying Price", value: "{{stock_price}}", inline: true },
      { name: "💵 LETF Price", value: "{{current_price}}", inline: true },
      { name: "✅ LETF Entry", value: "{{entry_price}}", inline: true },
    );
  } else if (instrumentType === "Crypto") {
    fields.push(
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { name: "💵 Current Price", value: "{{current_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "✅ Entry", value: "{{entry_price}}", inline: true },
    );
  } else {
    fields.push(
      { name: "🟢 Ticker", value: "{{ticker}}", inline: true },
      { name: "📈 Direction", value: "{{direction}}", inline: true },
      { name: "💵 Current Price", value: "{{current_price}}", inline: true },
      { ...SPACER_FIELD },
      { name: "✅ Entry", value: "{{entry_price}}", inline: true },
    );
  }

  fields.push(
    { name: "💸 P/L", value: "{{current_profit_pct}}", inline: true },
    { name: "🛡️ Current Stop", value: "{{new_stop_loss}}", inline: true },
  );

  return {
    description: `**📡 ${tickerVar} ${label} Live Status Update**`,
    color: "#3b82f6",
    fields,
    footer: DISCLAIMER,
    timestamp: true,
  };
}

function endTradeTemplate(instrumentType: string): TemplateEmbed {
  const label = instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : instrumentType === "Crypto" ? "Crypto" : "Options";
  const tickerVar = instrumentType === "LETF" || instrumentType === "LETF Option" ? "{{underlying}}" : "{{ticker}}";
  return {
    description: `**🏁 ${tickerVar} ${label} Trade Ended**`,
    color: "#D4AF37",
    fields: [
      { ...SPACER_FIELD },
      { name: "🟢 Ticker", value: tickerVar, inline: true },
      { name: "🏁 Status", value: "Closed Manually", inline: true },
      { name: "💵 Exit Price", value: "{{exit_price}}", inline: true },
      { name: "✅ Entry", value: "{{entry_price}}", inline: true },
      { name: "💸 Result", value: "{{profit_pct}}", inline: true },
      { ...SPACER_FIELD },
      { name: "🔍 Manage Your Trade Accordingly", value: "{{manage_message}}", inline: false },
    ],
    footer: DISCLAIMER,
    timestamp: true,
  };
}

function getEntryTemplate(instrumentType: string): TemplateEmbed {
  switch (instrumentType) {
    case "Options": return optionsEntryTemplate();
    case "Shares": return sharesEntryTemplate();
    case "LETF": return letfEntryTemplate();
    case "LETF Option": return letfOptionEntryTemplate();
    case "Crypto": return cryptoEntryTemplate();
    default: return sharesEntryTemplate();
  }
}

export function getDefaultTemplates(instrumentType: string): MessageTemplate[] {
  return [
    { type: "signal_alert", label: "Entry Signal", content: "@everyone", embed: getEntryTemplate(instrumentType) },
    { type: "target_hit", label: "Target Hit", content: "", embed: targetHitTemplate(instrumentType) },
    { type: "stop_loss_raised", label: "SL Raised", content: "", embed: stopLossRaisedTemplate(instrumentType) },
    { type: "stop_loss_hit", label: "Stop Loss Hit", content: "", embed: stopLossHitTemplate(instrumentType) },
    { type: "ten_pct_entry", label: "10% Entry", content: "@everyone", embed: tenPctEntryTemplate(instrumentType) },
    { type: "ten_pct_milestone", label: "10% Milestone", content: "@everyone", embed: tenPctMilestoneTemplate(instrumentType) },
    { type: "current_status", label: "Current Status", content: "", embed: currentStatusTemplate(instrumentType) },
    { type: "end_trade", label: "End Trade", content: "", embed: endTradeTemplate(instrumentType) },
  ];
}

const SAMPLE_DATA: Record<string, Record<string, any>> = {
  Options: {
    ticker: "AAPL", instrument_type: "Options", direction: "Call",
    entry_price: 5.20, entry_option_price: 5.20, entry_instrument_price: 5.20,
    entry_underlying_price: 195.50, expiration: "2026-04-18", strike: 200,
    stop_loss: 3.50, time_stop: "2 days",
    targets: {
      tp1: { price: 7.80, take_off_percent: 50, raise_stop_loss: { price: 5.20 } },
      tp2: { price: 10.40, take_off_percent: 100 },
    },
  },
  Shares: {
    ticker: "MSFT", instrument_type: "Shares", direction: "Long",
    entry_price: 420.00, entry_instrument_price: 420.00, stop_loss: 410.00, time_stop: "5 days",
    targets: {
      tp1: { price: 435.00, take_off_percent: 50, raise_stop_loss: { price: 420.00 } },
      tp2: { price: 450.00, take_off_percent: 100 },
    },
  },
  LETF: {
    ticker: "TQQQ", instrument_type: "LETF", direction: "Long",
    entry_price: 72.50, entry_instrument_price: 72.50, entry_underlying_price: 490.00,
    underlying_symbol: "QQQ", stop_loss: 68.00,
    targets: {
      tp1: { price: 78.00, take_off_percent: 50, raise_stop_loss: { price: 72.50 } },
      tp2: { price: 84.00, take_off_percent: 100 },
    },
  },
  "LETF Option": {
    ticker: "TQQQ", instrument_type: "LETF Option", direction: "Call",
    entry_price: 6.50, entry_option_price: 6.50, entry_instrument_price: 6.50,
    entry_underlying_price: 72.50, underlying_symbol: "QQQ",
    expiration: "2026-04-18", strike: 80, stop_loss: 4.00, time_stop: "3 days",
    targets: {
      tp1: { price: 9.75, take_off_percent: 50, raise_stop_loss: { price: 6.50 } },
      tp2: { price: 13.00, take_off_percent: 100 },
    },
  },
  Crypto: {
    ticker: "BTC", instrument_type: "Crypto", direction: "Long",
    entry_price: 95000, entry_instrument_price: 95000, stop_loss: 92000,
    targets: {
      tp1: { price: 100000, take_off_percent: 50, raise_stop_loss: { price: 95000 } },
      tp2: { price: 105000, take_off_percent: 100 },
    },
  },
};

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "—";
  return `$${Number(p).toFixed(2)}`;
}

function fmtPct(base: number, target: number): string {
  if (!base || base === 0) return "?";
  return `${(((target - base) / base) * 100).toFixed(1)}%`;
}

export function buildSampleVariables(
  instrumentType: string,
  messageType: string,
): Record<string, string> {
  const data = SAMPLE_DATA[instrumentType] || SAMPLE_DATA["Shares"];
  const ticker = data.ticker;
  const direction = data.direction || "Long";
  const isBullish = direction === "Call" || direction === "Long";
  const isOption = instrumentType === "Options" || instrumentType === "LETF Option";
  const isLETF = instrumentType === "LETF" || instrumentType === "LETF Option";
  const underlying =
    data.underlying_ticker ||
    data.underlying_symbol ||
    getLETFUnderlyingSync(ticker) ||
    ticker;
  const leverage = getLETFLeverage(ticker);
  const dirText = direction === "Short" || direction === "Put" ? "BEAR" : "BULL";
  const entryPrice = data.entry_instrument_price ?? data.entry_price ?? 0;
  const right = direction === "Put" ? "PUT" : "CALL";

  const vars: Record<string, string> = {
    ticker,
    instrument_type: instrumentType,
    instrument_label: instrumentType === "LETF" || instrumentType === "Shares" ? "Shares" : instrumentType === "Crypto" ? "Crypto" : "Options",
    direction,
    entry_price: fmtPrice(entryPrice),
    stock_price: fmtPrice(data.entry_underlying_price || data.entry_instrument_price),
    app_name: "TradeSync",
    expiry: data.expiration || "—",
    strike: data.strike != null ? String(data.strike) : "—",
    right,
    option_price: fmtPrice(data.entry_option_price || data.entry_instrument_price),
    letf_ticker: isLETF ? ticker : "—",
    underlying: isLETF ? underlying : ticker,
    leverage: leverage != null ? String(Math.abs(leverage)) : "—",
    letf_direction: dirText,
    letf_entry: fmtPrice(data.entry_instrument_price),
    stop_loss: fmtPrice(data.stop_loss),
    time_stop: data.time_stop || "—",
    trade_type: data.trade_type || "Scalp",
    current_price: fmtPrice(data.entry_instrument_price ?? data.entry_price ?? null),
    current_profit_pct: "0.0%",
    manage_message: "Manage your trade accordingly.",
  };

  const targets = data.targets as Record<string, any> || {};
  const targetEntries = Object.entries(targets)
    .filter(([, v]: [string, any]) => v?.price != null)
    .sort(([, a]: [string, any], [, b]: [string, any]) => Number(a.price) - Number(b.price));

  const targetPrices = targetEntries.map(([, v]: [string, any]) => {
    const p = Number(v.price);
    const pct = entryPrice ? fmtPct(entryPrice, p) : null;
    return pct ? `${fmtPrice(p)} (${pct})` : fmtPrice(p);
  });
  vars.targets_summary = targetPrices.join(", ") || "—";

  const tradePlanParts: string[] = [];
  if (targetPrices.length > 0) tradePlanParts.push(`🎯 Targets: ${targetPrices.join(", ")}`);
  if (data.stop_loss != null) {
    const slParts = [fmtPrice(data.stop_loss)];
    for (const [, v] of targetEntries) {
      if ((v as any).raise_stop_loss?.price) slParts.push(fmtPrice(Number((v as any).raise_stop_loss.price)));
    }
    tradePlanParts.push(`🛑 Stop loss: ${slParts.join(", ")}`);
  }
  if (data.time_stop) tradePlanParts.push(`🌐 Time Stop: ${data.time_stop}`);
  vars.trade_plan = tradePlanParts.join("\n") || "—";

  const tpLines: string[] = [];
  let tpIdx = 0;
  for (const [, v] of targetEntries) {
    const t = v as any;
    if (Number(t.take_off_percent) === 0) continue;
    tpIdx++;
    const price = Number(t.price);
    const pctLabel = entryPrice ? fmtPct(entryPrice, price) : fmtPrice(price);
    let line = `Take Profit (${tpIdx}): At ${pctLabel} take off ${t.take_off_percent}% ${tpIdx === 1 ? "of position" : "of remaining position"}`;
    if (t.raise_stop_loss?.price) {
      const rsl = Number(t.raise_stop_loss.price);
      const isBreakEven = entryPrice > 0 && Math.abs(rsl - entryPrice) < 0.01;
      line += isBreakEven ? " and raise stop loss to break even" : ` and raise stop loss to ${fmtPrice(rsl)}`;
    }
    if (t.trailing_stop_percent != null) {
      line += ` with ${t.trailing_stop_percent}% trailing stop.`;
    } else {
      line += ".";
    }
    tpLines.push(line);
  }
  vars.take_profit_plan = tpLines.join("\n") || "—";

  if (messageType === "target_hit" && targetEntries.length > 0) {
    const [, firstTarget] = targetEntries[0];
    const tp = firstTarget as any;
    const tpPrice = Number(tp.price);
    const profitPct = entryPrice ? (((tpPrice - entryPrice) / entryPrice) * 100).toFixed(1) : "0.0";
    vars.tp_number = "1";
    vars.tp_price = fmtPrice(tpPrice);
    vars.profit_pct = `${profitPct}%`;
    vars.take_off_pct = `${tp.take_off_percent ?? 50}%`;
    const takeOff = tp.take_off_percent ?? 50;
    vars.position_mgmt = `✅ Reduce position by ${takeOff}% (lock in profit)`;
    if (targetEntries.length > 1) {
      const [, nextTarget] = targetEntries[1];
      vars.position_mgmt += `\n🎯 Let remaining ${100 - takeOff}% ride to TP2 (${fmtPrice(Number((nextTarget as any).price))})`;
    }
    const newSL = tp.raise_stop_loss?.price ? Number(tp.raise_stop_loss.price) : null;
    if (newSL != null) {
      const isBreakEven = entryPrice > 0 && Math.abs(newSL - entryPrice) < 0.01;
      vars.new_stop_loss = isBreakEven ? `${fmtPrice(newSL)} (Break Even)` : fmtPrice(newSL);
      vars.risk_mgmt = isBreakEven
        ? `Raising stop loss to ${fmtPrice(newSL)} (break even) on remaining position to secure gains while allowing room to run.`
        : `Raising stop loss to ${fmtPrice(newSL)} on remaining position to secure gains while allowing room to run.`;
    } else {
      vars.new_stop_loss = "—";
      vars.risk_mgmt = "No stop adjustment on this target.";
    }
    if (tp.trailing_stop_percent != null) {
      vars.trailing_stop_percent = `${tp.trailing_stop_percent}%`;
      vars.risk_mgmt += `\n📏 ${tp.trailing_stop_percent}% trailing stop activated — stop will follow price.`;
    }
  }

  if (messageType === "stop_loss_raised" && targetEntries.length > 0) {
    const [, firstTarget] = targetEntries[0];
    const tp = firstTarget as any;
    const newSL = tp.raise_stop_loss?.price ? Number(tp.raise_stop_loss.price) : entryPrice;
    const isBreakEven = entryPrice > 0 && Math.abs(newSL - entryPrice) < 0.01;
    vars.new_stop_loss = isBreakEven ? `${fmtPrice(newSL)} (Break Even)` : fmtPrice(newSL);
    vars.is_break_even = String(isBreakEven);
    vars.risk_value = entryPrice > 0 ? `${(((newSL - entryPrice) / entryPrice) * 100).toFixed(1)}%` : "—";
    vars.risk_mgmt = isBreakEven
      ? `Stop loss raised to ${fmtPrice(newSL)} (break even).\nTrade is now risk-free on remaining position.`
      : `Stop loss raised to ${fmtPrice(newSL)} on remaining position.`;
    if (targetEntries.length > 1) {
      const [key2, target2] = targetEntries[1];
      vars.risk_mgmt += `\n🎯 Next target: ${key2.toUpperCase()} at ${fmtPrice(Number((target2 as any).price))}`;
    }
  }

  if (messageType === "ten_pct_entry") {
    vars.trade_plan = data.stop_loss != null
      ? `🛑 Stop loss: ${fmtPrice(data.stop_loss)}`
      : "—";
  }

  if (messageType === "ten_pct_milestone") {
    const samplePct = 30;
    const sampleCurrentPrice = entryPrice * (1 + samplePct / 100);
    vars.milestone_pct = String(samplePct);
    vars.current_price = fmtPrice(sampleCurrentPrice);
    vars.current_profit_pct = `+${samplePct.toFixed(1)}%`;
    vars.milestone_title = "<a:swj_boom_emoji:1485922107639726119> Boom Baby";
    vars.milestone_text = `+${samplePct}% profit reached`;
    vars.milestone_footer = "Breakeven stop loss";
    vars.milestone_image = "https://cdn.discordapp.com/emojis/1485922107639726119.webp?size=60&animated=true";
  }

  if (messageType === "stop_loss_hit") {
    const sl = data.stop_loss != null ? Number(data.stop_loss) : entryPrice * 0.9;
    vars.exit_price = fmtPrice(sl);
    const pct = entryPrice ? (((sl - entryPrice) / entryPrice) * 100).toFixed(1) : "0.0";
    vars.profit_pct = `${pct}%`;
    vars.pnl_dollar = fmtPrice(null);
    vars.r_multiple = "—";
    vars.trailing_stop_active = String(!!data.trailing_stop_active);
    vars.trailing_stop_percent = data.trailing_stop_percent != null ? `${data.trailing_stop_percent}%` : "—";
    vars.stop_type = data.trailing_stop_active ? "Trailing Stop" : "Stop Loss";
  }


  return vars;
}

export function renderTemplate(
  template: TemplateEmbed,
  vars: Record<string, string>,
): {
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  image?: { url: string };
  thumbnail?: { url: string };
} {
  const applyVarsAndEscapes = (s: string): string => {
    // Replace {{var}} placeholders
    let out = s.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
    // Turn the literal "\u200b" sequence into an actual zero‑width space
    out = out.replace(/\\u200b/g, "\u200b");
    return out;
  };

  const colorHex = applyVarsAndEscapes(template.color);
  let colorNum: number;
  if (colorHex.startsWith("#")) {
    colorNum = parseInt(colorHex.slice(1), 16);
  } else {
    colorNum = parseInt(colorHex, 16) || 0x6b7280;
  }

  const resolvedImage = template.image?.url ? applyVarsAndEscapes(template.image.url) : undefined;
  const resolvedThumbnail = template.thumbnail?.url ? applyVarsAndEscapes(template.thumbnail.url) : undefined;

  return {
    description: template.description
      ? applyVarsAndEscapes(template.description)
      : undefined,
    color: colorNum,
    fields: template.fields?.map((f) => ({
      name: applyVarsAndEscapes(f.name),
      value: applyVarsAndEscapes(f.value),
      inline: f.inline,
    })),
    footer: template.footer
      ? { text: applyVarsAndEscapes(template.footer) }
      : undefined,
    timestamp: template.timestamp ? new Date().toISOString() : undefined,
    image: resolvedImage && !resolvedImage.includes("{{") ? { url: resolvedImage } : undefined,
    thumbnail: resolvedThumbnail && !resolvedThumbnail.includes("{{") ? { url: resolvedThumbnail } : undefined,
  };
}

export function generateAllTemplateGroups(): TemplateGroupWithVars[] {
  const instrumentTypes = ["Options", "Shares", "LETF", "LETF Option", "Crypto"];
  const sampleTickers: Record<string, string> = {
    Options: "AAPL", Shares: "MSFT", LETF: "TQQQ", "LETF Option": "TQQQ", Crypto: "BTC",
  };

  return instrumentTypes.map(it => ({
    instrumentType: it,
    ticker: sampleTickers[it] || "AAPL",
    templates: getDefaultTemplates(it),
  }));
}
