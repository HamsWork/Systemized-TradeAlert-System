# Architecture Rules

## Tech Stack

- Frontend: React + TypeScript, Vite, TanStack Query v5, Wouter routing, Shadcn UI
- Backend: Express.js with REST API
- Database: PostgreSQL with Drizzle ORM
- Styling: Tailwind CSS with dark mode (class-based, dark by default)

## File Structure

```
shared/schema.ts          — All Drizzle table definitions, Zod schemas, TypeScript types
server/
  db.ts                   — Database connection (keepAlive, error handling)
  storage.ts              — IStorage interface + DatabaseStorage implementation
  routes.ts               — All API route handlers
  seed.ts                 — Seed data for every table
  vite.ts                 — DO NOT MODIFY (Vite dev server setup)
  index.ts                — Express entry point
client/src/
  pages/                  — One file per page (dashboard, signals, etc.)
  components/             — Shared components (app-sidebar, ui/)
  hooks/                  — Custom hooks (use-toast, use-mobile)
  lib/                    — Utilities (queryClient, utils)
```

## Critical Rules

- NEVER modify `server/vite.ts`, `vite.config.ts`, or `drizzle.config.ts`
- NEVER edit `package.json` scripts without asking first
- NEVER change primary key ID column types (serial ↔ varchar breaks migrations)
- Use `npm run db:push --force` to sync schema changes — never write manual SQL migrations
- All shared types live in `shared/schema.ts` — import from `@shared/schema`
- Frontend imports use `@/` alias for `client/src/` and `@assets/` for attached assets
- Backend and frontend are served on the same port via Vite middleware — no proxy config needed

## Conventions

- Keep pages as single files — avoid splitting a page across multiple component files unless it exceeds ~500 lines
- Storage interface (`IStorage`) must be updated for any new CRUD operations
- Route handlers should be thin — delegate logic to the storage layer
- Use `data-testid` attributes on all interactive and meaningful display elements
- Environment variables on frontend must be prefixed with `VITE_` and accessed via `import.meta.env`
