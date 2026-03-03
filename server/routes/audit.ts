import type { Express } from "express";
import { asyncHandler } from "../lib/async-handler";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = process.cwd();

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function scanDir(dir: string, extensions: string[]): { path: string; lines: number }[] {
  const results: { path: string; lines: number }[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", ".local", "attached_assets", ".cache", ".config", ".upm", "references"].includes(entry.name)) continue;
        results.push(...scanDir(fullPath, extensions));
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        const relPath = path.relative(PROJECT_ROOT, fullPath);
        results.push({ path: relPath, lines: countLines(fullPath) });
      }
    }
  } catch {}
  return results;
}

function extractApiEndpoints(): { method: string; path: string; file: string }[] {
  const endpoints: { method: string; path: string; file: string }[] = [];
  const routeDir = path.join(PROJECT_ROOT, "server/routes");
  try {
    const files = fs.readdirSync(routeDir).filter(f => f.endsWith(".ts") && f !== "index.ts");
    for (const file of files) {
      const content = fs.readFileSync(path.join(routeDir, file), "utf-8");
      const regex = /app\.(get|post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`]/gi;
      let match;
      while ((match = regex.exec(content)) !== null) {
        endpoints.push({ method: match[1].toUpperCase(), path: match[2], file: `server/routes/${file}` });
      }
    }
  } catch {}
  return endpoints.sort((a, b) => a.path.localeCompare(b.path));
}

function extractDbTables(): { name: string; file: string; columns: string[] }[] {
  const tables: { name: string; file: string; columns: string[] }[] = [];
  const schemaDir = path.join(PROJECT_ROOT, "shared/schema");
  try {
    const files = fs.readdirSync(schemaDir).filter(f => f.endsWith(".ts"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(schemaDir, file), "utf-8");
      const tableRegex = /export const (\w+)\s*=\s*pgTable\(\s*["'`]([^"'`]+)["'`]/g;
      let match;
      while ((match = tableRegex.exec(content)) !== null) {
        const columns: string[] = [];
        const blockStart = content.indexOf("{", match.index + match[0].length);
        if (blockStart > -1) {
          let depth = 1;
          let i = blockStart + 1;
          let blockContent = "";
          while (i < content.length && depth > 0) {
            if (content[i] === "{") depth++;
            if (content[i] === "}") depth--;
            if (depth > 0) blockContent += content[i];
            i++;
          }
          const colRegex = /(\w+)\s*:\s*(?:varchar|text|integer|boolean|timestamp|jsonb|serial|numeric|real|doublePrecision)/g;
          let colMatch;
          while ((colMatch = colRegex.exec(blockContent)) !== null) {
            columns.push(colMatch[1]);
          }
        }
        tables.push({ name: match[2], file: `shared/schema/${file}`, columns });
      }
    }
  } catch {}
  return tables;
}

function extractServices(): { name: string; file: string; description: string; exports: string[] }[] {
  const services: { name: string; file: string; description: string; exports: string[] }[] = [];
  const serviceDir = path.join(PROJECT_ROOT, "server/services");
  try {
    const files = fs.readdirSync(serviceDir).filter(f => f.endsWith(".ts"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(serviceDir, file), "utf-8");
      const exports: string[] = [];
      const exportRegex = /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      const descriptions: Record<string, string> = {
        "signal-processor.ts": "Signal ingestion pipeline: validates, transforms (TDI format), enriches with market data, stores signals, triggers Discord alerts and IBKR trade execution",
        "trade-executor.ts": "IBKR trade execution: connects to TWS/Gateway, places market entry orders, handles order status and cancellation",
        "trade-monitor.ts": "Background trade monitor: checks active signals every 10s against live prices, fires Discord alerts on target hits/stop loss, updates signal status",
        "discord.ts": "Discord webhook sender: formats signal alerts and trade execution notifications as rich embeds",
        "polygon.ts": "Polygon.io API client: fetches historical OHLCV bars for stocks and option contracts, caches results",
        "ibkr-client.ts": "IbkrClient class wrapping @stoqey/ib IBApi for connection, order/position fetching, market data, historical data",
        "ibkr-sync.ts": "IbkrSyncManager singleton: auto-connects enabled IBKR integrations, syncs orders/positions/prices to DB every 10s with real-time order status callbacks",
      };

      services.push({
        name: file.replace(".ts", ""),
        file: `server/services/${file}`,
        description: descriptions[file] || `Service module: ${file}`,
        exports,
      });
    }
  } catch {}
  return services;
}

interface FeatureMapping {
  name: string;
  description: string;
  layers: {
    frontend?: string[];
    api?: string[];
    logic?: string[];
    storage?: string[];
    schema?: string[];
  };
}

function buildFeatureMap(): FeatureMapping[] {
  return [
    {
      name: "Dashboard",
      description: "System overview with signal pipeline flow, stat cards, recent signals, activity feed, connections status, positions summary",
      layers: {
        frontend: ["client/src/pages/dashboard.tsx"],
        api: ["server/routes/dashboard.ts"],
        storage: ["server/storage/dashboard.ts"],
      },
    },
    {
      name: "Signal Ingestion",
      description: "External apps push signals via POST /api/ingest/signals with Bearer API key auth. Supports standard and TDI formats with auto-detection and transformation",
      layers: {
        api: ["server/routes/signals.ts"],
        logic: ["server/services/signal-processor.ts"],
        storage: ["server/storage/signals.ts"],
        schema: ["shared/schema/signals.ts"],
      },
    },
    {
      name: "Signals Management",
      description: "Full CRUD for trading signals with filtering by status. Signal cards open detail modals with trade charts, price lines, IBKR orders, and activity feed",
      layers: {
        frontend: ["client/src/pages/signals.tsx", "client/src/pages/signal-detail.tsx"],
        api: ["server/routes/signals.ts"],
        storage: ["server/storage/signals.ts"],
        schema: ["shared/schema/signals.ts"],
      },
    },
    {
      name: "Trade Chart & Visualization",
      description: "Candlestick charts with entry/TP/SL price lines. Options signals show tabbed view (option contract vs underlying stock). Polygon.io primary data source with IBKR and TradingView fallbacks",
      layers: {
        frontend: ["client/src/pages/signal-detail.tsx"],
        api: ["server/routes/ibkr.ts"],
        logic: ["server/services/polygon.ts"],
      },
    },
    {
      name: "IBKR Trade Execution",
      description: "Places market entry orders on IBKR TWS/Gateway per connected app settings. Handles contract building for stocks, options, and leveraged ETFs",
      layers: {
        logic: ["server/services/trade-executor.ts"],
        storage: ["server/storage/ibkr.ts"],
        schema: ["shared/schema/ibkr.ts"],
      },
    },
    {
      name: "IBKR Real-Time Sync",
      description: "Background sync manager: maintains persistent connections to IBKR integrations, syncs orders/positions/market prices every 10s with real-time order status callbacks",
      layers: {
        frontend: ["client/src/pages/ibkr.tsx"],
        api: ["server/routes/ibkr.ts"],
        logic: ["server/services/ibkr-sync.ts", "server/services/ibkr-client.ts"],
        storage: ["server/storage/ibkr.ts"],
        schema: ["shared/schema/ibkr.ts"],
      },
    },
    {
      name: "Trade Monitor",
      description: "Background process: checks active signals every 10s against live IBKR prices. Fires Discord alerts on target hits/stop loss triggers. Raises stop loss on TP hits. Marks signals completed/stopped_out",
      layers: {
        logic: ["server/services/trade-monitor.ts"],
        storage: ["server/storage/signals.ts"],
      },
    },
    {
      name: "Discord Notifications",
      description: "Sends rich embed webhooks to Discord channels. Supports per-instrument-type webhooks (Shares/Options/LETF) configured per connected app",
      layers: {
        logic: ["server/services/discord.ts"],
        storage: ["server/storage/discord.ts"],
        schema: ["shared/schema/discord.ts"],
      },
    },
    {
      name: "Connected Apps",
      description: "Manage plugged-in trading apps with API key management (show/hide, copy, regenerate), Discord webhook config, and IBKR account assignment",
      layers: {
        frontend: ["client/src/pages/connected-apps.tsx"],
        api: ["server/routes/apps.ts"],
        storage: ["server/storage/apps.ts"],
        schema: ["shared/schema/apps.ts"],
      },
    },
    {
      name: "Integrations",
      description: "Full CRUD for Discord channels and IBKR trading accounts with per-integration notification and trading toggles",
      layers: {
        frontend: ["client/src/pages/integrations.tsx"],
        api: ["server/routes/integrations.ts"],
        storage: ["server/storage/integrations.ts"],
        schema: ["shared/schema/integrations.ts"],
      },
    },
    {
      name: "Activity Feed",
      description: "System event log tracking all actions: signal ingestion, rejections, trade executions, Discord alerts. Filterable by signal and symbol",
      layers: {
        frontend: ["client/src/pages/activity.tsx"],
        api: ["server/routes/activity.ts"],
        storage: ["server/storage/activity.ts"],
        schema: ["shared/schema/activity.ts"],
      },
    },
    {
      name: "System Settings",
      description: "Key-value toggle/config store organized by category (signals, trading, system) with toggle switches and value inputs",
      layers: {
        frontend: ["client/src/pages/settings.tsx"],
        api: ["server/routes/settings.ts"],
        storage: ["server/storage/settings.ts"],
        schema: ["shared/schema/settings.ts"],
      },
    },
    {
      name: "API Guide",
      description: "Interactive API documentation with live code generation, parameter definitions, and example payloads",
      layers: {
        frontend: ["client/src/pages/api-guide.tsx"],
      },
    },
    {
      name: "System Audit",
      description: "Live self-documenting system overview: scans the actual codebase and generates real-time reports of architecture, feature maps, and file statistics",
      layers: {
        frontend: ["client/src/pages/audit.tsx"],
        api: ["server/routes/audit.ts"],
      },
    },
  ];
}

function buildAuditReport() {
  const allFiles = scanDir(PROJECT_ROOT, [".ts", ".tsx"]);
  const sourceFiles = allFiles.filter(f =>
    !f.path.startsWith("node_modules") &&
    !f.path.includes("/ui/") &&
    !f.path.startsWith("dist")
  );
  const totalLines = sourceFiles.reduce((sum, f) => sum + f.lines, 0);
  const allProjectFiles = allFiles.filter(f => !f.path.startsWith("node_modules") && !f.path.startsWith("dist"));
  const totalProjectLines = allProjectFiles.reduce((sum, f) => sum + f.lines, 0);

  const endpoints = extractApiEndpoints();
  const tables = extractDbTables();
  const services = extractServices();
  const featureMap = buildFeatureMap();

  const frontendFiles = sourceFiles.filter(f => f.path.startsWith("client/"));
  const backendFiles = sourceFiles.filter(f => f.path.startsWith("server/"));
  const sharedFiles = sourceFiles.filter(f => f.path.startsWith("shared/"));

  return {
    generatedAt: new Date().toISOString(),
    architecture: {
      techStack: {
        frontend: "React + TypeScript (Vite, TanStack Query, Wouter, Shadcn UI, Tailwind CSS)",
        backend: "Express.js + TypeScript (tsx runtime)",
        database: "PostgreSQL (Drizzle ORM)",
        charting: "Lightweight Charts (TradingView fallback)",
        broker: "Interactive Brokers (@stoqey/ib)",
        marketData: "Polygon.io REST API",
        notifications: "Discord Webhooks",
      },
      stats: {
        totalFiles: allProjectFiles.length,
        totalLines: totalProjectLines,
        sourceFiles: sourceFiles.length,
        sourceLines: totalLines,
        frontendFiles: frontendFiles.length,
        frontendLines: frontendFiles.reduce((s, f) => s + f.lines, 0),
        backendFiles: backendFiles.length,
        backendLines: backendFiles.reduce((s, f) => s + f.lines, 0),
        sharedFiles: sharedFiles.length,
        sharedLines: sharedFiles.reduce((s, f) => s + f.lines, 0),
        apiEndpoints: endpoints.length,
        databaseTables: tables.length,
        services: services.length,
        features: featureMap.length,
      },
      endpoints,
      tables,
      services,
    },
    featureMap,
    files: sourceFiles,
  };
}

let cachedReport: ReturnType<typeof buildAuditReport> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30_000;

export function registerAuditRoutes(app: Express) {
  app.get(
    "/api/system-audit",
    asyncHandler(async (req, res) => {
      const forceRefresh = req.query.refresh === "true";
      const now = Date.now();
      if (!cachedReport || forceRefresh || now - cacheTime > CACHE_TTL_MS) {
        cachedReport = buildAuditReport();
        cacheTime = now;
      }
      res.json(cachedReport);
    }),
  );
}
