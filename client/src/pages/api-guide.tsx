import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Check,
  Key,
  Shield,
  TrendingUp,
  Bell,
  Puzzle,
  Settings2,
  Play,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Landmark,
  BarChart3,
  Menu,
  X,
} from "lucide-react";
import type { ConnectedApp } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100" onClick={handleCopy} data-testid="button-copy-code">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg bg-zinc-950 dark:bg-zinc-900/80 border border-zinc-800/60">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    POST: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    PATCH: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    PUT: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    DELETE: "bg-red-500/15 text-red-500 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${colors[method] || colors.GET}`}>
      {method}
    </span>
  );
}

interface EndpointDef {
  method: string;
  path: string;
  description: string;
  auth?: string;
  bodyFields?: { name: string; type: string; required: boolean; description: string }[];
  responseExample?: string;
}

interface SectionDef {
  id: string;
  title: string;
  icon: typeof TrendingUp;
  description: string;
  endpoints: EndpointDef[];
}

function EndpointSection({ endpoint }: { endpoint: EndpointDef }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-border/60 last:border-b-0" data-testid={`endpoint-${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[/:]/g, "-")}`}>
      <div className="p-6 lg:border-r border-border/60">
        <div className="flex items-center gap-3 mb-3">
          <MethodBadge method={endpoint.method} />
          <code className="text-sm font-mono font-medium">{endpoint.path}</code>
          {endpoint.auth && (
            <Badge variant="outline" className="text-[10px] ml-auto">
              <Key className="mr-1 h-2.5 w-2.5" />
              {endpoint.auth}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{endpoint.description}</p>

        {endpoint.bodyFields && endpoint.bodyFields.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Parameters</h4>
            <div className="space-y-0 rounded-lg border overflow-hidden">
              {endpoint.bodyFields.map((field, i) => (
                <div key={field.name} className={`flex items-start gap-3 px-3 py-2.5 text-sm ${i > 0 ? "border-t" : ""}`}>
                  <div className="flex items-center gap-2 min-w-[140px] shrink-0">
                    <code className="text-xs font-mono font-medium text-primary">{field.name}</code>
                    {field.required && <span className="text-[9px] text-red-500 font-medium">required</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground">{field.type}</span>
                    <span className="mx-2 text-muted-foreground/40">-</span>
                    <span className="text-xs text-muted-foreground">{field.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-muted/20 dark:bg-zinc-950/30">
        {endpoint.responseExample ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Response</h4>
            <CodeBlock code={endpoint.responseExample} language="json" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs">
            <span>Standard JSON response</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ section, activeSection, onClick }: { section: SectionDef; activeSection: string; onClick: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const isActive = activeSection === section.id;
  const Icon = section.icon;

  return (
    <div>
      <button
        className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
        onClick={() => { onClick(section.id); setExpanded(!expanded); }}
        data-testid={`nav-section-${section.id}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">{section.title}</span>
        {expanded ? <ChevronDown className="h-3 w-3 opacity-50" /> : <ChevronRight className="h-3 w-3 opacity-50" />}
      </button>
      {expanded && (
        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
          {section.endpoints.map((ep) => {
            const epId = `${section.id}-${ep.method.toLowerCase()}-${ep.path.replace(/[/:]/g, "-")}`;
            return (
              <button
                key={epId}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/30"
                onClick={() => {
                  const el = document.getElementById(epId);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                data-testid={`nav-endpoint-${epId}`}
              >
                <MethodBadge method={ep.method} />
                <code className="font-mono truncate text-[11px]">{ep.path}</code>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApiTester({ apps }: { apps: ConnectedApp[] }) {
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [symbol, setSymbol] = useState("AAPL");
  const [direction, setDirection] = useState("buy");
  const [type, setType] = useState("technical");
  const [confidence, setConfidence] = useState("75");
  const [entryPrice, setEntryPrice] = useState("185.50");
  const [targetPrice, setTargetPrice] = useState("200.00");
  const [stopLoss, setStopLoss] = useState("175.00");
  const [notes, setNotes] = useState("Test signal from API Guide");
  const [response, setResponse] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedApp = apps.find(a => a.id === selectedAppId);

  const curlCommand = `curl -X POST ${window.location.origin}/api/ingest/signals \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${selectedApp?.apiKey || "<your_api_key>"}" \\
  -d '${JSON.stringify({ symbol, direction, type, confidence: parseInt(confidence) || 0, entryPrice: parseFloat(entryPrice) || 0, targetPrice: parseFloat(targetPrice) || null, stopLoss: parseFloat(stopLoss) || null, notes: notes || null })}'`;

  const handleSend = async () => {
    if (!selectedApp?.apiKey) {
      toast({ title: "Select an app", description: "Choose a connected app with an API key first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResponse(null);
    setResponseStatus(null);
    try {
      const res = await fetch("/api/ingest/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${selectedApp.apiKey}` },
        body: JSON.stringify({ symbol, direction, type, confidence: parseInt(confidence) || 0, entryPrice: parseFloat(entryPrice) || 0, targetPrice: parseFloat(targetPrice) || null, stopLoss: parseFloat(stopLoss) || null, notes: notes || null }),
      });
      const data = await res.json();
      setResponseStatus(res.status);
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: any) {
      setResponseStatus(0);
      setResponse(JSON.stringify({ error: error.message }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-border/60" data-testid="section-api-tester" id="tester">
      <div className="p-6 lg:border-r border-border/60">
        <div className="flex items-center gap-2 mb-1">
          <Play className="h-4 w-4 text-emerald-500" />
          <h3 className="font-semibold text-base">Signal Ingestion Tester</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Send a live test signal through the ingestion API using a connected app's API key.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Connected App</label>
            <Select value={selectedAppId} onValueChange={setSelectedAppId}>
              <SelectTrigger data-testid="select-test-app">
                <SelectValue placeholder="Select a connected app..." />
              </SelectTrigger>
              <SelectContent>
                {apps.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    <span className="flex items-center gap-2">
                      <Puzzle className="h-3 w-3" />
                      {app.name}
                      {app.status !== "active" && <Badge variant="secondary" className="text-[9px] h-4">inactive</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedApp?.apiKey && (
              <code className="mt-1.5 block text-[10px] font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                {selectedApp.apiKey.slice(0, 8)}...{selectedApp.apiKey.slice(-4)}
              </code>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Symbol</label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-8 text-sm" data-testid="input-test-symbol" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Direction</label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-test-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-test-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="fundamental">Fundamental</SelectItem>
                  <SelectItem value="sentiment">Sentiment</SelectItem>
                  <SelectItem value="algorithmic">Algorithmic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Confidence %</label>
              <Input type="number" min="0" max="100" value={confidence} onChange={(e) => setConfidence(e.target.value)} className="h-8 text-sm" data-testid="input-test-confidence" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Entry Price</label>
              <Input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className="h-8 text-sm" data-testid="input-test-entry" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Price</label>
              <Input type="number" step="0.01" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} className="h-8 text-sm" data-testid="input-test-target" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Stop Loss</label>
              <Input type="number" step="0.01" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="h-8 text-sm" data-testid="input-test-stoploss" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none h-14 text-sm" data-testid="input-test-notes" />
          </div>

          <Button className="w-full" onClick={handleSend} disabled={loading || !selectedAppId} data-testid="button-send-test">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : <><Send className="mr-2 h-4 w-4" />Send Test Signal</>}
          </Button>
        </div>
      </div>

      <div className="p-6 bg-muted/20 dark:bg-zinc-950/30 space-y-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">cURL Command</h4>
          <CodeBlock code={curlCommand} language="bash" />
        </div>

        {response !== null && (
          <div data-testid="section-test-response">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response</h4>
              {responseStatus !== null && (
                <Badge
                  variant={responseStatus >= 200 && responseStatus < 300 ? "default" : "destructive"}
                  className="text-[10px]"
                  data-testid="badge-response-status"
                >
                  {responseStatus >= 200 && responseStatus < 300 ? (
                    <><CheckCircle2 className="mr-1 h-2.5 w-2.5" />{responseStatus} OK</>
                  ) : (
                    <><XCircle className="mr-1 h-2.5 w-2.5" />{responseStatus} Error</>
                  )}
                </Badge>
              )}
            </div>
            <CodeBlock code={response} language="json" />
          </div>
        )}
      </div>
    </div>
  );
}

const sections: SectionDef[] = [
  {
    id: "signals",
    title: "Signals",
    icon: TrendingUp,
    description: "Manage trading signals. The ingestion endpoint allows connected apps to push signals into TradeSync using their API key.",
    endpoints: [
      {
        method: "POST",
        path: "/api/ingest/signals",
        description: "Push a trading signal from a connected app into TradeSync. Requires a valid API key from a connected app passed via Bearer token authentication.",
        auth: "Bearer Token",
        bodyFields: [
          { name: "symbol", type: "string", required: true, description: "Trading symbol (e.g., AAPL, BTC)" },
          { name: "direction", type: "string", required: true, description: "'buy' or 'sell'" },
          { name: "confidence", type: "integer", required: true, description: "Confidence level 0-100" },
          { name: "entryPrice", type: "number", required: true, description: "Entry price point" },
          { name: "type", type: "string", required: false, description: "Signal type: technical, fundamental, sentiment, algorithmic" },
          { name: "targetPrice", type: "number", required: false, description: "Target take-profit price" },
          { name: "stopLoss", type: "number", required: false, description: "Stop-loss price" },
          { name: "notes", type: "string", required: false, description: "Additional notes or analysis" },
        ],
        responseExample: `{
  "success": true,
  "signal": {
    "id": "abc-123",
    "symbol": "AAPL",
    "direction": "buy",
    "type": "technical",
    "confidence": 75,
    "entryPrice": 185.50,
    "targetPrice": 200.00,
    "stopLoss": 175.00,
    "status": "active",
    "sourceAppName": "Situ Trader",
    "createdAt": "2026-02-26T12:00:00.000Z"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/signals",
        description: "List all trading signals, ordered by most recent first.",
        responseExample: `[
  {
    "id": "abc-123",
    "symbol": "AAPL",
    "direction": "buy",
    "type": "technical",
    "confidence": 75,
    "status": "active",
    ...
  }
]`,
      },
      {
        method: "GET",
        path: "/api/signals/:id",
        description: "Get a specific signal by its unique ID.",
      },
      {
        method: "POST",
        path: "/api/signals",
        description: "Create a signal manually (internal use, no API key required).",
        bodyFields: [
          { name: "symbol", type: "string", required: true, description: "Trading symbol" },
          { name: "direction", type: "string", required: true, description: "'buy' or 'sell'" },
          { name: "type", type: "string", required: true, description: "Signal type" },
          { name: "confidence", type: "integer", required: true, description: "Confidence level 0-100" },
          { name: "entryPrice", type: "number", required: true, description: "Entry price" },
          { name: "targetPrice", type: "number", required: false, description: "Target price" },
          { name: "stopLoss", type: "number", required: false, description: "Stop-loss price" },
          { name: "notes", type: "string", required: false, description: "Notes" },
        ],
      },
      { method: "PATCH", path: "/api/signals/:id", description: "Update an existing signal. Send only the fields you want to change." },
      { method: "DELETE", path: "/api/signals/:id", description: "Delete a signal by ID." },
    ],
  },
  {
    id: "alerts",
    title: "Alerts",
    icon: Bell,
    description: "Create and manage price alerts. Alerts trigger notifications when market conditions are met.",
    endpoints: [
      {
        method: "GET",
        path: "/api/alerts",
        description: "List all price alerts, ordered by most recent first.",
        responseExample: `[
  {
    "id": "def-456",
    "name": "BTC Breakout Watch",
    "symbol": "BTC",
    "condition": "above",
    "targetPrice": 45000,
    "status": "active",
    ...
  }
]`,
      },
      { method: "GET", path: "/api/alerts/:id", description: "Get a specific alert by its unique ID." },
      {
        method: "POST",
        path: "/api/alerts",
        description: "Create a new price alert.",
        bodyFields: [
          { name: "name", type: "string", required: true, description: "Alert name" },
          { name: "symbol", type: "string", required: true, description: "Trading symbol" },
          { name: "condition", type: "string", required: true, description: "'above' or 'below'" },
          { name: "targetPrice", type: "number", required: true, description: "Target price to trigger on" },
          { name: "status", type: "string", required: false, description: "active, paused (default: active)" },
          { name: "priority", type: "string", required: false, description: "low, medium, high (default: medium)" },
        ],
        responseExample: `{
  "id": "def-456",
  "name": "BTC Breakout Watch",
  "symbol": "BTC",
  "condition": "above",
  "targetPrice": 45000,
  "status": "active",
  "priority": "high",
  "triggered": false,
  "createdAt": "2026-02-26T12:00:00.000Z"
}`,
      },
      { method: "PATCH", path: "/api/alerts/:id", description: "Update an existing alert. Send only the fields you want to change." },
      { method: "DELETE", path: "/api/alerts/:id", description: "Delete an alert by ID." },
    ],
  },
  {
    id: "apps",
    title: "Connected Apps",
    icon: Puzzle,
    description: "Manage connected trading apps. Each app receives a unique API key for authenticating against the signal ingestion endpoint.",
    endpoints: [
      {
        method: "GET",
        path: "/api/connected-apps",
        description: "List all connected apps with their API keys, sync settings, and status.",
        responseExample: `[
  {
    "id": "ghi-789",
    "name": "Situ Trader",
    "slug": "situ-trader",
    "status": "active",
    "apiKey": "ts_a1b2c3...",
    "syncAlerts": true,
    "syncSignals": true,
    ...
  }
]`,
      },
      {
        method: "POST",
        path: "/api/connected-apps",
        description: "Register a new connected app. An API key is auto-generated if not provided.",
        bodyFields: [
          { name: "name", type: "string", required: true, description: "App display name" },
          { name: "slug", type: "string", required: true, description: "URL-friendly slug (unique)" },
          { name: "description", type: "string", required: true, description: "App description" },
          { name: "apiEndpoint", type: "string", required: false, description: "App's API endpoint URL" },
          { name: "webhookUrl", type: "string", required: false, description: "Webhook callback URL" },
          { name: "syncAlerts", type: "boolean", required: false, description: "Sync alerts (default: true)" },
          { name: "syncSignals", type: "boolean", required: false, description: "Accept signals (default: true)" },
        ],
      },
      { method: "PATCH", path: "/api/connected-apps/:id", description: "Update a connected app's settings." },
      { method: "POST", path: "/api/connected-apps/:id/regenerate-key", description: "Regenerate the API key for a connected app. The old key stops working immediately." },
      { method: "DELETE", path: "/api/connected-apps/:id", description: "Remove a connected app and invalidate its API key." },
    ],
  },
  {
    id: "ibkr",
    title: "IBKR Trading",
    icon: Landmark,
    description: "View and manage IBKR trade orders and positions submitted through TradeSync.",
    endpoints: [
      {
        method: "GET",
        path: "/api/ibkr/orders",
        description: "List all IBKR orders across all accounts, ordered by most recent first.",
        responseExample: `[
  {
    "id": "abc-123",
    "orderId": "ORD-2401001",
    "symbol": "AAPL",
    "side": "buy",
    "orderType": "limit",
    "quantity": 100,
    "filledQuantity": 100,
    "avgFillPrice": 178.45,
    "status": "filled",
    "sourceAppName": "Situ Trader",
    ...
  }
]`,
      },
      { method: "GET", path: "/api/ibkr/orders/:integrationId", description: "List orders for a specific IBKR account." },
      {
        method: "POST",
        path: "/api/ibkr/orders",
        description: "Create a new IBKR order record.",
        bodyFields: [
          { name: "integrationId", type: "string", required: true, description: "IBKR integration account ID" },
          { name: "orderId", type: "string", required: true, description: "Broker order ID" },
          { name: "symbol", type: "string", required: true, description: "Trading symbol" },
          { name: "side", type: "string", required: true, description: "'buy' or 'sell'" },
          { name: "orderType", type: "string", required: true, description: "market, limit, stop_limit" },
          { name: "quantity", type: "number", required: true, description: "Order quantity" },
          { name: "limitPrice", type: "number", required: false, description: "Limit price" },
          { name: "stopPrice", type: "number", required: false, description: "Stop price" },
          { name: "sourceAppId", type: "string", required: false, description: "Source connected app ID" },
          { name: "sourceAppName", type: "string", required: false, description: "Source app name" },
        ],
      },
      { method: "PATCH", path: "/api/ibkr/orders/:id", description: "Update an IBKR order record (e.g., fill status, cancellation)." },
      {
        method: "GET",
        path: "/api/ibkr/positions",
        description: "List all open IBKR positions across all accounts.",
        responseExample: `[
  {
    "id": "def-456",
    "symbol": "AAPL",
    "quantity": 100,
    "avgCost": 178.45,
    "marketPrice": 182.30,
    "marketValue": 18230,
    "unrealizedPnl": 385.00,
    "sourceAppName": "Situ Trader",
    ...
  }
]`,
      },
      { method: "GET", path: "/api/ibkr/positions/:integrationId", description: "List positions for a specific IBKR account." },
      { method: "POST", path: "/api/ibkr/positions", description: "Create a new IBKR position record." },
      { method: "PATCH", path: "/api/ibkr/positions/:id", description: "Update an IBKR position (e.g., market price, P&L)." },
    ],
  },
  {
    id: "other",
    title: "System",
    icon: Settings2,
    description: "Dashboard statistics, activity logs, system settings, and integration management.",
    endpoints: [
      {
        method: "GET",
        path: "/api/dashboard/stats",
        description: "Get dashboard summary statistics including alert and signal counts.",
        responseExample: `{
  "totalAlerts": 5,
  "activeAlerts": 4,
  "triggeredAlerts": 0,
  "totalSignals": 6,
  "activeSignals": 6
}`,
      },
      { method: "GET", path: "/api/activity", description: "Get the activity log (most recent 50 entries)." },
      { method: "GET", path: "/api/settings", description: "Get all system settings." },
      {
        method: "PUT",
        path: "/api/settings",
        description: "Create or update a system setting (upsert by key).",
        bodyFields: [
          { name: "key", type: "string", required: true, description: "Setting key" },
          { name: "value", type: "string", required: true, description: "Setting value" },
          { name: "category", type: "string", required: true, description: "Category" },
          { name: "label", type: "string", required: true, description: "Display label" },
          { name: "type", type: "string", required: true, description: "boolean or number" },
          { name: "description", type: "string", required: false, description: "Description" },
        ],
      },
      { method: "GET", path: "/api/integrations", description: "List all integrations (Discord channels, IBKR accounts)." },
      { method: "POST", path: "/api/integrations", description: "Add a new integration." },
      { method: "PATCH", path: "/api/integrations/:id", description: "Update an integration's settings." },
      { method: "DELETE", path: "/api/integrations/:id", description: "Remove an integration." },
    ],
  },
];

export default function ApiGuidePage() {
  const [activeSection, setActiveSection] = useState("signals");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });

  if (appsQuery.isLoading) {
    return (
      <div className="flex h-full" data-testid="page-api-guide">
        <div className="w-[260px] border-r p-4 space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  const apps = appsQuery.data ?? [];

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    setMobileNavOpen(false);
    const el = document.getElementById(`section-${sectionId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-[calc(100vh-49px)]" data-testid="page-api-guide">
      <aside className="w-[260px] min-w-[260px] border-r bg-muted/20 dark:bg-zinc-950/20 overflow-y-auto hidden md:block">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">TradeSync API</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">REST API Reference</p>
        </div>

        <div className="p-3 space-y-1">
          <button
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "overview" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            onClick={() => handleSectionClick("overview")}
            data-testid="nav-section-overview"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Authentication</span>
          </button>

          <button
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "tester" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            onClick={() => handleSectionClick("tester")}
            data-testid="nav-section-tester"
          >
            <Play className="h-3.5 w-3.5" />
            <span>API Tester</span>
          </button>

          <Separator className="my-2" />

          {sections.map((section) => (
            <NavItem key={section.id} section={section} activeSection={activeSection} onClick={handleSectionClick} />
          ))}
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-background border-r overflow-y-auto shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">TradeSync API</h2>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMobileNavOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3 space-y-1">
              <button className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "overview" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`} onClick={() => handleSectionClick("overview")}>
                <Shield className="h-3.5 w-3.5" /><span>Authentication</span>
              </button>
              <button className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "tester" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`} onClick={() => handleSectionClick("tester")}>
                <Play className="h-3.5 w-3.5" /><span>API Tester</span>
              </button>
              <Separator className="my-2" />
              {sections.map((section) => (
                <NavItem key={section.id} section={section} activeSection={activeSection} onClick={handleSectionClick} />
              ))}
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="md:hidden sticky top-0 z-40 flex items-center gap-2 px-4 py-2 border-b bg-background">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMobileNavOpen(true)} data-testid="button-mobile-nav">
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">API Reference</span>
        </div>
        <div id="section-overview" className="border-b border-border/60">
          <div className="p-6 pb-4">
            <h1 className="text-2xl font-bold tracking-tight mb-1" data-testid="heading-api-guide">API Reference</h1>
            <p className="text-sm text-muted-foreground">Complete REST API documentation for TradeSync. Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{window.location.origin}</code></p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-border/60">
            <div className="p-6 lg:border-r border-border/60">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-base">Authentication</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                The signal ingestion endpoint (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">POST /api/ingest/signals</code>) requires authentication via a Bearer token.
                All other endpoints are open for internal dashboard use.
              </p>
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Headers</h4>
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-start gap-3 px-3 py-2.5 text-sm">
                    <code className="text-xs font-mono font-medium text-primary min-w-[120px]">Authorization</code>
                    <div>
                      <span className="text-xs text-muted-foreground">string</span>
                      <span className="mx-2 text-muted-foreground/40">-</span>
                      <span className="text-xs text-muted-foreground">Bearer token with your connected app's API key</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-3 py-2.5 text-sm border-t">
                    <code className="text-xs font-mono font-medium text-primary min-w-[120px]">Content-Type</code>
                    <div>
                      <span className="text-xs text-muted-foreground">string</span>
                      <span className="mx-2 text-muted-foreground/40">-</span>
                      <span className="text-xs text-muted-foreground">application/json</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-muted/20 dark:bg-zinc-950/30">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Example Request</h4>
              <CodeBlock code={`curl -X POST ${window.location.origin}/api/ingest/signals \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ts_your_api_key_here" \\
  -d '{"symbol":"AAPL","direction":"buy","confidence":75}'`} language="bash" />
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">API Key Format</h4>
                <CodeBlock code={`ts_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6`} language="text" />
                <p className="text-[11px] text-muted-foreground mt-2">Keys are auto-generated with the <code className="font-mono">ts_</code> prefix when connecting an app.</p>
              </div>
            </div>
          </div>
        </div>

        <div id="section-tester" className="border-b border-border/60">
          <ApiTester apps={apps} />
        </div>

        {sections.map((section) => (
          <div key={section.id} id={`section-${section.id}`}>
            <div className="px-6 py-4 border-b border-border/60 bg-muted/10">
              <div className="flex items-center gap-2">
                <section.icon className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-lg" data-testid={`heading-section-${section.id}`}>{section.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
            </div>
            {section.endpoints.map((ep, i) => {
              const epId = `${section.id}-${ep.method.toLowerCase()}-${ep.path.replace(/[/:]/g, "-")}`;
              return (
                <div key={i} id={epId}>
                  <EndpointSection endpoint={ep} />
                </div>
              );
            })}
          </div>
        ))}
      </main>
    </div>
  );
}
