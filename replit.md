# TradeSync - Signal Execution System Dashboard

## Overview
TradeSync is a modular trading dashboard designed to execute trading signals from various plugged-in applications. It automates trade execution via Interactive Brokers (IBKR) and delivers real-time notifications through Discord, all based on user-defined system settings. The platform provides comprehensive visibility into all system controls, integrations, and connection points, aiming to streamline and automate trading strategies.

## User Preferences
I want to ensure all core features are robust and thoroughly tested. I prioritize maintainable code and clear documentation. I prefer iterative development with regular updates on progress and potential roadblocks. I value detailed explanations for complex technical decisions. For any significant architectural changes or critical feature implementations, please ask for my approval before proceeding. Do not make changes to files within the `server/storage/` directory without explicit instruction, as these directly interact with the database. Similarly, avoid modifying `client/src/lib/formatters.ts` unless adding new, globally applicable formatting utilities.

## System Architecture
TradeSync employs a modern full-stack architecture:
- **Frontend**: Developed with React and TypeScript, utilizing Vite for a fast development experience, TanStack Query for data fetching, Wouter for routing, and Shadcn UI for component styling. Tailwind CSS is used for styling, with dark mode enabled by default.
- **Backend**: An Express.js server handles API requests, providing RESTful endpoints for all functionalities.
- **Database**: PostgreSQL serves as the primary data store, with Drizzle ORM managing database interactions.
- **Signal Processing**: A core `signal-processor.ts` service orchestrates the signal lifecycle, from ingestion to triggering IBKR trades and Discord alerts based on configured settings.
- **Trade Execution**: The `trade-executor.ts` service interfaces with IBKR, placing orders and recording transactions.
- **Notifications**: The `discord.ts` service formats and dispatches rich embeds to Discord webhooks.
- **Data Model**: Key entities include Signals (flexible JSON `data` field for various instrument types, targets, stop-loss, trailing stops, and source app tracking), Activity Log, Discord Messages, Connected Apps (with API keys and per-app settings), System Settings, Integrations (Discord, IBKR), and IBKR Orders/Positions.
- **UI/UX**: The dashboard provides a comprehensive overview with dedicated pages for Signals, Activity, Integrations, Connected Apps, API Guide, IBKR account details, and System Settings. A live system audit page (`/audit`) provides real-time insights into the codebase's architecture and features. Discord message templates are customizable per-app and instrument type.
- **Code Conventions**: Adherence to DRY principles, central error handling, and generic CRUD factories (`createCrudMethods`) ensures consistency and maintainability across the codebase. `asyncHandler` wrappers are used for all routes to simplify error management.

## External Dependencies
- **Interactive Brokers (IBKR)**: For trade execution and real-time account data synchronization (`@stoqey/ib` library).
- **Discord**: For sending real-time notifications and alerts via webhooks.
- **PostgreSQL**: The relational database management system for persistent storage.
- **Polygon.io**: Primary source for historical OHLCV bar data for stocks and option contracts.
- **dotenv**: For managing environment variables outside of Replit.

## IBKR Reject Reason Tracking
- The `ibkr_orders` table has a `reject_reason` text column that stores IBKR error codes and messages when orders are rejected or cancelled.
- The trade executor (`server/services/trade-executor.ts`) populates this field for both entry order rejections and close order rejections.
- The IBKR page (`client/src/pages/ibkr.tsx`) shows reject reasons inline below rejected orders in the Orders tab, and has a dedicated "Diagnostics" tab with rejection statistics, reason categorization, and a recent rejections table.
- Historical rejected orders (pre-tracking) show "Reason not captured (pre-tracking)" in the diagnostics view.

## IBKR Fill Price Flow (IBKR → Save → Discord)
- **Entry**: IBKR order executes first. If filled, `ibkr_fill_price` and `entry_instrument_price` are saved to signal data, then Discord entry alert is sent with the real fill price.
- **Target hit**: When auto-tracking hits a target with full exit (or all targets complete), `executeIbkrClose()` runs first, close fill price saved as `ibkr_close_fill_price` + `hit_targets[tpN].ibkrCloseFillPrice`, signal data persisted, then Discord alert sent.
- **Stop loss / Trailing stop**: Same pattern — IBKR close first, fill prices saved as `ibkr_close_fill_price` + `stop_loss_hit_ibkr_fill_price`, signal data persisted, then Discord alert sent.
- **Monitor fallback**: If no IBKR fill was saved at entry (order rejected/pending), the trade monitor looks up fill price from `ibkr_orders` table on first cycle and caches it in `signalData.ibkr_fill_price`.
- **Fallback**: If no IBKR fill exists at all, the original Polygon snapshot is used for profit %.