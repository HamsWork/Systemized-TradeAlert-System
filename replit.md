# TradeSync - Signal Execution System Dashboard

A modular trading dashboard where plugged-in apps send signals, which trigger IBKR trade execution and Discord notifications based on system settings. Built with full visibility into every system control, integration, and connection point.

## Architecture

- **Frontend**: React + TypeScript with Vite, TanStack Query, Wouter routing, Shadcn UI
- **Backend**: Express.js with REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support (dark by default)
- **Environment**: Loads `.env` via dotenv when not running in Replit (checks REPL_ID)

## System Flow

Plugged-in apps → Send signals → TradeSync executes IBKR trades + sends Discord notifications based on settings

## Data Model

- **Signal Types**: Template definitions with dynamic variables (including `showWhen` conditional visibility), Discord embed templates (title, description, fields, footer, color), and display settings
- **Signals**: Trading signals linked to a signal type, with flexible JSON `data` field for all variable values, source app tracking (sourceAppId, sourceAppName)
- **Common Trade Alert** signal type includes: ticker, instrument type (Options/Shares/LETF), conditional option fields (option_type, strike, expiration), conditional LETF fields (etf_ticker, leverage), entry price, trade plan, multiple stop loss levels (SL1-3), multiple take profit levels (TP1-3), raise stop loss method with value, and notes
- **Activity Log**: System event feed tracking all actions
- **Connected Apps**: Plugged-in trading applications with auto-generated API keys, Discord settings (Send Discord Messages toggle + Shares/Options/Leveraged ETF webhook URLs), and IBKR settings (Execute IBKR Trades toggle + Client ID, Host IP, Port)
- **System Settings**: Key-value toggle/config store for system controls (signals, trading, system)
- **Integrations**: Discord channels and IBKR trading accounts with per-integration notification and trading toggles
- **IBKR Orders/Positions**: Trade execution records and open position tracking
- **Alerts** (backend schema only, removed from frontend): Legacy alert schema retained in database

## Signal Ingestion API

Connected apps push signals to TradeSync via `POST /api/ingest/signals` using their API key:
- Auth: `Authorization: Bearer <api_key>` header
- Body: `{ signalTypeId or signalType (name), data: { ...variable values } }`
- App must be active and have syncSignals enabled
- Each signal is tagged with sourceAppId and sourceAppName

## Signal Type Variables

Variables support `showWhen` conditional visibility:
- `{ field: "instrument_type", value: "Options" }` - show only when instrument_type is Options
- `{ field: "raise_stop_method", values: ["Trail by %", "Trail by $", "Custom"] }` - show when any of the values match
- Form automatically clears dependent field values when parent selection changes

## Pages

1. **Dashboard** (`/`) - System overview with signal pipeline flow card, stat cards, recent signals, activity feed, connections status, and positions summary
2. **Signals** (`/signals`) - Full CRUD for trading signals with filtering, shows source app badges
3. **Activity** (`/activity`) - Complete activity log
4. **Integrations** (`/integrations`) - Full CRUD for Discord channels and IBKR trading accounts with notification/trading toggles
5. **Connected Apps** (`/connected-apps`) - Manage plugged-in trading apps with API key management (show/hide, copy, regenerate)
6. **API Guide** (`/api-guide`) - Interactive API documentation with Massive.com-style layout, live code generation, and query testing
7. **IBKR Trading** (`/ibkr`) - Dedicated IBKR page with order status, open positions, and order history per connected app
8. **Settings** (`/settings`) - System controls organized by category (signals, trading, system) with toggle switches and value inputs

## API Routes

All routes prefixed with `/api`:
- `GET/POST /signals`, `GET/PATCH/DELETE /signals/:id`
- `POST /ingest/signals` - External signal ingestion (requires Bearer API key auth)
- `GET /activity`
- `GET/POST /connected-apps`, `GET/PATCH/DELETE /connected-apps/:id`
- `POST /connected-apps/:id/regenerate-key` - Regenerate API key for an app
- `GET/PUT /settings` (system settings - upsert by key)
- `GET/POST /integrations`, `PATCH/DELETE /integrations/:id`
- `GET /ibkr/orders`, `GET /ibkr/orders/:integrationId`, `POST /ibkr/orders`, `PATCH /ibkr/orders/:id`
- `GET /ibkr/positions`, `GET /ibkr/positions/:integrationId`, `POST /ibkr/positions`, `PATCH /ibkr/positions/:id`
- `GET /dashboard/stats`
- `GET/POST /alerts`, `GET/PATCH/DELETE /alerts/:id` (backend only, not exposed in frontend)

## Key Files

### Shared Schema (split by domain)
- `shared/schema.ts` - Barrel file re-exporting all domain schemas
- `shared/schema/users.ts` - Users table, insert schema, types
- `shared/schema/alerts.ts` - Alerts table, insert schema, types
- `shared/schema/signals.ts` - Signal types + signals tables, insert schemas, types
- `shared/schema/activity.ts` - Activity log table, insert schema, types
- `shared/schema/apps.ts` - Connected apps table, insert schema, types
- `shared/schema/settings.ts` - System settings table, insert schema, types
- `shared/schema/integrations.ts` - Integrations table, insert schema, types
- `shared/schema/ibkr.ts` - IBKR orders + positions tables, insert schemas, types
- `shared/schema/watchlist.ts` - Watchlist table

### Server Storage (split by domain)
- `server/storage.ts` - Barrel file re-exporting storage interface, class, and instance
- `server/storage/interface.ts` - IStorage interface definition
- `server/storage/users.ts` - User CRUD methods
- `server/storage/alerts.ts` - Alert CRUD methods
- `server/storage/signals.ts` - SignalType + Signal CRUD methods
- `server/storage/activity.ts` - Activity log methods
- `server/storage/apps.ts` - ConnectedApp CRUD methods
- `server/storage/settings.ts` - SystemSettings methods
- `server/storage/integrations.ts` - Integration CRUD methods
- `server/storage/ibkr.ts` - IBKR orders/positions methods
- `server/storage/dashboard.ts` - Dashboard stats method
- `server/storage/index.ts` - DatabaseStorage class composing all domain methods

### Server Routes (split by domain)
- `server/routes.ts` - Barrel file re-exporting registerRoutes
- `server/routes/dashboard.ts` - GET /api/dashboard/stats
- `server/routes/alerts.ts` - /api/alerts CRUD routes
- `server/routes/signals.ts` - /api/signals CRUD + /api/signal-types + /api/ingest/signals
- `server/routes/activity.ts` - /api/activity
- `server/routes/apps.ts` - /api/connected-apps CRUD + regenerate-key
- `server/routes/settings.ts` - /api/settings
- `server/routes/integrations.ts` - /api/integrations CRUD
- `server/routes/ibkr.ts` - /api/ibkr/orders + /api/ibkr/positions
- `server/routes/index.ts` - registerRoutes composing all domain route registrars

### Other Key Files
- `server/db.ts` - Database connection with keepAlive and error handling
- `server/seed.ts` - Seed data for all tables
- `client/src/pages/dashboard.tsx` - Overview dashboard with signal pipeline flow, stats, recent signals, activity feed
- `client/src/pages/settings.tsx` - System settings controls by category
- `client/src/pages/connected-apps.tsx` - Connected apps management with API key display
- `client/src/pages/signals.tsx` - Signals page with source app badges
- `client/src/pages/api-guide.tsx` - Interactive API guide with live code examples
- `client/src/components/app-sidebar.tsx` - Navigation sidebar

## System Settings Categories

- **signals**: Signal Engine, Confidence Threshold, Technical/Sentiment/Fundamental/Algorithmic toggles
- **system**: Activity Logging, Dark Mode Default, API Access, Webhook Delivery
- **trading**: Trade Execution, Paper Mode, Max Position Size, Risk Limit, Auto Stop-Loss, Auto Take-Profit
