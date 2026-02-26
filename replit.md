# TradeSync - Trading Alert System Dashboard

A modular trading and alert system dashboard designed to be plugged into other applications. Built with a systemized architecture for managing alerts, signals, watchlists, and activity tracking.

## Architecture

- **Frontend**: React + TypeScript with Vite, TanStack Query, Wouter routing, Shadcn UI
- **Backend**: Express.js with REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support (dark by default)

## Data Model

- **Alerts**: Price alerts with conditions (above/below/crosses), priority levels, and trigger tracking
- **Signals**: Trading signals with direction (buy/sell), confidence scores, entry/target/stop-loss prices
- **Watchlist**: Asset tracking with current prices, 24h changes, volume, market cap, sector
- **Activity Log**: System event feed tracking all actions (alerts, signals, watchlist changes)
- **Connected Apps**: Plugged-in trading applications with sync settings, API endpoints, and webhook configuration

## Pages

1. **Dashboard** (`/`) - Overview with stats cards, recent alerts, active signals, watchlist preview, activity feed
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
- `GET /dashboard/stats`

## Key Files

- `shared/schema.ts` - Data models and Zod validation schemas
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - API route handlers
- `server/seed.ts` - Seed data for initial load
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/components/theme-provider.tsx` - Dark/light mode toggle
