import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Puzzle,
  Settings2,
  ChevronDown,
  ChevronRight,
  Zap,
  Landmark,
  Menu,
  X,
  Maximize2,
  Lock,
  RotateCcw,
  Braces,
  Info,
} from "lucide-react";
import type { ConnectedApp } from "@shared/schema";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 hover:opacity-100" onClick={handleCopy} data-testid="button-copy-code">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
    </Button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    PATCH: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    PUT: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${colors[method] || colors.GET}`}>
      {method}
    </span>
  );
}

interface ParamDef {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enumValues?: string[];
}

interface EndpointDef {
  method: string;
  path: string;
  description: string;
  auth?: string;
  params?: ParamDef[];
  responseExample?: string;
}

interface SectionDef {
  id: string;
  title: string;
  icon: typeof TrendingUp;
  description: string;
  endpoints: EndpointDef[];
}

function parseParamValue(key: string, value: string, paramDefs?: ParamDef[]): any {
  const def = paramDefs?.find(p => p.name === key);
  if (def?.type === "json") {
    try { return JSON.parse(value); } catch { return value; }
  }
  const num = Number(value);
  return !isNaN(num) && value !== "" ? num : value;
}

function generateCode(method: string, path: string, params: Record<string, string>, lang: string, baseUrl: string, authKey?: string, paramDefs?: ParamDef[]): string {
  const hasBody = method === "POST" || method === "PATCH" || method === "PUT";
  const filledParams = Object.entries(params).filter(([_, v]) => v.trim() !== "");

  let resolvedPath = path;
  const pathParams = path.match(/:(\w+)/g)?.map(p => p.slice(1)) || [];
  pathParams.forEach(p => {
    if (params[p]) resolvedPath = resolvedPath.replace(`:${p}`, params[p]);
  });

  const queryParams = !hasBody ? filledParams.filter(([k]) => !pathParams.includes(k)) : [];
  const bodyParams = hasBody ? filledParams.filter(([k]) => !pathParams.includes(k)) : [];
  const qs = queryParams.length > 0 ? "?" + queryParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const url = `${baseUrl}${resolvedPath}${qs}`;
  const authHeader = authKey ? authKey : "YOUR_API_KEY";

  if (lang === "shell") {
    let cmd = `curl -X ${method} "${url}"`;
    if (authKey || path.includes("ingest")) cmd += ` \\\n  -H "Authorization: Bearer ${authHeader}"`;
    if (hasBody && bodyParams.length > 0) {
      cmd += ` \\\n  -H "Content-Type: application/json"`;
      const body: Record<string, any> = {};
      bodyParams.forEach(([k, v]) => { body[k] = parseParamValue(k, v, paramDefs); });
      cmd += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
    }
    return cmd;
  }

  if (lang === "python") {
    let code = `import requests\n\n`;
    const headers: Record<string, string> = {};
    if (authKey || path.includes("ingest")) headers["Authorization"] = `Bearer ${authHeader}`;
    if (hasBody) headers["Content-Type"] = "application/json";
    if (Object.keys(headers).length > 0) {
      code += `headers = ${JSON.stringify(headers, null, 2)}\n\n`;
    }
    if (hasBody && bodyParams.length > 0) {
      const body: Record<string, any> = {};
      bodyParams.forEach(([k, v]) => { body[k] = parseParamValue(k, v, paramDefs); });
      code += `data = ${JSON.stringify(body, null, 2)}\n\n`;
      code += `response = requests.${method.toLowerCase()}(\n  "${url}",\n  headers=headers,\n  json=data\n)`;
    } else {
      code += `response = requests.${method.toLowerCase()}(\n  "${url}"${Object.keys(headers).length > 0 ? ",\n  headers=headers" : ""}\n)`;
    }
    code += `\nprint(response.json())`;
    return code;
  }

  if (lang === "javascript") {
    let code = `const response = await fetch("${url}", {\n  method: "${method}"`;
    const headers: Record<string, string> = {};
    if (authKey || path.includes("ingest")) headers["Authorization"] = `Bearer ${authHeader}`;
    if (hasBody) headers["Content-Type"] = "application/json";
    if (Object.keys(headers).length > 0) {
      code += `,\n  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, "\n  ")}`;
    }
    if (hasBody && bodyParams.length > 0) {
      const body: Record<string, any> = {};
      bodyParams.forEach(([k, v]) => { body[k] = parseParamValue(k, v, paramDefs); });
      code += `,\n  body: JSON.stringify(${JSON.stringify(body, null, 4).replace(/\n/g, "\n  ")})`;
    }
    code += `\n});\n\nconst data = await response.json();\nconsole.log(data);`;
    return code;
  }

  if (lang === "go") {
    let code = `package main\n\nimport (\n  "fmt"\n  "net/http"\n  "io"\n`;
    if (hasBody && bodyParams.length > 0) code += `  "strings"\n`;
    code += `)\n\nfunc main() {\n`;
    if (hasBody && bodyParams.length > 0) {
      const body: Record<string, any> = {};
      bodyParams.forEach(([k, v]) => { body[k] = parseParamValue(k, v, paramDefs); });
      code += `  payload := strings.NewReader(\`${JSON.stringify(body, null, 2)}\`)\n`;
      code += `  req, _ := http.NewRequest("${method}", "${url}", payload)\n`;
    } else {
      code += `  req, _ := http.NewRequest("${method}", "${url}", nil)\n`;
    }
    if (authKey || path.includes("ingest")) code += `  req.Header.Set("Authorization", "Bearer ${authHeader}")\n`;
    if (hasBody) code += `  req.Header.Set("Content-Type", "application/json")\n`;
    code += `  resp, _ := http.DefaultClient.Do(req)\n  defer resp.Body.Close()\n  body, _ := io.ReadAll(resp.Body)\n  fmt.Println(string(body))\n}`;
    return code;
  }

  return "";
}

function EndpointInteractive({ endpoint, baseUrl, authKey }: { endpoint: EndpointDef; baseUrl: string; authKey?: string }) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [codeLang, setCodeLang] = useState("shell");
  const [responseTab, setResponseTab] = useState("sample");
  const [queryResponse, setQueryResponse] = useState<string | null>(null);
  const [queryStatus, setQueryStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const setParam = (name: string, value: string) => {
    setParamValues(prev => ({ ...prev, [name]: value }));
  };

  const resetValues = () => {
    setParamValues({});
    setQueryResponse(null);
    setQueryStatus(null);
  };

  const codeOutput = useMemo(() =>
    generateCode(endpoint.method, endpoint.path, paramValues, codeLang, baseUrl, authKey, endpoint.params),
    [endpoint.method, endpoint.path, paramValues, codeLang, baseUrl, authKey, endpoint.params]
  );

  const hasBody = endpoint.method === "POST" || endpoint.method === "PATCH" || endpoint.method === "PUT";
  const filledParams = Object.entries(paramValues).filter(([_, v]) => v.trim() !== "");
  const pathParams = endpoint.path.match(/:(\w+)/g)?.map(p => p.slice(1)) || [];

  let resolvedPath = endpoint.path;
  pathParams.forEach(p => {
    if (paramValues[p]) resolvedPath = resolvedPath.replace(`:${p}`, paramValues[p]);
  });
  const queryEntries = !hasBody ? filledParams.filter(([k]) => !pathParams.includes(k)) : [];
  const qs = queryEntries.length > 0 ? "?" + queryEntries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const queryUrl = `${baseUrl}${resolvedPath}${qs}`;

  const runQuery = async () => {
    setLoading(true);
    setQueryResponse(null);
    setQueryStatus(null);
    try {
      const headers: Record<string, string> = {};
      if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
      if (hasBody) headers["Content-Type"] = "application/json";

      const bodyParams = hasBody ? filledParams.filter(([k]) => !pathParams.includes(k)) : [];
      let body: string | undefined;
      if (hasBody && bodyParams.length > 0) {
        const obj: Record<string, any> = {};
        bodyParams.forEach(([k, v]) => { obj[k] = parseParamValue(k, v, endpoint.params); });
        body = JSON.stringify(obj);
      }

      const res = await fetch(resolvedPath + qs, { method: endpoint.method, headers, body });
      const data = await res.json();
      setQueryStatus(res.status);
      setQueryResponse(JSON.stringify(data, null, 2));
      setResponseTab("query");
    } catch (error: any) {
      setQueryStatus(0);
      setQueryResponse(JSON.stringify({ error: error.message }, null, 2));
      setResponseTab("query");
    } finally {
      setLoading(false);
    }
  };

  const params = endpoint.params || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0" data-testid={`endpoint-${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[/:]/g, "-")}`}>
      <div className="p-6 lg:border-r border-border/60">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" data-testid="heading-query-params">
            {hasBody ? "Body Parameters" : "Query Parameters"}
          </h3>
          {params.length > 0 && (
            <Button variant="outline" size="sm" onClick={resetValues} className="text-xs" data-testid="button-reset-values">
              <RotateCcw className="mr-1.5 h-3 w-3" />
              Reset values
            </Button>
          )}
        </div>

        {params.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No parameters for this endpoint.</p>
        ) : (
          <div className="space-y-4">
            {params.filter(p => p.type !== "json").map((param) => (
              <div key={param.name} data-testid={`param-${param.name}`} className="group">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-semibold text-foreground/90">{param.name}</code>
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-zinc-800/60 text-zinc-400">{param.type}</Badge>
                    {param.required && <span className="text-[10px] text-red-400/90 font-medium uppercase tracking-wider">required</span>}
                  </div>
                  {param.enumValues ? (
                    <Select value={paramValues[param.name] || ""} onValueChange={(v) => setParam(param.name, v)}>
                      <SelectTrigger className="w-[180px] h-8 bg-zinc-900/40 dark:bg-zinc-900/60 border-zinc-700/40 text-sm focus:ring-1 focus:ring-primary/30 transition-colors" data-testid={`select-param-${param.name}`}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {param.enumValues.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={paramValues[param.name] || ""}
                      onChange={(e) => setParam(param.name, e.target.value)}
                      className="w-[180px] h-8 bg-zinc-900/40 dark:bg-zinc-900/60 border-zinc-700/40 text-sm focus:ring-1 focus:ring-primary/30 transition-colors"
                      placeholder=""
                      data-testid={`input-param-${param.name}`}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground/70 leading-relaxed pl-0.5">{param.description}</p>
              </div>
            ))}

            {params.filter(p => p.type === "json").map((param) => (
              <div key={param.name} data-testid={`param-${param.name}`} className="mt-2">
                <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/30 dark:bg-zinc-900/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/30 bg-zinc-800/20">
                    <div className="flex items-center gap-2">
                      <Braces className="h-3.5 w-3.5 text-primary/70" />
                      <code className="text-sm font-mono font-semibold text-foreground/90">{param.name}</code>
                      <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-primary/10 text-primary/80 border-primary/20">json</Badge>
                      {param.required && <span className="text-[10px] text-red-400/90 font-medium uppercase tracking-wider">required</span>}
                    </div>
                  </div>
                  <div className="p-3">
                    <Textarea
                      value={paramValues[param.name] || ""}
                      onChange={(e) => setParam(param.name, e.target.value)}
                      className="w-full bg-zinc-950/60 dark:bg-zinc-950/80 border-zinc-700/30 text-sm font-mono min-h-[140px] resize-y leading-relaxed focus:ring-1 focus:ring-primary/30 placeholder:text-zinc-600 transition-colors"
                      placeholder={'{\n  "targetLevels": {\n    "tp1": "195.00",\n    "tp2": "200.00",\n    "tp3": "205.00"\n  },\n  "stopLoss": {\n    "sl1": "182.00",\n    "sl2": "178.00"\n  },\n  "raiseStopLevel": {\n    "method": "Move to Entry at TP1",\n    "value": "189.50"\n  },\n  "notes": "Breakout above resistance"\n}'}
                      data-testid={`input-param-${param.name}`}
                    />
                  </div>
                  <div className="px-4 py-2 border-t border-zinc-700/20 bg-zinc-800/10">
                    <div className="flex items-start gap-1.5">
                      <Info className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{param.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {endpoint.auth && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Key className="h-3 w-3" />
              <span>Requires {endpoint.auth} authentication</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-zinc-950/40 dark:bg-zinc-950/60 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold" data-testid="heading-code-examples">Code Examples</h3>
            <div className="flex items-center gap-1">
              <CopyButton text={codeOutput} />
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 hover:opacity-100" data-testid="button-expand-code">
                <Maximize2 className="h-3.5 w-3.5 text-zinc-400" />
              </Button>
            </div>
          </div>
          <Tabs value={codeLang} onValueChange={setCodeLang}>
            <TabsList className="bg-zinc-800/50 border border-zinc-700/50 h-8 p-0.5">
              <TabsTrigger value="shell" className="text-xs px-3 h-7 data-[state=active]:bg-zinc-700 data-[state=active]:text-white" data-testid="tab-lang-shell">Shell</TabsTrigger>
              <TabsTrigger value="python" className="text-xs px-3 h-7 data-[state=active]:bg-zinc-700 data-[state=active]:text-white" data-testid="tab-lang-python">Python</TabsTrigger>
              <TabsTrigger value="go" className="text-xs px-3 h-7 data-[state=active]:bg-zinc-700 data-[state=active]:text-white" data-testid="tab-lang-go">Go</TabsTrigger>
              <TabsTrigger value="javascript" className="text-xs px-3 h-7 data-[state=active]:bg-zinc-700 data-[state=active]:text-white" data-testid="tab-lang-javascript">JavaScript</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-2 rounded-lg bg-zinc-900/80 border border-zinc-800/60 overflow-hidden">
            <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap break-all">
              <code>{codeOutput}</code>
            </pre>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold mb-3" data-testid="heading-query-url">Query URL</h3>
          <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/60 p-3 flex items-start gap-2">
            <MethodBadge method={endpoint.method} />
            <code className="text-[13px] font-mono text-zinc-300 break-all flex-1">{queryUrl}</code>
            <CopyButton text={queryUrl} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              {!authKey && endpoint.auth && (
                <>
                  <Lock className="h-3 w-3" />
                  <span>Requires API key to run</span>
                </>
              )}
            </div>
            <Button
              size="sm"
              onClick={runQuery}
              disabled={loading}
              className="text-xs"
              data-testid="button-run-query"
            >
              {loading ? "Running..." : "Run Query"}
              {!authKey && endpoint.auth && <Lock className="ml-1.5 h-3 w-3" />}
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold mb-3" data-testid="heading-response-object">Response Object</h3>
          <Tabs value={responseTab} onValueChange={setResponseTab}>
            <div className="flex items-center justify-between">
              <TabsList className="bg-transparent border-b border-zinc-800/60 rounded-none h-auto p-0 gap-0">
                <TabsTrigger
                  value="sample"
                  className="text-xs px-4 pb-2 pt-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  data-testid="tab-response-sample"
                >
                  Sample Response
                </TabsTrigger>
                <TabsTrigger
                  value="query"
                  className="text-xs px-4 pb-2 pt-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  data-testid="tab-response-query"
                >
                  Query Response
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-1">
                <CopyButton text={responseTab === "sample" ? (endpoint.responseExample || "{}") : (queryResponse || "")} />
                <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 hover:opacity-100" data-testid="button-expand-response">
                  <Maximize2 className="h-3.5 w-3.5 text-zinc-400" />
                </Button>
              </div>
            </div>
            <TabsContent value="sample" className="mt-0">
              <div className="rounded-b-lg bg-zinc-900/80 border border-t-0 border-zinc-800/60 overflow-hidden">
                <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed max-h-[300px]">
                  <code>{endpoint.responseExample || '{\n  "message": "Success"\n}'}</code>
                </pre>
              </div>
            </TabsContent>
            <TabsContent value="query" className="mt-0">
              <div className="rounded-b-lg bg-zinc-900/80 border border-t-0 border-zinc-800/60 overflow-hidden">
                {queryResponse ? (
                  <div>
                    {queryStatus !== null && (
                      <div className={`px-4 py-2 border-b border-zinc-800/60 text-xs font-mono ${queryStatus >= 200 && queryStatus < 300 ? "text-emerald-400" : "text-red-400"}`}>
                        Status: {queryStatus}
                      </div>
                    )}
                    <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed max-h-[300px]">
                      <code>{queryResponse}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Click "Run Query" to see the response
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function NavItem({ section, activeSection, activePath, onClick, onEndpointClick }: {
  section: SectionDef;
  activeSection: string;
  activePath: string;
  onClick: (id: string) => void;
  onEndpointClick: (sectionId: string, epIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(activeSection === section.id);
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
          {section.endpoints.map((ep, i) => {
            const epKey = `${ep.method}-${ep.path}`;
            return (
              <button
                key={epKey}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded transition-colors ${activePath === epKey ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
                onClick={() => onEndpointClick(section.id, i)}
                data-testid={`nav-endpoint-${section.id}-${i}`}
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
        params: [
          { name: "signalType", type: "string", required: false, description: "Signal type name (e.g., 'Common Trade Alert'). Provide this or signalTypeId." },
          { name: "signalTypeId", type: "string", required: false, description: "Signal type UUID. Alternative to signalType name." },
          { name: "ticker", type: "string", required: true, description: "Ticker symbol (e.g., 'AAPL', 'TSLA', 'SPY')." },
          { name: "instrumentType", type: "string", required: true, description: "Instrument type.", enumValues: ["Options", "Shares", "LETF"] },
          { name: "direction", type: "string", required: true, description: "Trade direction.", enumValues: ["Long", "Short"] },
          { name: "expiration", type: "string", required: false, description: "Option expiration date (e.g., '2026-03-20'). Required for Options." },
          { name: "strike", type: "string", required: false, description: "Option strike price (e.g., '190'). Required for Options." },
          { name: "entryPrice", type: "string", required: false, description: "Entry price for the trade (e.g., '189.50')." },
          { name: "tradePlan", type: "json", required: false, description: "Trade plan with target levels, stop losses, and raise stop settings." },
        ],
        responseExample: `{
  "success": true,
  "signal": {
    "id": "abc-123",
    "signalTypeId": "type-456",
    "data": {
      "ticker": "AAPL",
      "instrument_type": "Options",
      "direction": "Long",
      "entry_price": "189.50",
      "expiration": "2026-03-20",
      "strike": "190",
      "stop_loss_1": "182.00",
      "take_profit_1": "195.00",
      "take_profit_2": "200.00",
      "take_profit_3": "205.00",
      "raise_stop_method": "Move to Entry at TP1",
      "trade_plan": "Breakout above 188 resistance."
    },
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
        params: [],
        responseExample: `[
  {
    "id": "abc-123",
    "signalTypeId": "type-456",
    "data": {
      "ticker": "AAPL",
      "instrument_type": "Options",
      "direction": "Long",
      "entry_price": "189.50",
      "expiration": "2026-03-20",
      "strike": "190",
      "stop_loss_1": "182.00",
      "take_profit_1": "195.00",
      "take_profit_2": "200.00",
      "raise_stop_method": "Move to Entry at TP1",
      "trade_plan": "Breakout above 188 resistance."
    },
    "status": "active",
    "sourceAppName": "Situ Trader",
    "createdAt": "2026-02-26T12:00:00.000Z"
  }
]`,
      },
      {
        method: "GET",
        path: "/api/signals/:id",
        description: "Get a specific signal by its unique ID.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID format)." },
        ],
      },
      {
        method: "POST",
        path: "/api/signals",
        description: "Create a signal manually (internal use, no API key required).",
        params: [
          { name: "signalTypeId", type: "string", required: true, description: "ID of the signal type to use" },
          { name: "data", type: "json", required: true, description: "JSON object with signal data matching the signal type's variables" },
          { name: "status", type: "string", required: false, description: "Signal status", enumValues: ["active", "closed", "expired"] },
        ],
      },
      {
        method: "PATCH",
        path: "/api/signals/:id",
        description: "Update an existing signal. Send only the fields you want to change.",
        params: [
          { name: "id", type: "string", required: true, description: "Signal ID to update" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/signals/:id",
        description: "Delete a signal by ID.",
        params: [
          { name: "id", type: "string", required: true, description: "Signal ID to delete" },
        ],
      },
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
        params: [],
        responseExample: `[
  {
    "id": "ghi-789",
    "name": "Situ Trader",
    "slug": "situ-trader",
    "status": "active",
    "apiKey": "ts_a1b2c3...",
    "syncSignals": true
  }
]`,
      },
      {
        method: "POST",
        path: "/api/connected-apps",
        description: "Register a new connected app. An API key is auto-generated if not provided.",
        params: [
          { name: "name", type: "string", required: true, description: "App display name" },
          { name: "slug", type: "string", required: true, description: "URL-friendly slug (unique)" },
          { name: "description", type: "string", required: true, description: "App description" },
          { name: "apiEndpoint", type: "string", required: false, description: "App's API endpoint URL" },
          { name: "webhookUrl", type: "string", required: false, description: "Webhook callback URL" },
          { name: "syncSignals", type: "boolean", required: false, description: "Accept signals (default: true)" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/connected-apps/:id",
        description: "Update a connected app's settings.",
        params: [
          { name: "id", type: "string", required: true, description: "App ID to update" },
        ],
      },
      {
        method: "POST",
        path: "/api/connected-apps/:id/regenerate-key",
        description: "Regenerate the API key for a connected app. The old key stops working immediately.",
        params: [
          { name: "id", type: "string", required: true, description: "App ID to regenerate key for" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/connected-apps/:id",
        description: "Remove a connected app and invalidate its API key.",
        params: [
          { name: "id", type: "string", required: true, description: "App ID to delete" },
        ],
      },
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
        params: [],
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
    "sourceAppName": "Situ Trader"
  }
]`,
      },
      {
        method: "GET",
        path: "/api/ibkr/orders/:integrationId",
        description: "List orders for a specific IBKR account.",
        params: [
          { name: "integrationId", type: "string", required: true, description: "IBKR integration account ID" },
        ],
      },
      {
        method: "POST",
        path: "/api/ibkr/orders",
        description: "Create a new IBKR order record.",
        params: [
          { name: "integrationId", type: "string", required: true, description: "IBKR integration account ID" },
          { name: "orderId", type: "string", required: true, description: "Broker order ID" },
          { name: "symbol", type: "string", required: true, description: "Trading symbol" },
          { name: "side", type: "string", required: true, description: "Order side", enumValues: ["buy", "sell"] },
          { name: "orderType", type: "string", required: true, description: "Order execution type", enumValues: ["market", "limit", "stop_limit"] },
          { name: "quantity", type: "number", required: true, description: "Order quantity" },
          { name: "limitPrice", type: "number", required: false, description: "Limit price for limit orders" },
          { name: "stopPrice", type: "number", required: false, description: "Stop price for stop orders" },
          { name: "sourceAppId", type: "string", required: false, description: "Source connected app ID" },
          { name: "sourceAppName", type: "string", required: false, description: "Source app display name" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/ibkr/orders/:id",
        description: "Update an IBKR order record (e.g., fill status, cancellation).",
        params: [
          { name: "id", type: "string", required: true, description: "Order ID to update" },
        ],
      },
      {
        method: "GET",
        path: "/api/ibkr/positions",
        description: "List all open IBKR positions across all accounts.",
        params: [],
        responseExample: `[
  {
    "id": "def-456",
    "symbol": "AAPL",
    "quantity": 100,
    "avgCost": 178.45,
    "marketPrice": 182.30,
    "marketValue": 18230,
    "unrealizedPnl": 385.00,
    "sourceAppName": "Situ Trader"
  }
]`,
      },
      {
        method: "GET",
        path: "/api/ibkr/positions/:integrationId",
        description: "List positions for a specific IBKR account.",
        params: [
          { name: "integrationId", type: "string", required: true, description: "IBKR integration account ID" },
        ],
      },
      {
        method: "POST",
        path: "/api/ibkr/positions",
        description: "Create a new IBKR position record.",
        params: [
          { name: "integrationId", type: "string", required: true, description: "IBKR integration account ID" },
          { name: "symbol", type: "string", required: true, description: "Trading symbol" },
          { name: "quantity", type: "number", required: true, description: "Number of shares" },
          { name: "avgCost", type: "number", required: true, description: "Average cost basis" },
          { name: "marketPrice", type: "number", required: false, description: "Current market price" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/ibkr/positions/:id",
        description: "Update an IBKR position (e.g., market price, P&L).",
        params: [
          { name: "id", type: "string", required: true, description: "Position ID to update" },
        ],
      },
    ],
  },
  {
    id: "system",
    title: "System",
    icon: Settings2,
    description: "Dashboard statistics, activity logs, system settings, and integration management.",
    endpoints: [
      {
        method: "GET",
        path: "/api/dashboard/stats",
        description: "Get dashboard summary statistics including signal and trading data.",
        params: [],
        responseExample: `{
  "totalSignals": 6,
  "activeSignals": 6
}`,
      },
      {
        method: "GET",
        path: "/api/activity",
        description: "Get the activity log (most recent 50 entries).",
        params: [],
      },
      {
        method: "GET",
        path: "/api/settings",
        description: "Get all system settings.",
        params: [],
      },
      {
        method: "PUT",
        path: "/api/settings",
        description: "Create or update a system setting (upsert by key).",
        params: [
          { name: "key", type: "string", required: true, description: "Setting key identifier" },
          { name: "value", type: "string", required: true, description: "Setting value" },
          { name: "category", type: "string", required: true, description: "Category grouping", enumValues: ["signals", "trading", "system"] },
          { name: "label", type: "string", required: true, description: "Display label for the setting" },
          { name: "type", type: "string", required: true, description: "Value type", enumValues: ["boolean", "number"] },
          { name: "description", type: "string", required: false, description: "Description of the setting" },
        ],
      },
      {
        method: "GET",
        path: "/api/integrations",
        description: "List all integrations (Discord channels, IBKR accounts).",
        params: [],
      },
      {
        method: "POST",
        path: "/api/integrations",
        description: "Add a new integration.",
        params: [
          { name: "name", type: "string", required: true, description: "Integration name" },
          { name: "type", type: "string", required: true, description: "Integration type", enumValues: ["discord", "ibkr"] },
        ],
      },
      {
        method: "PATCH",
        path: "/api/integrations/:id",
        description: "Update an integration's settings.",
        params: [
          { name: "id", type: "string", required: true, description: "Integration ID to update" },
        ],
      },
      {
        method: "DELETE",
        path: "/api/integrations/:id",
        description: "Remove an integration.",
        params: [
          { name: "id", type: "string", required: true, description: "Integration ID to remove" },
        ],
      },
    ],
  },
];

export default function ApiGuidePage() {
  const [activeSection, setActiveSection] = useState("signals");
  const [activeEndpointIndex, setActiveEndpointIndex] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (appsQuery.isLoading) {
    return (
      <div className="flex h-full" data-testid="page-api-guide">
        <div className="w-[260px] border-r p-4 space-y-3 hidden md:block">
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
  const activeApp = apps.find(a => a.status === "active");

  const currentSection = activeSection === "auth"
    ? null
    : sections.find(s => s.id === activeSection);
  const currentEndpoint = currentSection?.endpoints[activeEndpointIndex];
  const activePath = currentEndpoint ? `${currentEndpoint.method}-${currentEndpoint.path}` : "";

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    setActiveEndpointIndex(0);
    setMobileNavOpen(false);
  };

  const handleEndpointClick = (sectionId: string, epIndex: number) => {
    setActiveSection(sectionId);
    setActiveEndpointIndex(epIndex);
    setMobileNavOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm" data-testid="text-api-title">TradeSync API</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">REST API Reference</p>
      </div>
      <div className="p-3 space-y-1">
        <button
          className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "auth" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          onClick={() => handleSectionClick("auth")}
          data-testid="nav-section-auth"
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Authentication</span>
        </button>
        <Separator className="my-2" />
        {sections.map((section) => (
          <NavItem
            key={section.id}
            section={section}
            activeSection={activeSection}
            activePath={activePath}
            onClick={handleSectionClick}
            onEndpointClick={handleEndpointClick}
          />
        ))}
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-49px)]" data-testid="page-api-guide">
      <aside className="w-[260px] min-w-[260px] border-r bg-muted/20 dark:bg-zinc-950/20 overflow-y-auto hidden md:block">
        {sidebarContent}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-background border-r overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">TradeSync API</h2>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMobileNavOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3 space-y-1">
              <button className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "auth" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`} onClick={() => handleSectionClick("auth")}>
                <Shield className="h-3.5 w-3.5" /><span>Authentication</span>
              </button>
              <Separator className="my-2" />
              {sections.map((section) => (
                <NavItem key={section.id} section={section} activeSection={activeSection} activePath={activePath} onClick={handleSectionClick} onEndpointClick={handleEndpointClick} />
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

        {activeSection === "auth" && (
          <div>
            <div className="p-6 border-b border-border/60">
              <h1 className="text-2xl font-bold tracking-tight mb-1" data-testid="heading-api-guide">API Reference</h1>
              <p className="text-sm text-muted-foreground">
                Complete REST API documentation for TradeSync. Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{baseUrl}</code>
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              <div className="p-6 lg:border-r border-border/60">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-blue-500" />
                  <h3 className="font-semibold text-lg">Authentication</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  The signal ingestion endpoint (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">POST /api/ingest/signals</code>) requires authentication via a Bearer token.
                  All other endpoints are open for internal dashboard use.
                </p>

                <div className="space-y-5">
                  <div data-testid="param-authorization">
                    <div className="flex items-center gap-2 mb-1.5">
                      <code className="text-sm font-mono font-semibold">Authorization</code>
                      <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">string</Badge>
                      <span className="text-[10px] text-red-400 font-medium">required</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Bearer token with your connected app's API key. Format: <code className="font-mono">Bearer ts_xxx...</code></p>
                  </div>
                  <div data-testid="param-content-type">
                    <div className="flex items-center gap-2 mb-1.5">
                      <code className="text-sm font-mono font-semibold">Content-Type</code>
                      <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">string</Badge>
                      <span className="text-[10px] text-red-400 font-medium">required</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Must be <code className="font-mono">application/json</code> for all POST/PUT/PATCH requests.</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-semibold mb-2">API Key Format</h4>
                  <p className="text-xs text-muted-foreground">Keys are auto-generated with the <code className="font-mono">ts_</code> prefix when connecting an app. Manage keys on the Connected Apps page.</p>
                </div>
              </div>

              <div className="p-6 bg-zinc-950/40 dark:bg-zinc-950/60 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold">Code Examples</h3>
                    <CopyButton text={`curl -X POST ${baseUrl}/api/ingest/signals \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ts_your_api_key" \\\n  -d '{"symbol":"AAPL","direction":"buy","confidence":75}'`} />
                  </div>
                  <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/60 overflow-hidden">
                    <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      <code>{`curl -X POST ${baseUrl}/api/ingest/signals \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ts_your_api_key" \\\n  -d '{"symbol":"AAPL","direction":"buy","confidence":75,"entryPrice":185.50}'`}</code>
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3">API Key Example</h3>
                  <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/60 overflow-hidden">
                    <pre className="p-4 text-[13px] font-mono text-zinc-300">
                      <code>ts_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentSection && currentEndpoint && (
          <div>
            <div className="p-6 border-b border-border/60">
              <div className="flex items-center gap-3 mb-1">
                <MethodBadge method={currentEndpoint.method} />
                <code className="text-lg font-mono font-semibold">{currentEndpoint.path}</code>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{currentEndpoint.description}</p>
            </div>
            <EndpointInteractive
              endpoint={currentEndpoint}
              baseUrl={baseUrl}
              authKey={currentEndpoint.auth ? activeApp?.apiKey : undefined}
            />
          </div>
        )}
      </main>
    </div>
  );
}
