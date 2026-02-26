import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Send,
  Copy,
  Check,
  ChevronRight,
  Terminal,
  Key,
  Shield,
  TrendingUp,
  Bell,
  Activity,
  Puzzle,
  Radio,
  Settings2,
  Play,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
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
    <Button
      size="icon"
      variant="ghost"
      className="h-6 w-6 shrink-0"
      onClick={handleCopy}
      data-testid="button-copy-code"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-zinc-800">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <span className="text-[10px] font-mono text-zinc-500 uppercase">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono text-zinc-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EndpointCard({
  method,
  path,
  description,
  auth,
  bodyFields,
  responseExample,
}: {
  method: string;
  path: string;
  description: string;
  auth?: string;
  bodyFields?: { name: string; type: string; required: boolean; description: string }[];
  responseExample?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const methodColor =
    method === "GET" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" :
    method === "POST" ? "bg-blue-500/10 text-blue-500 border-blue-500/30" :
    method === "PATCH" ? "bg-amber-500/10 text-amber-500 border-amber-500/30" :
    method === "PUT" ? "bg-orange-500/10 text-orange-500 border-orange-500/30" :
    "bg-red-500/10 text-red-500 border-red-500/30";

  return (
    <div className="rounded-lg border" data-testid={`endpoint-${method.toLowerCase()}-${path.replace(/[/:]/g, "-")}`}>
      <button
        className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-${method.toLowerCase()}-${path.replace(/[/:]/g, "-")}`}
      >
        <Badge variant="outline" className={`text-[10px] font-mono font-bold ${methodColor} shrink-0`}>
          {method}
        </Badge>
        <code className="text-sm font-mono flex-1 truncate">{path}</code>
        {auth && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            <Key className="mr-1 h-2.5 w-2.5" />
            {auth}
          </Badge>
        )}
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t p-3 space-y-3 bg-muted/20">
          <p className="text-sm text-muted-foreground">{description}</p>
          {bodyFields && bodyFields.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2">Request Body</p>
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium">Field</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Required</th>
                      <th className="text-left p-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bodyFields.map((field) => (
                      <tr key={field.name} className="border-t">
                        <td className="p-2 font-mono text-primary">{field.name}</td>
                        <td className="p-2 text-muted-foreground">{field.type}</td>
                        <td className="p-2">
                          {field.required ? (
                            <Badge variant="default" className="text-[9px] h-4">required</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] h-4">optional</Badge>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">{field.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {responseExample && (
            <div>
              <p className="text-xs font-medium mb-2">Response Example</p>
              <CodeBlock code={responseExample} language="json" />
            </div>
          )}
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

  const requestBody = JSON.stringify({
    symbol,
    direction,
    type,
    confidence: parseInt(confidence) || 0,
    entryPrice: parseFloat(entryPrice) || 0,
    targetPrice: parseFloat(targetPrice) || null,
    stopLoss: parseFloat(stopLoss) || null,
    notes: notes || null,
  }, null, 2);

  const curlCommand = `curl -X POST ${window.location.origin}/api/ingest/signals \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${selectedApp?.apiKey || "<your_api_key>"}" \\
  -d '${JSON.stringify({
    symbol,
    direction,
    type,
    confidence: parseInt(confidence) || 0,
    entryPrice: parseFloat(entryPrice) || 0,
    targetPrice: parseFloat(targetPrice) || null,
    stopLoss: parseFloat(stopLoss) || null,
    notes: notes || null,
  })}'`;

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
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${selectedApp.apiKey}`,
        },
        body: JSON.stringify({
          symbol,
          direction,
          type,
          confidence: parseInt(confidence) || 0,
          entryPrice: parseFloat(entryPrice) || 0,
          targetPrice: parseFloat(targetPrice) || null,
          stopLoss: parseFloat(stopLoss) || null,
          notes: notes || null,
        }),
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
    <div className="space-y-4" data-testid="section-api-tester">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-4 w-4 text-emerald-500" />
            Signal Ingestion Tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block">Connected App (API Key Source)</label>
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
                      {app.status !== "active" && (
                        <Badge variant="secondary" className="text-[9px] h-4">inactive</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedApp?.apiKey && (
              <div className="mt-1.5 flex items-center gap-2">
                <code className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate">
                  {selectedApp.apiKey.slice(0, 8)}...{selectedApp.apiKey.slice(-4)}
                </code>
              </div>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block">Symbol</label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} data-testid="input-test-symbol" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Direction</label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger data-testid="select-test-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy (Long)</SelectItem>
                  <SelectItem value="sell">Sell (Short)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="select-test-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="fundamental">Fundamental</SelectItem>
                  <SelectItem value="sentiment">Sentiment</SelectItem>
                  <SelectItem value="algorithmic">Algorithmic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Confidence %</label>
              <Input type="number" min="0" max="100" value={confidence} onChange={(e) => setConfidence(e.target.value)} data-testid="input-test-confidence" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block">Entry Price</label>
              <Input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} data-testid="input-test-entry" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Target Price</label>
              <Input type="number" step="0.01" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} data-testid="input-test-target" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Stop Loss</label>
              <Input type="number" step="0.01" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} data-testid="input-test-stoploss" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none h-16"
              data-testid="input-test-notes"
            />
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">cURL Command</p>
              <CopyButton text={curlCommand} />
            </div>
            <CodeBlock code={curlCommand} language="bash" />
          </div>

          <div>
            <p className="text-xs font-medium mb-2">Request Body</p>
            <CodeBlock code={requestBody} language="json" />
          </div>

          <Button
            className="w-full"
            onClick={handleSend}
            disabled={loading || !selectedAppId}
            data-testid="button-send-test"
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
            ) : (
              <><Send className="mr-2 h-4 w-4" />Send Test Signal</>
            )}
          </Button>

          {response !== null && (
            <div data-testid="section-test-response">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-medium">Response</p>
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
        </CardContent>
      </Card>
    </div>
  );
}

const endpoints = {
  signals: [
    {
      method: "POST",
      path: "/api/ingest/signals",
      description: "Push a trading signal from a connected app into TradeSync. Requires a valid API key from a connected app.",
      auth: "Bearer Token",
      bodyFields: [
        { name: "symbol", type: "string", required: true, description: "Trading symbol (e.g., AAPL, BTC)" },
        { name: "direction", type: "string", required: true, description: "'buy' or 'sell'" },
        { name: "confidence", type: "integer", required: true, description: "Confidence level 0-100" },
        { name: "entryPrice", type: "number", required: true, description: "Entry price point" },
        { name: "type", type: "string", required: false, description: "Signal type: technical, fundamental, sentiment, algorithmic (default: algorithmic)" },
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
    },
    {
      method: "GET",
      path: "/api/signals/:id",
      description: "Get a specific signal by ID.",
    },
    {
      method: "POST",
      path: "/api/signals",
      description: "Create a signal manually (no API key required, internal use).",
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
    {
      method: "PATCH",
      path: "/api/signals/:id",
      description: "Update an existing signal. Send only the fields you want to change.",
    },
    {
      method: "DELETE",
      path: "/api/signals/:id",
      description: "Delete a signal by ID.",
    },
  ],
  alerts: [
    {
      method: "GET",
      path: "/api/alerts",
      description: "List all price alerts, ordered by most recent first.",
    },
    {
      method: "GET",
      path: "/api/alerts/:id",
      description: "Get a specific alert by ID.",
    },
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
    },
    {
      method: "PATCH",
      path: "/api/alerts/:id",
      description: "Update an existing alert. Send only the fields you want to change.",
    },
    {
      method: "DELETE",
      path: "/api/alerts/:id",
      description: "Delete an alert by ID.",
    },
  ],
  apps: [
    {
      method: "GET",
      path: "/api/connected-apps",
      description: "List all connected apps with their API keys and sync settings.",
    },
    {
      method: "POST",
      path: "/api/connected-apps",
      description: "Register a new connected app. An API key is auto-generated.",
      bodyFields: [
        { name: "name", type: "string", required: true, description: "App display name" },
        { name: "slug", type: "string", required: true, description: "URL-friendly slug (unique)" },
        { name: "description", type: "string", required: true, description: "App description" },
        { name: "apiEndpoint", type: "string", required: false, description: "App's API endpoint" },
        { name: "webhookUrl", type: "string", required: false, description: "Webhook callback URL" },
        { name: "syncAlerts", type: "boolean", required: false, description: "Sync alerts to this app (default: true)" },
        { name: "syncSignals", type: "boolean", required: false, description: "Accept signals from this app (default: true)" },
      ],
    },
    {
      method: "PATCH",
      path: "/api/connected-apps/:id",
      description: "Update a connected app's settings.",
    },
    {
      method: "POST",
      path: "/api/connected-apps/:id/regenerate-key",
      description: "Regenerate the API key for a connected app. The old key will stop working immediately.",
    },
    {
      method: "DELETE",
      path: "/api/connected-apps/:id",
      description: "Remove a connected app and invalidate its API key.",
    },
  ],
  other: [
    {
      method: "GET",
      path: "/api/dashboard/stats",
      description: "Get dashboard summary statistics (alert counts, signal counts).",
    },
    {
      method: "GET",
      path: "/api/activity",
      description: "Get the activity log (most recent 50 entries).",
    },
    {
      method: "GET",
      path: "/api/settings",
      description: "Get all system settings.",
    },
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
    {
      method: "GET",
      path: "/api/integrations",
      description: "List all integrations (Discord channels, IBKR accounts).",
    },
    {
      method: "POST",
      path: "/api/integrations",
      description: "Add a new integration.",
    },
    {
      method: "PATCH",
      path: "/api/integrations/:id",
      description: "Update an integration's settings.",
    },
    {
      method: "DELETE",
      path: "/api/integrations/:id",
      description: "Remove an integration.",
    },
  ],
};

export default function ApiGuidePage() {
  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });

  if (appsQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </div>
    );
  }

  const apps = appsQuery.data ?? [];

  return (
    <div className="space-y-6 p-6" data-testid="page-api-guide">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">API Guide</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Full API documentation and interactive testing for TradeSync endpoints
        </p>
      </div>

      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Shield className="h-5 w-5 text-blue-500" />
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Authentication</p>
              <p className="text-muted-foreground">
                The signal ingestion endpoint requires an API key from a connected app.
                Include it in the request header:
              </p>
              <CodeBlock code={`Authorization: Bearer ts_your_api_key_here`} language="http" />
              <p className="text-muted-foreground text-xs">
                API keys are generated automatically when you connect an app. Manage them on the Connected Apps page.
                All other endpoints are currently open for internal use.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="test" className="w-full">
        <TabsList className="w-full justify-start flex-wrap" data-testid="tabs-api-guide">
          <TabsTrigger value="test" data-testid="tab-test">
            <Terminal className="mr-1.5 h-3.5 w-3.5" />
            Test API
          </TabsTrigger>
          <TabsTrigger value="signals" data-testid="tab-signals">
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
            Signals
          </TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="apps" data-testid="tab-apps">
            <Puzzle className="mr-1.5 h-3.5 w-3.5" />
            Connected Apps
          </TabsTrigger>
          <TabsTrigger value="other" data-testid="tab-other">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Other
          </TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="mt-4">
          <ApiTester apps={apps} />
        </TabsContent>

        <TabsContent value="signals" className="mt-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Signal Endpoints</h2>
          </div>
          {endpoints.signals.map((ep, i) => (
            <EndpointCard key={i} {...ep} />
          ))}
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Alert Endpoints</h2>
          </div>
          {endpoints.alerts.map((ep, i) => (
            <EndpointCard key={i} {...ep} />
          ))}
        </TabsContent>

        <TabsContent value="apps" className="mt-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Puzzle className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Connected App Endpoints</h2>
          </div>
          {endpoints.apps.map((ep, i) => (
            <EndpointCard key={i} {...ep} />
          ))}
        </TabsContent>

        <TabsContent value="other" className="mt-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Other Endpoints</h2>
          </div>
          {endpoints.other.map((ep, i) => (
            <EndpointCard key={i} {...ep} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
