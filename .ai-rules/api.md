# API Rules

All routes are prefixed with `/api`. Defined in `server/routes.ts`.

## Signal Ingestion (External)

`POST /api/ingest/signals` — The primary endpoint for connected apps to push signals.

Auth: `Authorization: Bearer <api_key>` (from connected app's auto-generated key)

Required fields:
- `signalType` (string, name) OR `signalTypeId` (UUID) — identifies the signal template
- `ticker` (string) — e.g., "AAPL"
- `instrumentType` (string) — "Options" | "Shares" | "LETF"
- `direction` (string) — "Long" | "Short"

Conditional fields:
- `expiration` (string) — required when instrumentType is "Options"
- `strike` (string) — required when instrumentType is "Options"

Optional fields:
- `entryPrice` (string)
- `tradePlan` (JSON object) — structured trade plan:
  ```json
  {
    "targetLevels": { "tp1": "195.00", "tp2": "200.00", "tp3": "205.00" },
    "stopLoss": { "sl1": "182.00", "sl2": "178.00" },
    "raiseStopLevel": { "method": "Move to Entry at TP1", "value": "189.50" },
    "notes": "Breakout above resistance"
  }
  ```

Backend validation:
- Validates enum values for instrumentType and direction
- Requires expiration + strike for Options
- Accepts tradePlan as JSON object or JSON string (auto-parses)
- Maps flat params into the signal's `data` jsonb field for storage

## Internal CRUD Endpoints

- `GET/POST /api/signals`, `GET/PATCH/DELETE /api/signals/:id`
- `GET/POST /api/connected-apps`, `GET/PATCH/DELETE /api/connected-apps/:id`
- `POST /api/connected-apps/:id/regenerate-key`
- `GET/PUT /api/settings` (upsert by key)
- `GET/POST /api/integrations`, `PATCH/DELETE /api/integrations/:id`
- `GET/POST /api/ibkr/orders`, `GET /api/ibkr/orders/:integrationId`, `PATCH /api/ibkr/orders/:id`
- `GET/POST /api/ibkr/positions`, `GET /api/ibkr/positions/:integrationId`, `PATCH /api/ibkr/positions/:id`
- `GET /api/dashboard/stats`
- `GET /api/activity`
- `GET/POST /api/signal-types`, `PATCH/DELETE /api/signal-types/:id`

## Route Handler Rules

- Keep handlers thin — use the storage interface for all CRUD
- Validate request bodies with Zod schemas from `drizzle-zod`
- Return 201 for successful creation, 200 for reads/updates, 204 or 200 for deletes
- Log significant actions to the activity feed via `storage.createActivity()`
