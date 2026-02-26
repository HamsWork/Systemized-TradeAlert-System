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
- **Signals**: Trading signals with direction (buy/sell), confidence scores, entry/target/stop-loss prices, source app tracking (sourceAppId, sourceAppName)
- **Activity Log**: System event feed tracking all actions
- **Connected Apps**: Plugged-in trading applications (Situ Trader, Crowned Trader) with auto-generated API keys and sync settings
- **System Settings**: Key-value toggle/config store for all system controls (alerts, signals, trading, system)
- **Integrations**: Discord channels and IBKR trading accounts with per-integration notification and trading toggles

## Signal Ingestion API

Connected apps push signals to TradeSync via `POST /api/ingest/signals` using their API key:
- Auth: `Authorization: Bearer <api_key>` header
- Body: `{ symbol, type, direction, confidence, entryPrice, targetPrice?, stopLoss?, notes? }`
- App must be active and have syncSignals enabled
- Each signal is tagged with sourceAppId and sourceAppName

## Pages

1. **Dashboard / System Control Center** (`/`) - Full system visibility with tabs:
   - System Overview (stats + status indicators)
   - System Controls (all toggle switches grouped by category)
   - Integrations (Discord channels, IBKR accounts with notification toggles)
   - Connected Apps (plugged-in apps with on/off switches)
   - Trading (execution controls + broker accounts)
2. **Alerts** (`/alerts`) - Full CRUD for price alerts with filtering
3. **Signals** (`/signals`) - Full CRUD for trading signals with filtering, shows source app badges
4. **Activity** (`/activity`) - Complete activity log
5. **Integrations** (`/integrations`) - Full CRUD for Discord channels and IBKR trading accounts with notification/trading toggles
6. **Connected Apps** (`/connected-apps`) - Manage plugged-in trading apps with API key management (show/hide, copy, regenerate)
7. **API Guide** (`/api-guide`) - Full API documentation with interactive signal testing tool

## API Routes

All routes prefixed with `/api`:
- `GET/POST /alerts`, `GET/PATCH/DELETE /alerts/:id`
- `GET/POST /signals`, `GET/PATCH/DELETE /signals/:id`
- `POST /ingest/signals` - External signal ingestion (requires Bearer API key auth)
- `GET /activity`
- `GET/POST /connected-apps`, `GET/PATCH/DELETE /connected-apps/:id`
- `POST /connected-apps/:id/regenerate-key` - Regenerate API key for an app
- `GET/PUT /settings` (system settings - upsert by key)
- `GET/POST /integrations`, `PATCH/DELETE /integrations/:id`
- `GET /dashboard/stats`

## Key Files

- `shared/schema.ts` - Data models and Zod validation schemas (users, alerts, signals, activityLog, connectedApps, systemSettings, integrations)
- `server/db.ts` - Database connection with keepAlive and error handling
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - API route handlers including signal ingestion
- `server/seed.ts` - Seed data for all tables
- `client/src/pages/dashboard.tsx` - System Control Center dashboard
- `client/src/pages/connected-apps.tsx` - Connected apps management with API key display
- `client/src/pages/signals.tsx` - Signals page with source app badges
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/components/theme-provider.tsx` - Dark/light mode toggle

## System Settings Categories

- **alerts**: Alert System, Alert Sounds, Email Notifications, Auto-Pause Triggered
- **signals**: Signal Engine, Auto-Create Alerts, Confidence Threshold, Technical/Sentiment/Fundamental/Algorithmic toggles
- **system**: Activity Logging, Dark Mode Default, API Access, Webhook Delivery
- **trading**: Trade Execution, Paper Mode, Max Position Size, Risk Limit, Auto Stop-Loss, Auto Take-Profit
