import { useState, useRef, useMemo, useEffect } from "react";
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
  ChevronDown,
  ChevronRight,
  Zap,
  Menu,
  X,
  Maximize2,
  Lock,
  RotateCcw,
  Braces,
  Info,
  Eye,
  EyeOff,
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
  explanation?: string;
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
  if (lang === "shell") {
    let cmd = `curl -X ${method} "${url}"`;
    if (authKey) cmd += ` \\\n  -H "Authorization: Bearer ${authKey}"`;
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
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
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
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
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
    if (authKey) code += `  req.Header.Set("Authorization", "Bearer ${authKey}")\n`;
    if (hasBody) code += `  req.Header.Set("Content-Type", "application/json")\n`;
    code += `  resp, _ := http.DefaultClient.Do(req)\n  defer resp.Body.Close()\n  body, _ := io.ReadAll(resp.Body)\n  fmt.Println(string(body))\n}`;
    return code;
  }

  return "";
}

function EndpointInteractive({ endpoint, baseUrl, defaultApiKey }: { endpoint: EndpointDef; baseUrl: string; defaultApiKey?: string }) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [codeLang, setCodeLang] = useState("shell");
  const [responseTab, setResponseTab] = useState("sample");
  const [queryResponse, setQueryResponse] = useState<string | null>(null);
  const [queryStatus, setQueryStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(defaultApiKey || "");
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setApiKeyValue(defaultApiKey || "");
  }, [defaultApiKey]);

  const effectiveAuthKey = apiKeyValue.trim() || undefined;

  const setParam = (name: string, value: string) => {
    setParamValues(prev => ({ ...prev, [name]: value }));
  };

  const resetValues = () => {
    setParamValues({});
    setQueryResponse(null);
    setQueryStatus(null);
  };

  const codeOutput = useMemo(() =>
    generateCode(endpoint.method, endpoint.path, paramValues, codeLang, baseUrl, effectiveAuthKey, endpoint.params),
    [endpoint.method, endpoint.path, paramValues, codeLang, baseUrl, effectiveAuthKey, endpoint.params]
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
      if (effectiveAuthKey) headers["Authorization"] = `Bearer ${effectiveAuthKey}`;
      if (hasBody) headers["Content-Type"] = "application/json";

      const bodyParams = hasBody ? filledParams.filter(([k]) => !pathParams.includes(k)) : [];
      let body: string | undefined;
      if (hasBody && bodyParams.length > 0) {
        const obj: Record<string, any> = {};
        bodyParams.forEach(([k, v]) => { obj[k] = parseParamValue(k, v, endpoint.params); });
        body = JSON.stringify(obj);
      }

      const res = await fetch(queryUrl, { method: endpoint.method, headers, body });
      const contentType = res.headers.get("content-type") || "";
      setQueryStatus(res.status);
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        setQueryResponse(JSON.stringify({
          error: "Server returned non-JSON (likely HTML). Check that the request URL is correct and the API is running.",
          status: res.status,
          contentType,
          bodyPreview: text.slice(0, 200) + (text.length > 200 ? "…" : ""),
        }, null, 2));
      } else {
        const data = await res.json();
        setQueryResponse(JSON.stringify(data, null, 2));
      }
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
                      placeholder={'{\n  "tp1": {\n    "price": 100,\n    "take_off_percent": 50,\n    "raise_stop_loss": {\n      "price": 90\n    }\n  },\n  "tp2": {\n    "price": 110,\n    "take_off_percent": 50,\n    "raise_stop_loss": {\n      "price": 100\n    }\n  }\n}'}
                      data-testid={`input-param-${param.name}`}
                    />
                  </div>
                  <div className="px-4 py-2 border-t border-zinc-700/20 bg-zinc-800/10">
                    <div className="flex items-start gap-1.5">
                      <Info className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{param.description}</p>
                    </div>
                    {param.explanation && (
                      <div className="mt-3 pt-3 border-t border-zinc-700/15">
                        <pre className="text-[11px] text-muted-foreground/70 leading-relaxed whitespace-pre-wrap font-sans">{param.explanation}</pre>
                      </div>
                    )}
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

          {endpoint.auth && (
            <div className="mt-3 rounded-lg border border-zinc-700/40 bg-zinc-900/30 overflow-hidden" data-testid="api-key-section">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/30 bg-zinc-800/20">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-sm font-medium text-foreground/90">API Key</span>
                  <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-primary/10 text-primary/80 border-primary/20">
                    {effectiveAuthKey ? "Connected App" : "Manual"}
                  </Badge>
                </div>
                {apiKeyValue && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setShowApiKey(!showApiKey)}
                    data-testid="button-toggle-api-key"
                  >
                    {showApiKey ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                )}
              </div>
              <div className="p-3">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  placeholder="Leave empty for manual mode (no auth)"
                  className="bg-zinc-950/60 border-zinc-700/30 text-sm font-mono placeholder:text-zinc-600"
                  data-testid="input-api-key"
                />
              </div>
              <div className="px-4 py-2 border-t border-zinc-700/20 bg-zinc-800/10">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                    {effectiveAuthKey
                      ? "Requests will include the Authorization header with this API key."
                      : "No API key set. Requests will run without authentication (manual mode)."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end mt-3">
            <Button
              size="sm"
              onClick={runQuery}
              disabled={loading}
              className="text-xs"
              data-testid="button-run-query"
            >
              {loading ? "Running..." : "Run Query"}
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
        description: "Push a trading signal into TradeSync. Optionally include a Bearer token to link the signal to a connected app. Without an API key, the signal is processed as Manual. Trade plan prices (entry_price, targets, stop_loss) must be in the correct price space: Options use option contract price; LETF use LETF price (e.g. TQQQ), not the underlying index (e.g. QQQ); Shares use stock price.",
        auth: "Bearer Token (Optional)",
        params: [
          { name: "ticker", type: "string", required: true, description: "Ticker symbol (e.g., 'AAPL', 'TSLA', 'TQQQ'). For Options this is the underlying (e.g. AAPL)." },
          { name: "instrumentType", type: "string", required: true, description: "Instrument type.", enumValues: ["Options", "Shares", "LETF"] },
          { name: "direction", type: "string", required: true, description: "Trade direction. Use Call/Put for Options, Long/Short for Shares and LETF.", enumValues: ["Call", "Put", "Long", "Short"] },
          { name: "expiration", type: "string", required: false, description: "Expiration date (e.g., '2026-03-01'). Required for Options." },
          { name: "strike", type: "string", required: false, description: "Option strike price (e.g., '190'). Required for Options." },
          { name: "entryPrice", type: "string", required: false, description: "Entry price. Must match instrument: option contract price for Options, LETF price for LETF, stock price for Shares." },
          { name: "stop_loss", type: "number", required: false, description: "Stop loss price in the same space as entry_price (option / LETF / stock)." },
          { name: "auto_track", type: "boolean", required: false, description: "Enable automatic tracking of target hits and stop loss against live price. Defaults to true." },
          { name: "time_stop", type: "string", required: false, description: "Time-based stop — exit the trade by this date (e.g., '2026-03-01')." },
          { name: "targets", type: "json", required: false, description: "Take-profit targets. Target prices must be in the same space as entry_price (option / LETF / stock).", explanation: `The targets object defines your profit-taking strategy. Each key (tp1, tp2, etc.) maps to a target with a price (option contract price for Options, LETF price for LETF, stock price for Shares), a take_off_percent indicating how much of the position to close, and an optional raise_stop_loss that adjusts your stop loss when the target is hit.

Structure:
  tp1, tp2, ...      Target labels (you can use any key names)
    price             Target price level
    take_off_percent  Percentage of position to take off at this target (0-100)
    raise_stop_loss
      price           New stop loss price when this target is hit

Example:
{
  "tp1": {
    "price": 100,
    "take_off_percent": 50,
    "raise_stop_loss": {
      "price": 90
    }
  },
  "tp2": {
    "price": 110,
    "take_off_percent": 50,
    "raise_stop_loss": {
      "price": 100
    }
  }
}` },
        ],
        responseExample: `{
  "success": true,
  "signal": {
    "id": "abc-123",
    "data": {
      "ticker": "AAPL",
      "instrument_type": "Options",
      "direction": "Call",
      "entry_price": 31,
      "expiration": "2026-03-20",
      "strike": "190",
      "targets": {
        "tp1": { "price": 40, "take_off_percent": 50, "raise_stop_loss": { "price": 31 } },
        "tp2": { "price": 50, "take_off_percent": 50, "raise_stop_loss": { "price": 40 } }
      },
      "stop_loss": 25,
      "trade_plan_type": "option_price_based",
      "time_stop": "2026-03-01"
    },
    "status": "active",
    "sourceAppName": "Situ Trader",
    "createdAt": "2026-02-26T12:00:00.000Z"
  },
  "processing": {
    "discord": { "sent": true, "errors": [] },
    "ibkr": { "executed": false, "tradeResult": null, "errors": [] }
  }
}`,
      },
      {
        method: "POST",
        path: "/api/signals/:id/close",
        description: "Close an active trade (signal). Sets the signal status to \"closed\" and stops target/stop-loss monitoring. Only signals with status \"active\" can be closed. Returns the updated signal.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID) of the active trade to close." },
        ],
        responseExample: `{
  "id": "abc-123",
  "data": {
    "ticker": "AAPL",
    "instrument_type": "Shares",
    "direction": "Long",
    "entry_price": 189.5,
    "targets": { "tp1": { "price": 195, "take_off_percent": 50 }, "tp2": { "price": 200, "take_off_percent": 50 } },
    "stop_loss": 182
  },
  "status": "closed",
  "sourceAppName": "Situ Trader",
  "createdAt": "2026-02-26T12:00:00.000Z"
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
    "data": {
      "ticker": "AAPL",
      "instrument_type": "Options",
      "direction": "Call",
      "entry_price": 31,
      "expiration": "2026-03-20",
      "strike": "190",
      "targets": {
        "tp1": { "price": 40, "take_off_percent": 50, "raise_stop_loss": { "price": 31 } },
        "tp2": { "price": 50, "take_off_percent": 50, "raise_stop_loss": { "price": 40 } }
      },
      "stop_loss": 25,
      "trade_plan_type": "option_price_based",
      "time_stop": "2026-03-01"
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
          { name: "data", type: "json", required: true, description: "JSON object with signal data (ticker, instrument_type, direction, entry_price, etc.)" },
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
  const builtInApp = apps.find(a => a.isBuiltIn);
  const activeApp = builtInApp || apps.find(a => a.status === "active");

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
                    <CopyButton text={`curl -X POST ${baseUrl}/api/ingest/signals \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ts_your_api_key" \\\n  -d '{"ticker":"AAPL","instrumentType":"Options","direction":"Call","expiration":"2026-03-20","strike":"190","entryPrice":"189.50"}'`} />
                  </div>
                  <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/60 overflow-hidden">
                    <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      <code>{`curl -X POST ${baseUrl}/api/ingest/signals \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ts_your_api_key" \\\n  -d '{"ticker":"AAPL","instrumentType":"Options","direction":"Call","expiration":"2026-03-20","strike":"190","entryPrice":"189.50"}'`}</code>
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
              {currentEndpoint.path === "/api/ingest/signals" && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 px-3 py-2.5">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400/90 mb-1">Trade plan prices</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong>entry_price</strong>, <strong>targets</strong>, and <strong>stop_loss</strong> must be in the correct price space: <strong>Options</strong> = option contract price; <strong>LETF</strong> = LETF price (e.g. TQQQ), not the underlying index (e.g. QQQ); <strong>Shares</strong> = stock price.
                  </p>
                </div>
              )}
            </div>
            <EndpointInteractive
              key={`${currentEndpoint.method}-${currentEndpoint.path}`}
              endpoint={currentEndpoint}
              baseUrl={baseUrl}
              defaultApiKey={currentEndpoint.auth ? (activeApp?.apiKey ?? undefined) : undefined}
            />
          </div>
        )}
      </main>
    </div>
  );
}
