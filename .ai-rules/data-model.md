# Data Model Rules

All models are defined in `shared/schema.ts`. Every table uses `varchar` primary keys with `gen_random_uuid()`.

## Tables

### signalTypes
Template definitions for signals. Each has:
- `variables` (jsonb): Array of field definitions with `showWhen` conditional visibility
- `titleTemplate`, `descriptionTemplate`: Mustache-style templates (`{{ticker}}`)
- `fieldsTemplate` (jsonb): Array of `{ name, value, inline }` for card display
- `color`: Hex color for badges and UI accents

### signals
Trading signals linked to a signal type:
- `signalTypeId`: FK to signalTypes
- `data` (jsonb): Flexible key-value object holding all field values (ticker, direction, entry_price, etc.)
- `sourceAppId`, `sourceAppName`: Which connected app sent this signal
- `status`: "active" | "closed" | "expired"

### connectedApps
External trading apps that push signals into TradeSync:
- `apiKey`: Auto-generated bearer token for API auth
- `syncSignals`: Whether the app is allowed to send signals
- Discord webhook URLs per instrument type (shares, options, LETF)
- IBKR connection settings (client ID, host, port)

### integrations
Discord channels and IBKR accounts:
- `type`: "discord" | "ibkr"
- `config` (jsonb): Type-specific settings (webhook URL for Discord, host/port for IBKR)
- Notification toggles: `notifyAlerts`, `notifySignals`, `notifyTrades`, `notifySystem`
- Trading toggles: `autoTrade`, `paperTrade`

### systemSettings
Key-value config store with categories: "signals", "trading", "system"

### ibkrOrders / ibkrPositions
Trade execution records and position tracking, linked to integrations and source apps.

### activityLog
System event feed. Types: "system", "alert_created", "signal_ingested", etc.

## Schema Rules

- Insert schemas use `createInsertSchema` from `drizzle-zod` with `.omit()` for auto-generated fields
- Export both the insert schema, insert type (`z.infer`), and select type (`$inferSelect`)
- Array columns: use `text().array()` not `array(text())`
- NEVER change existing primary key column types
