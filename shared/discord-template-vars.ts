export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
  category: "core" | "options" | "letf" | "targets" | "result" | "milestone";
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "ticker", label: "Ticker", description: "Instrument ticker symbol (e.g. AAPL, TQQQ, BTC)", category: "core" },
  { key: "instrument_type", label: "Instrument Type", description: "Options, Shares, LETF, LETF Option, or Crypto", category: "core" },
  { key: "instrument_label", label: "Instrument Label", description: "Shares or Options (display label)", category: "core" },
  { key: "direction", label: "Direction", description: "Long/Short or Call/Put", category: "core" },
  { key: "entry_price", label: "Entry Price", description: "Entry price of the instrument", category: "core" },
  { key: "stock_price", label: "Stock/Underlying Price", description: "Underlying stock price at entry", category: "core" },
  { key: "app_name", label: "App Name", description: "Connected app name", category: "core" },

  { key: "expiry", label: "Expiration", description: "Option expiration date", category: "options" },
  { key: "strike", label: "Strike Price", description: "Option strike price", category: "options" },
  { key: "right", label: "Right (CALL/PUT)", description: "Option right — CALL or PUT", category: "options" },
  { key: "option_price", label: "Option Price", description: "Option premium at entry", category: "options" },

  { key: "letf_ticker", label: "LETF Ticker", description: "Leveraged ETF ticker (e.g. TQQQ)", category: "letf" },
  { key: "underlying", label: "Underlying Symbol", description: "Underlying index/ETF (e.g. QQQ for TQQQ)", category: "letf" },
  { key: "leverage", label: "Leverage", description: "Leverage multiplier (e.g. 3)", category: "letf" },
  { key: "letf_direction", label: "LETF Direction", description: "BULL or BEAR", category: "letf" },
  { key: "letf_entry", label: "LETF Entry Price", description: "LETF share price at entry", category: "letf" },

  { key: "targets_summary", label: "Targets Summary", description: "Formatted target prices list", category: "targets" },
  { key: "stop_loss", label: "Stop Loss", description: "Stop loss price", category: "targets" },
  { key: "trade_plan", label: "Trade Plan", description: "Full trade plan text (targets + SL + time stop)", category: "targets" },
  { key: "take_profit_plan", label: "Take Profit Plan", description: "Detailed take profit plan text", category: "targets" },
  { key: "time_stop", label: "Time Stop", description: "Time-based stop value", category: "targets" },

  { key: "tp_number", label: "TP Number", description: "Target profit number that was hit (1, 2, ...)", category: "result" },
  { key: "tp_price", label: "TP Price", description: "Target profit price that was hit", category: "result" },
  { key: "profit_pct", label: "Profit %", description: "Profit percentage", category: "result" },
  { key: "take_off_pct", label: "Take Off %", description: "Position percentage to take off", category: "result" },
  { key: "exit_price", label: "Exit Price", description: "Exit/close price", category: "result" },
  { key: "new_stop_loss", label: "New Stop Loss", description: "Raised stop loss price", category: "result" },
  { key: "risk_value", label: "Risk Value", description: "Risk % from entry to new stop", category: "result" },
  { key: "is_break_even", label: "Is Break Even", description: "Whether new SL is at break even (true/false)", category: "result" },
  { key: "pnl_dollar", label: "P&L Dollar", description: "Dollar profit/loss", category: "result" },
  { key: "r_multiple", label: "R-Multiple", description: "Risk-reward ratio multiple", category: "result" },
  { key: "position_mgmt", label: "Position Management", description: "Position management instructions text", category: "result" },
  { key: "risk_mgmt", label: "Risk Management", description: "Risk management instructions text", category: "result" },

  { key: "milestone_pct", label: "Milestone %", description: "Milestone percentage reached (10, 20, 30, ...)", category: "milestone" },
  { key: "current_price", label: "Current Price", description: "Current instrument price", category: "milestone" },
  { key: "current_profit_pct", label: "Current Profit %", description: "Current profit percentage from entry", category: "milestone" },
  { key: "milestone_title", label: "Milestone Title", description: "Milestone title (🏆 Milestone, 💥 Boom Baby, 💥 Kaboom, 💰 Gains)", category: "milestone" },
  { key: "milestone_text", label: "Milestone Text", description: "Milestone text (+N% profit reached)", category: "milestone" },
  { key: "milestone_footer", label: "Milestone Footer", description: "Footer text (varies by milestone level)", category: "milestone" },
];

export const VARIABLE_CATEGORIES: Record<string, string> = {
  core: "Core",
  options: "Options / LETF Options",
  letf: "LETF / Leveraged ETF",
  targets: "Trade Plan & Targets",
  result: "Result & Exit",
  milestone: "Milestone (10% Mode)",
};

export function getVariablesForMessageType(messageType: string): TemplateVariable[] {
  const core = TEMPLATE_VARIABLES.filter(v => v.category === "core");
  const options = TEMPLATE_VARIABLES.filter(v => v.category === "options");
  const letf = TEMPLATE_VARIABLES.filter(v => v.category === "letf");
  const targets = TEMPLATE_VARIABLES.filter(v => v.category === "targets");
  const result = TEMPLATE_VARIABLES.filter(v => v.category === "result");

  switch (messageType) {
    case "signal_alert":
      return [...core, ...options, ...letf, ...targets];
    case "target_hit":
      return [...core, ...options, ...letf, ...result.filter(v =>
        ["tp_number", "tp_price", "profit_pct", "take_off_pct", "position_mgmt", "risk_mgmt", "new_stop_loss"].includes(v.key)
      )];
    case "stop_loss_raised":
      return [...core, ...options, ...letf, ...result.filter(v =>
        ["new_stop_loss", "risk_value", "is_break_even", "risk_mgmt"].includes(v.key)
      )];
    case "stop_loss_hit":
      return [...core, ...options, ...letf, ...result.filter(v =>
        ["exit_price", "profit_pct", "pnl_dollar", "r_multiple"].includes(v.key)
      )];
    case "ten_pct_entry":
      return [...core, ...options, ...letf, ...TEMPLATE_VARIABLES.filter(v =>
        ["stop_loss", "trade_plan"].includes(v.key)
      )];
    case "ten_pct_milestone":
      return [...core, ...options, ...letf, ...TEMPLATE_VARIABLES.filter(v => v.category === "milestone")];
    default:
      return [...core, ...options, ...letf, ...targets, ...result];
  }
}
