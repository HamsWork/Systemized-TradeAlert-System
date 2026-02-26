# Integrations Rules

## Connected Apps

Connected apps are external trading platforms (e.g., "Situ Trader", "Crowned Trader") that push signals into TradeSync.

Each app has:
- Auto-generated API key (`ts_` prefix + 48 hex chars) for Bearer token auth
- `syncSignals` toggle to allow/deny signal ingestion
- Per-instrument Discord webhook URLs: shares, options, LETF
- IBKR connection settings: execute toggle, client ID, host, port
- API key management: show/hide, copy to clipboard, regenerate

### Connected App API Key

- Generated via `crypto.randomBytes(24).toString("hex")` with `ts_` prefix
- Regeneration creates a new key and invalidates the old one
- Keys are shown masked by default, revealed on click

## IBKR Integration

IBKR accounts are managed in the Integrations page.

### Add IBKR Account Modal

Simplified form with only:
- Display Name
- Account Type (Paper / Live)
- Host (default: 127.0.0.1)
- Port (default: 7497 for paper, 7496 for live)
- Client ID (default: 1)

Removed from modal (managed elsewhere): Account ID, Trading Controls, Notifications.
Paper trade mode is auto-set based on account type selection.

### IBKR Orders & Positions

- Orders tracked with: symbol, side, orderType, quantity, limit/stop prices, fill info, status
- Positions tracked with: symbol, quantity, avgCost, marketPrice, unrealizedPnl
- Both link to integrationId and optionally to sourceAppId/sourceAppName

## Discord Integration

Discord channels for notifications. Each channel has:
- Display name, channel name, webhook URL, server ID
- Notification toggles: Signals, Trades, System

## System Settings

Key-value store in `systemSettings` table, organized by category:

### signals
- Signal Engine (master switch)
- Min Confidence Threshold
- Technical/Sentiment/Fundamental/Algorithmic signal toggles

### trading
- Trade Execution (master switch)
- Paper Trading Mode
- Max Position Size, Risk Limit
- Auto Stop-Loss, Auto Take-Profit

### system
- Activity Logging
- Dark Mode Default
- API Access, Webhook Delivery
