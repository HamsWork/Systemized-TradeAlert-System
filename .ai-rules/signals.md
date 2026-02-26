# Signal System Rules

## System Flow

```
Connected Apps → Send signals (via API) → TradeSync stores signal
  → Executes IBKR trades (if enabled)
  → Sends Discord notifications (if enabled)
  → Logs to activity feed
```

## Signal Types (Templates)

Defined in the `signalTypes` table. Each type has:
- `variables`: Array of field definitions that define the form and API schema
- Templates for rendering: `titleTemplate`, `descriptionTemplate`, `fieldsTemplate`, `footerTemplate`

### Built-in Signal Types

1. **Common Trade Alert** (green) — Main entry signal
2. **Stop Loss Hit** (red) — Exit on stop loss
3. **Take Profit Hit** (blue) — Exit on take profit

## Signal Data Structure

Signals store data in a flat `data` jsonb field. For Common Trade Alert:

```json
{
  "ticker": "AAPL",
  "instrument_type": "Options",
  "direction": "Long",
  "entry_price": "189.50",
  "expiration": "2026-03-20",
  "strike": "190",
  "stop_loss_1": "182.00",
  "stop_loss_2": "178.00",
  "stop_loss_3": "175.00",
  "take_profit_1": "195.00",
  "take_profit_2": "200.00",
  "take_profit_3": "205.00",
  "raise_stop_method": "Move to Entry at TP1",
  "raise_stop_value": "189.50",
  "trade_plan": "Breakout above 188 resistance.",
  "notes": "Golden cross on daily chart."
}
```

## API → Storage Mapping

The ingest API accepts structured top-level params and maps them into the flat `data` object:
- `ticker` → `data.ticker`
- `instrumentType` → `data.instrument_type`
- `direction` → `data.direction`
- `entryPrice` → `data.entry_price`
- `tradePlan.targetLevels.tp1` → `data.take_profit_1`
- `tradePlan.stopLoss.sl1` → `data.stop_loss_1`
- `tradePlan.raiseStopLevel.method` → `data.raise_stop_method`
- `tradePlan.notes` → `data.trade_plan`

## Instrument Types

- **Options**: Requires expiration and strike. Shows expiration/strike in signal cards.
- **Shares**: Basic equity trade. No extra fields.
- **LETF** (Leveraged ETF): Labeled as "Leveraged ETF" in forms, stored as "LETF".

## Raise Stop Methods

Available methods: "None", "Trail by %", "Trail by $", "Move to Entry at TP1", "Move to TP1 at TP2", "Custom"

Methods that require a value field: "Trail by %", "Trail by $", "Custom"

## Conditional Visibility (showWhen)

Signal type variables support conditional rendering:
- Single value: `{ field: "instrument_type", value: "Options" }` — show when field equals value
- Multiple values: `{ field: "raise_stop_method", values: ["Trail by %", "Trail by $", "Custom"] }` — show when field matches any value
- When a parent field changes, dependent fields are automatically cleared to prevent stale data
