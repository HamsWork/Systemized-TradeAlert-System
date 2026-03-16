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
  Rocket,
  MessageSquare,
  Terminal,
  CheckCircle2,
  ImageIcon,
  Paperclip,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setSelectedFile(null);
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
          bodyPreview: text.slice(0, 200) + (text.length > 200 ? "..." : ""),
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
            {params.filter(p => p.type !== "json" && p.type !== "file").map((param) => (
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

            {params.filter(p => p.type === "file").map((param) => (
              <div key={param.name} data-testid={`param-${param.name}`} className="mt-2">
                <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/30 dark:bg-zinc-900/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/30 bg-zinc-800/20">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 text-blue-400/70" />
                      <code className="text-sm font-mono font-semibold text-foreground/90">{param.name}</code>
                      <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-blue-500/10 text-blue-400/80 border-blue-500/20">file</Badge>
                    </div>
                    {selectedFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-red-400"
                        data-testid="button-remove-file"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="p-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      data-testid={`input-file-${param.name}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 10 * 1024 * 1024) {
                            alert("File size exceeds 10 MB limit");
                            return;
                          }
                          setSelectedFile(file);
                        }
                      }}
                    />
                    {selectedFile ? (
                      <div className="flex items-center gap-3 rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-md bg-blue-500/10 border border-blue-500/20 shrink-0">
                          {selectedFile.type.startsWith("video/") ? (
                            <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                          ) : (
                            <ImageIcon className="h-5 w-5 text-blue-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate" data-testid="text-file-name">{selectedFile.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {(selectedFile.size / 1024).toFixed(0)} KB &middot; {selectedFile.type || "unknown type"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`relative flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                          dragOver
                            ? "border-blue-400 bg-blue-500/10"
                            : "border-zinc-700/50 bg-zinc-950/40 hover:border-zinc-600/60 hover:bg-zinc-900/40"
                        }`}
                        data-testid="dropzone-chartMedia"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              alert("File size exceeds 10 MB limit");
                              return;
                            }
                            setSelectedFile(file);
                          }
                        }}
                      >
                        <div className={`flex items-center justify-center h-10 w-10 rounded-full mb-3 ${dragOver ? "bg-blue-500/20" : "bg-zinc-800/60"}`}>
                          <ImageIcon className={`h-5 w-5 ${dragOver ? "text-blue-400" : "text-zinc-500"}`} />
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          <span className="text-blue-400 font-medium">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-[11px] text-muted-foreground/60">
                          PNG, JPG, GIF, WebP, MP4, MOV &middot; Max 10 MB
                        </p>
                      </div>
                    )}
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
                      <div className={`px-4 py-1.5 border-b border-zinc-800/40 text-xs font-mono ${queryStatus >= 200 && queryStatus < 300 ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"}`}>
                        Status: {queryStatus}
                      </div>
                    )}
                    <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed max-h-[300px]">
                      <code>{queryResponse}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">Run a query to see the response here.</p>
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
        description: "Push a trading signal into TradeSync. Requires a Bearer token from a connected app (returns 401 without one). Trade plan prices (entry_price, targets, stop_loss) must be in the correct price space: Options use option contract price; LETF use LETF price (e.g. TQQQ), not the underlying index (e.g. QQQ); Shares use stock price.",
        auth: "Bearer Token (Required)",
        params: [
          { name: "ticker", type: "string", required: true, description: "Ticker symbol (e.g., 'AAPL', 'TSLA', 'TQQQ'). For Options this is the underlying (e.g. AAPL)." },
          { name: "instrumentType", type: "string", required: true, description: "Instrument type.", enumValues: ["Options", "Shares", "LETF", "LETF Option", "Crypto"] },
          { name: "direction", type: "string", required: true, description: "Trade direction. Use Call/Put for Options and LETF Option; Long/Short for Shares, LETF, and Crypto.", enumValues: ["Call", "Put", "Long", "Short"] },
          { name: "expiration", type: "string", required: false, description: "Expiration date (e.g., '2026-03-01'). Required for Options and LETF Option." },
          { name: "strike", type: "string", required: false, description: "Option strike price (e.g., '190'). Required for Options and LETF Option." },
          { name: "entryPrice", type: "string", required: false, description: "Entry price. Must match instrument: option contract price for Options, LETF price for LETF, stock price for Shares." },
          { name: "stop_loss", type: "number", required: false, description: "Stop loss price in the same space as entry_price (option / LETF / stock). You can send either the price or stop_loss_percentage — if both are sent, both are stored." },
          { name: "stop_loss_percentage", type: "number", required: false, description: "Stop loss as a percentage from entry. Negative value (e.g. -5 means 5% below entry for longs). If omitted but stop_loss price and entryPrice are provided, the percentage is auto-calculated." },
          { name: "tradeType", type: "string", required: false, description: "Trade type classification.", enumValues: ["Scalp", "Swing", "Leap"] },
          { name: "auto_track", type: "boolean", required: false, description: "Enable automatic tracking of target hits and stop loss against live price. Defaults to true." },
          { name: "underlying_price_based", type: "boolean", required: false, description: "When true, targets and stop loss are compared against the underlying stock price instead of the option/LETF price. Applies to Options, LETF, and LETF Option instrument types. Defaults to false." },
          { name: "time_stop", type: "string", required: false, description: "Time-based stop -- exit the trade by this date (e.g., '2026-03-01')." },
          { name: "discord_channel_webhook", type: "string", required: false, description: "Optional Discord webhook URL. When set, the signal alert is sent to this channel instead of the app's configured webhooks." },
          { name: "targets", type: "json", required: false, description: "Take-profit targets. Each target can use a price or percentage (from entry). Target prices must be in the same space as entry_price.", explanation: `The targets object defines your profit-taking strategy. Each key (tp1, tp2, etc.) maps to a target. You can specify the target level as a price or as a percentage from entry — if you send price and entryPrice, the percentage is auto-calculated.

Structure:
  tp1, tp2, ...           Target labels (you can use any key names)
    price                  Target price level (use price or percentage)
    percentage             Target as % gain from entry (e.g. 10 = +10%). Auto-calculated from price if omitted.
    take_off_percent       Percentage of position to take off at this target (0-100)
    raise_stop_loss        Adjust stop loss when this target is hit
      price                New stop loss price
      percentage           New stop loss as % from entry (alternative to price)
    trailing_stop_percent  Optional trailing stop (0.1-100). When target is hit, activates a trailing stop that follows price at this % distance.

Example using prices:
{
  "tp1": {
    "price": 100,
    "take_off_percent": 50,
    "raise_stop_loss": { "price": 90 }
  },
  "tp2": {
    "price": 110,
    "take_off_percent": 50,
    "trailing_stop_percent": 5
  }
}

Example using percentages:
{
  "tp1": {
    "percentage": 10,
    "take_off_percent": 50,
    "raise_stop_loss": { "percentage": -2 }
  },
  "tp2": {
    "percentage": 20,
    "take_off_percent": 50,
    "trailing_stop_percent": 5
  }
}` },
          { name: "chartMedia", type: "file", required: false, description: "Image or video file to attach to the Discord embed (max 10 MB). When included, the request must use multipart/form-data instead of JSON. All other fields are sent as form fields. The file appears as the embed image in the Discord alert." },
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
        description: "Close an active trade (signal). Sets the signal status to \"closed\" and stops target/stop-loss monitoring. If IBKR is connected and the signal has a filled position, a close order is placed automatically. Sends a Discord notification. Only signals with status \"active\" can be closed. Returns the updated signal.",
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
        method: "POST",
        path: "/api/signals/:id/target-hit",
        description: "Manually mark the next take-profit target as hit for an active signal when auto_track is false. Automatically hits the current (next unhit) target level in order. Updates hit_targets, raises stop loss if the target defines raise_stop_loss, sends Discord alert, and creates activity. If all targets become hit, signal status is set to completed.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID) of the active trade." },
          { name: "currentPrice", type: "number", required: false, description: "Optional price at which the target was hit. If omitted, the target's defined price is used." },
          { name: "fullExit", type: "boolean", required: false, description: "If true, marks ALL remaining targets as hit with 100% take-off and completes the signal. Default is false (hits only the next target)." },
        ],
        responseExample: `{
  "id": "abc-123",
  "data": {
    "ticker": "AAPL",
    "instrument_type": "Options",
    "direction": "Call",
    "entry_price": 31,
    "targets": { "tp1": { "price": 40, "take_off_percent": 50 }, "tp2": { "price": 50, "take_off_percent": 50 } },
    "stop_loss": 31,
    "hit_targets": { "tp1": { "hitAt": "2026-03-01T14:00:00.000Z", "price": 40.5, "manual": true } }
  },
  "status": "active",
  "sourceAppName": "Situ Trader",
  "createdAt": "2026-02-26T12:00:00.000Z"
}`,
      },
      {
        method: "POST",
        path: "/api/signals/:id/stop-loss-hit",
        description: "Manually mark stop loss as hit for an active signal when auto_track is false. Sets stop_loss_hit, stop_loss_hit_at, stop_loss_hit_price, and signal status to \"stopped_out\"; sends Discord alert and creates activity. The signal must have data.stop_loss set.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID) of the active trade." },
          { name: "currentPrice", type: "number", required: false, description: "Optional price at which stop loss was hit. If omitted, the signal's stop_loss value is used." },
        ],
        responseExample: `{
  "id": "abc-123",
  "data": {
    "ticker": "AAPL",
    "instrument_type": "Shares",
    "direction": "Long",
    "entry_price": 189.5,
    "stop_loss": 182,
    "stop_loss_hit": true,
    "stop_loss_hit_at": "2026-03-01T14:00:00.000Z",
    "stop_loss_hit_price": 181.5,
    "stop_loss_hit_manual": true
  },
  "status": "stopped_out",
  "sourceAppName": "Situ Trader",
  "createdAt": "2026-02-26T12:00:00.000Z"
}`,
      },
      {
        method: "POST",
        path: "/api/signals/:id/stop-auto-track",
        description: "Disable automatic target/stop-loss tracking for an active signal by setting data.auto_track to false. After this, targets and stop loss must be maintained manually via the manual APIs.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID) of the active trade." },
        ],
        responseExample: `{
  "id": "abc-123",
  "data": {
    "ticker": "AAPL",
    "instrument_type": "Options",
    "direction": "Call",
    "entry_price": 31,
    "targets": {
      "tp1": { "price": 40, "take_off_percent": 50, "raise_stop_loss": { "price": 31 } },
      "tp2": { "price": 50, "take_off_percent": 50, "raise_stop_loss": { "price": 40 } }
    },
    "stop_loss": 25,
    "auto_track": false
  },
  "status": "active",
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
        responseExample: `{
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
    "auto_track": true
  },
  "status": "active",
  "sourceAppName": "Situ Trader",
  "createdAt": "2026-02-26T12:00:00.000Z"
}`,
      },
      {
        method: "PATCH",
        path: "/api/signals/:id",
        description: "Update a signal's data. Accepts partial updates -- only include the fields you want to change. The data field is a JSON object and will be merged with the existing signal data.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID format)." },
          { name: "status", type: "string", required: false, description: "Update the signal status.", enumValues: ["active", "closed", "completed", "stopped_out"] },
          { name: "data", type: "json", required: false, description: "Partial signal data to update (e.g. stop_loss, targets, auto_track)." },
        ],
        responseExample: `{
  "id": "abc-123",
  "data": {
    "ticker": "AAPL",
    "instrument_type": "Shares",
    "direction": "Long",
    "entry_price": 189.5,
    "stop_loss": 185,
    "auto_track": true
  },
  "status": "active",
  "sourceAppName": "Situ Trader",
  "createdAt": "2026-02-26T12:00:00.000Z"
}`,
      },
      {
        method: "DELETE",
        path: "/api/signals/:id",
        description: "Permanently delete a signal by its ID. This action cannot be undone.",
        params: [
          { name: "id", type: "string", required: true, description: "The unique signal ID (UUID format) to delete." },
        ],
        responseExample: `{
  "success": true
}`,
      },
    ],
  },
  {
    id: "discord-templates",
    title: "Discord Templates",
    icon: MessageSquare,
    description: "Manage per-app Discord notification templates. Each connected app can have custom templates per instrument type and message type, using {{variable}} placeholders.",
    endpoints: [
      {
        method: "GET",
        path: "/api/discord-templates/var-templates",
        description: "Get all default Discord templates grouped by instrument type. Returns the template structure, sample variables, and a rendered preview for each message type (signal_alert, target_hit, stop_loss_raised, stop_loss_hit).",
        params: [],
        responseExample: `[
  {
    "instrumentType": "Options",
    "ticker": "AAPL",
    "templates": [
      {
        "type": "signal_alert",
        "label": "Signal Alert",
        "content": "{{source_app}}",
        "template": {
          "title": "{{direction}} {{ticker}} {{strike}} {{expiration}}",
          "color": "{{embed_color}}",
          "fields": [
            { "name": "Ticker", "value": "{{ticker}}", "inline": true },
            { "name": "Stock Price", "value": "{{stock_price}}", "inline": true },
            { "name": "Direction", "value": "{{direction}}", "inline": true }
          ]
        },
        "sampleVars": {
          "ticker": "AAPL",
          "direction": "Call",
          "strike": "190",
          "stock_price": "$189.50",
          "source_app": "My App"
        },
        "preview": { "content": "My App", "embed": { "..." : "rendered" } },
        "isCustom": false
      }
    ]
  }
]`,
      },
      {
        method: "GET",
        path: "/api/discord-templates/app/:appId",
        description: "Get Discord templates for a specific connected app. Returns defaults merged with any custom overrides. Templates marked isCustom: true have been customized for this app.",
        params: [
          { name: "appId", type: "string", required: true, description: "The connected app's unique ID (UUID)." },
        ],
        responseExample: `[
  {
    "instrumentType": "Options",
    "ticker": "AAPL",
    "templates": [
      {
        "type": "signal_alert",
        "label": "Signal Alert",
        "content": "{{source_app}}",
        "template": {
          "title": "{{direction}} {{ticker}} {{strike}} {{expiration}}",
          "color": "{{embed_color}}",
          "fields": [...]
        },
        "sampleVars": { "ticker": "AAPL", "..." : "..." },
        "preview": { "content": "...", "embed": { "..." : "..." } },
        "isCustom": true
      }
    ]
  }
]`,
      },
      {
        method: "PUT",
        path: "/api/discord-templates/app/:appId",
        description: "Create or update a custom Discord template for a connected app. Overrides the default template for the specified instrument type and message type. Use {{variable}} placeholders in title, description, field names/values, and footer text.",
        params: [
          { name: "appId", type: "string", required: true, description: "The connected app's unique ID (UUID)." },
          { name: "instrumentType", type: "string", required: true, description: "The instrument type this template applies to.", enumValues: ["Options", "Shares", "LETF", "LETF Option", "Crypto"] },
          { name: "messageType", type: "string", required: true, description: "The message event type.", enumValues: ["signal_alert", "target_hit", "stop_loss_raised", "stop_loss_hit"] },
          { name: "label", type: "string", required: false, description: "Display label for the template (e.g. 'Signal Alert')." },
          { name: "content", type: "string", required: false, description: "Message content above the embed. Supports {{variable}} placeholders." },
          { name: "embedJson", type: "json", required: true, description: "The embed template object with title, color, fields, footer, etc. Use {{variable}} placeholders.", explanation: `The embedJson defines the Discord embed structure. Available placeholders vary by instrument type and message type.

Common variables:
  {{ticker}}          Ticker symbol
  {{direction}}       Call/Put/Long/Short
  {{entry_price}}     Entry price
  {{stock_price}}     Current stock price
  {{source_app}}      Connected app name
  {{embed_color}}     Color based on direction

Options-specific:
  {{strike}}          Strike price
  {{expiration}}      Expiration date
  {{option_price}}    Option contract price

Target hit variables:
  {{target_label}}    Target key (tp1, tp2)
  {{target_price}}    Target price level
  {{take_off_pct}}    Take-off percentage

Stop loss variables:
  {{stop_loss}}       Stop loss price
  {{new_stop_loss}}   Raised stop loss price

Example:
{
  "title": "{{direction}} {{ticker}} {{strike}} {{expiration}}",
  "color": "{{embed_color}}",
  "fields": [
    { "name": "Ticker", "value": "{{ticker}}", "inline": true },
    { "name": "Entry", "value": "{{entry_price}}", "inline": true },
    { "name": "Stop Loss", "value": "{{stop_loss}}", "inline": true }
  ],
  "footer": { "text": "TradeSync" }
}` },
        ],
        responseExample: `{
  "id": "tmpl-uuid",
  "appId": "app-uuid",
  "instrumentType": "Options",
  "messageType": "signal_alert",
  "label": "Signal Alert",
  "content": "{{source_app}}",
  "embedJson": {
    "title": "{{direction}} {{ticker}} {{strike}} {{expiration}}",
    "color": "{{embed_color}}",
    "fields": [
      { "name": "Ticker", "value": "{{ticker}}", "inline": true },
      { "name": "Entry", "value": "{{entry_price}}", "inline": true }
    ]
  }
}`,
      },
      {
        method: "DELETE",
        path: "/api/discord-templates/app/:appId",
        description: "Delete custom Discord templates for a connected app. Optionally filter by instrument type. After deletion, the app reverts to using default templates.",
        params: [
          { name: "appId", type: "string", required: true, description: "The connected app's unique ID (UUID)." },
          { name: "instrumentType", type: "string", required: false, description: "Optional: only delete templates for this instrument type. If omitted, deletes all custom templates for the app.", enumValues: ["Options", "Shares", "LETF", "LETF Option", "Crypto"] },
        ],
        responseExample: `{
  "success": true
}`,
      },
    ],
  },
];

function QuickStartContent({ baseUrl }: { baseUrl: string }) {
  return (
    <div data-testid="section-quick-start">
      <div className="p-6 border-b border-border/60">
        <div className="flex items-center gap-2 mb-1">
          <Rocket className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-quick-start">Quick Start</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Get up and running with TradeSync in 3 steps. Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{baseUrl}</code>
        </p>
      </div>

      <div className="p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 dark:bg-zinc-900/30 p-5" data-testid="card-step-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">1</div>
              <h3 className="font-semibold text-sm">Create a Connected App</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Go to <strong>Connected Apps</strong> and create a new app. Each app gets a unique API key (<code className="font-mono text-[11px]">ts_...</code>) used to authenticate signal requests.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 dark:bg-zinc-900/30 p-5" data-testid="card-step-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">2</div>
              <h3 className="font-semibold text-sm">Send a Signal</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              POST to <code className="font-mono text-[11px]">/api/ingest/signals</code> with your API key as a Bearer token. Include ticker, instrument type, direction, and optional trade plan details.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 dark:bg-zinc-900/30 p-5" data-testid="card-step-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">3</div>
              <h3 className="font-semibold text-sm">Automated Processing</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              TradeSync automatically sends Discord notifications using your app's templates, executes IBKR orders if configured, and tracks targets/stop-loss in real-time.
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            Your First Signal
          </h2>
          <div className="rounded-lg bg-zinc-950/60 dark:bg-zinc-950/80 border border-zinc-800/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/50">
              <span className="text-xs text-muted-foreground font-mono">cURL</span>
              <CopyButton text={`curl -X POST ${baseUrl}/api/ingest/signals \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -d '{\n    "ticker": "AAPL",\n    "instrumentType": "Options",\n    "direction": "Call",\n    "expiration": "2026-04-17",\n    "strike": "190",\n    "entryPrice": "5.20",\n    "stop_loss": 3.50,\n    "targets": {\n      "tp1": { "price": 7.00, "take_off_percent": 50, "raise_stop_loss": { "price": 5.20 } },\n      "tp2": { "price": 10.00, "take_off_percent": 50, "trailing_stop_percent": 5 }\n    }\n  }'`} />
            </div>
            <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
              <code>{`curl -X POST ${baseUrl}/api/ingest/signals \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "ticker": "AAPL",
    "instrumentType": "Options",
    "direction": "Call",
    "expiration": "2026-04-17",
    "strike": "190",
    "entryPrice": "5.20",
    "stop_loss": 3.50,
    "targets": {
      "tp1": { "price": 7.00, "take_off_percent": 50, "raise_stop_loss": { "price": 5.20 } },
      "tp2": { "price": 10.00, "take_off_percent": 50, "trailing_stop_percent": 5 }
    }
  }'`}</code>
            </pre>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            Sending with Chart Media
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            You can attach an image or video file (chart screenshot, trade setup, etc.) to your signal. The file is embedded in the Discord alert as the embed image. When sending a file, the request uses <code className="text-xs bg-muted px-1 py-0.5 rounded">multipart/form-data</code> instead of JSON — each field is sent as a separate form field.
          </p>

          <div className="rounded-lg bg-zinc-950/60 dark:bg-zinc-950/80 border border-zinc-800/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/50">
              <span className="text-xs text-muted-foreground font-mono">cURL — with chart image</span>
              <CopyButton text={`curl -X POST ${baseUrl}/api/ingest/signals \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "ticker=AAPL" \\\n  -F "instrumentType=Options" \\\n  -F "direction=Call" \\\n  -F "expiration=2026-04-17" \\\n  -F "strike=190" \\\n  -F "entryPrice=5.20" \\\n  -F "stop_loss=3.50" \\\n  -F 'targets={"tp1":{"price":7.00,"take_off_percent":50,"raise_stop_loss":{"price":5.20}},"tp2":{"price":10.00,"take_off_percent":50,"trailing_stop_percent":5}}' \\\n  -F "chartMedia=@/path/to/chart.png"`} />
            </div>
            <pre className="p-4 overflow-x-auto text-[13px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
              <code>{`curl -X POST ${baseUrl}/api/ingest/signals \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "ticker=AAPL" \\
  -F "instrumentType=Options" \\
  -F "direction=Call" \\
  -F "expiration=2026-04-17" \\
  -F "strike=190" \\
  -F "entryPrice=5.20" \\
  -F "stop_loss=3.50" \\
  -F 'targets={"tp1":{"price":7.00,"take_off_percent":50,"raise_stop_loss":{"price":5.20}},"tp2":{"price":10.00,"take_off_percent":50,"trailing_stop_percent":5}}' \\
  -F "chartMedia=@/path/to/chart.png"`}</code>
            </pre>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2">
              <ImageIcon className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Supported formats:</span> PNG, JPG, GIF, WebP, MP4, MOV — any format Discord supports. Max file size: 10 MB.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Do not set Content-Type header</span> — curl sets it automatically with the multipart boundary when using <code className="text-[10px] bg-muted px-1 py-0.5 rounded">-F</code> flags.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Braces className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">targets field:</span> Send as a JSON string (not a file). Numeric and boolean fields are auto-converted from strings.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <SiDiscord className="h-3.5 w-3.5 text-[#5865F2] mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Discord result:</span> The file appears as the embed image in the signal alert. JSON-only requests (without a file) still work exactly as before.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-4">What Happens Next</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Signal Created</p>
                <p className="text-xs text-muted-foreground">The signal is stored and linked to your connected app. It appears on the Signals page with live price tracking.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <SiDiscord className="h-4 w-4 text-[#5865F2] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Discord Notification</p>
                <p className="text-xs text-muted-foreground">An embed is sent to configured Discord channels using your app's template. Templates support <code className="font-mono text-[11px]">{"{{variable}}"}</code> placeholders for dynamic content.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">IBKR Order Execution</p>
                <p className="text-xs text-muted-foreground">If IBKR is connected and the app has execution enabled, an entry order is placed automatically through Interactive Brokers.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Zap className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Auto-Tracking</p>
                <p className="text-xs text-muted-foreground">Targets and stop-loss levels are monitored against live prices. When hit, Discord alerts fire and stop-loss is automatically raised per your plan.</p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-4">Instrument Types</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { type: "Options", desc: "Stock options (calls/puts). Requires ticker (underlying), strike, expiration. Prices in option contract price.", directions: "Call / Put" },
              { type: "Shares", desc: "Stocks and equities. Prices in stock price.", directions: "Long / Short" },
              { type: "LETF", desc: "Leveraged ETFs (e.g. TQQQ, SOXL). Prices in LETF price, not the underlying index.", directions: "Long / Short" },
              { type: "LETF Option", desc: "Options on leveraged ETFs. Combines LETF with options contract pricing.", directions: "Call / Put" },
              { type: "Crypto", desc: "Cryptocurrency pairs. Prices in crypto price.", directions: "Long / Short" },
            ].map(item => (
              <div key={item.type} className="rounded-lg border border-border/50 p-3 bg-muted/10 dark:bg-zinc-900/20" data-testid={`card-instrument-${item.type.toLowerCase().replace(/\s/g, "-")}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <Badge variant="secondary" className="text-xs font-medium">{item.type}</Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{item.directions}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Authentication
          </h2>
          <div className="rounded-lg border border-border/60 bg-muted/10 dark:bg-zinc-900/20 p-5 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The signal ingestion endpoint (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">POST /api/ingest/signals</code>) requires a Bearer token to authenticate signals.
                Each connected app has a unique API key. Requests without a valid token are rejected with a 401 error. All other API endpoints are open for internal dashboard use.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Key className="h-3 w-3" /> Authorization Header
                </h4>
                <div className="rounded bg-zinc-900/60 border border-zinc-800/50 p-3">
                  <code className="text-xs font-mono text-zinc-300">Authorization: Bearer ts_your_api_key</code>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> API Key Format
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keys are auto-generated with the <code className="font-mono">ts_</code> prefix when creating a connected app. Manage keys on the Connected Apps page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApiGuidePage() {
  const [activeSection, setActiveSection] = useState("quickstart");
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

  const currentSection = activeSection === "quickstart"
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

  const navItems = (
    <>
      <button
        className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${activeSection === "quickstart" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
        onClick={() => handleSectionClick("quickstart")}
        data-testid="nav-section-quickstart"
      >
        <Rocket className="h-3.5 w-3.5" />
        <span>Quick Start</span>
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
    </>
  );

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
        {navItems}
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
              {navItems}
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

        {activeSection === "quickstart" && (
          <QuickStartContent baseUrl={baseUrl} />
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
