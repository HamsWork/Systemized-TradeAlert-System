# TradeSync - Trading Alert System Dashboard

A modular, systemized trading and alert dashboard designed to be plugged directly into other applications. Built with full visibility into every system control, integration, and connection point.

## Architecture

- **Frontend**: React + TypeScript with Vite, TanStack Query, Wouter routing, Shadcn UI
- **Backend**: Express.js with REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support (dark by default)
- **Environment**: Loads `.env` via dotenv when not running in Replit (checks REPL_ID)

## Data Model

- **Alerts**: Price alerts with conditions (above/below/crosses), priority levels, and trigger tracking
- **Signals**: Trading signals with direction (buy/sell), confidence scores, entry/target/stop-loss prices
- **Watchlist**: Asset tracking with current prices, 24h changes, volume, market cap, sector
- **Activity Log**: System event feed tracking all actions
- **Connected Apps**: Plugged-in trading applications (Situ Trader, Crowned Trader) with sync settings
- **System Settings**: Key-value toggle/config store for all system controls (alerts, signals, watchlist, trading, system)
- **Integrations**: Discord channels and IBKR trading accounts with per-integration notification and trading toggles

## Pages

1. **Dashboard / System Control Center** (`/`) - Full system visibility with tabs:
   - System Overview (stats + status indicators)
   - System Controls (all toggle switches grouped by category)
   - Integrations (Discord channels, IBKR accounts with notification toggles)
   - Connected Apps (plugged-in apps with on/off switches)
   - Trading (execution controls + broker accounts)
2. **Alerts** (`/alerts`) - Full CRUD for price alerts with filtering
3. **Signals** (`/signals`) - Full CRUD for trading signals with filtering
4. **Watchlist** (`/watchlist`) - Table view of tracked assets
5. **Activity** (`/activity`) - Complete activity log
6. **Connected Apps** (`/connected-apps`) - Manage plugged-in trading apps (Situ Trader, Crowned Trader)

## API Routes

All routes prefixed with `/api`:
- `GET/POST /alerts`, `GET/PATCH/DELETE /alerts/:id`
- `GET/POST /signals`, `GET/PATCH/DELETE /signals/:id`
- `GET/POST/DELETE /watchlist`, `DELETE /watchlist/:id`
- `GET /activity`
- `GET/POST /connected-apps`, `GET/PATCH/DELETE /connected-apps/:id`
- `GET/PUT /settings` (system settings - upsert by key)
- `GET/POST /integrations`, `PATCH/DELETE /integrations/:id`
- `GET /dashboard/stats`

## Key Files

- `shared/schema.ts` - Data models and Zod validation schemas (users, alerts, signals, watchlist, activityLog, connectedApps, systemSettings, integrations)
- `server/db.ts` - Database connection with keepAlive and error handling
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - API route handlers
- `server/seed.ts` - Seed data for all tables
- `client/src/pages/dashboard.tsx` - System Control Center dashboard
- `client/src/pages/connected-apps.tsx` - Connected apps management page
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/components/theme-provider.tsx` - Dark/light mode toggle

## System Settings Categories

- **alerts**: Alert System, Alert Sounds, Email Notifications, Auto-Pause Triggered
- **signals**: Signal Engine, Auto-Create Alerts, Confidence Threshold, Technical/Sentiment/Fundamental/Algorithmic toggles
- **watchlist**: Auto-Refresh, Refresh Interval, Show Volume, Show Market Cap
- **system**: Activity Logging, Dark Mode Default, API Access, Webhook Delivery
- **trading**: Trade Execution, Paper Mode, Max Position Size, Risk Limit, Auto Stop-Loss, Auto Take-Profit
