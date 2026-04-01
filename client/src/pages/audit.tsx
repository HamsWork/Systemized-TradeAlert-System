import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck,
  RefreshCw,
  Copy,
  Server,
  Database,
  Globe,
  FileCode,
  Layers,
  Map,
  Braces,
  ChevronRight,
  Box,
  Activity,
  Zap,
  MonitorSmartphone,
  HardDrive,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface AuditReport {
  generatedAt: string;
  architecture: {
    techStack: Record<string, string>;
    stats: Record<string, number>;
    endpoints: { method: string; path: string; file: string }[];
    tables: { name: string; file: string; columns: string[] }[];
    services: { name: string; file: string; description: string; exports: string[] }[];
  };
  featureMap: {
    name: string;
    description: string;
    layers: {
      frontend?: string[];
      api?: string[];
      logic?: string[];
      storage?: string[];
      schema?: string[];
    };
  }[];
  files: { path: string; lines: number }[];
}

type TabId = "architecture" | "features" | "json";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  POST: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  PATCH: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  PUT: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  DELETE: "text-red-500 bg-red-500/10 border-red-500/30",
};

const LAYER_META: Record<string, { label: string; color: string; icon: typeof MonitorSmartphone }> = {
  frontend: { label: "Frontend", color: "text-blue-400 bg-blue-400/10 border-blue-400/30", icon: MonitorSmartphone },
  api: { label: "API Route", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", icon: Globe },
  logic: { label: "Business Logic", color: "text-purple-400 bg-purple-400/10 border-purple-400/30", icon: Zap },
  storage: { label: "Storage", color: "text-amber-400 bg-amber-400/10 border-amber-400/30", icon: HardDrive },
  schema: { label: "Schema", color: "text-pink-400 bg-pink-400/10 border-pink-400/30", icon: Database },
};

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Server }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</p>
      </div>
    </div>
  );
}

function ArchitectureView({ data }: { data: AuditReport }) {
  const { techStack, stats, endpoints, tables, services } = data.architecture;
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Tech Stack
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(techStack).map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2" data-testid={`tech-${key}`}>
              <span className="text-xs font-medium text-muted-foreground capitalize min-w-[80px]">{key}</span>
              <span className="text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Project Statistics
        </h3>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Source Files" value={stats.sourceFiles} icon={FileCode} />
          <StatCard label="Source Lines" value={stats.sourceLines} icon={FileCode} />
          <StatCard label="Frontend Files" value={stats.frontendFiles} icon={MonitorSmartphone} />
          <StatCard label="Frontend Lines" value={stats.frontendLines} icon={MonitorSmartphone} />
          <StatCard label="Backend Files" value={stats.backendFiles} icon={Server} />
          <StatCard label="Backend Lines" value={stats.backendLines} icon={Server} />
          <StatCard label="API Endpoints" value={stats.apiEndpoints} icon={Globe} />
          <StatCard label="DB Tables" value={stats.databaseTables} icon={Database} />
          <StatCard label="Services" value={stats.services} icon={Zap} />
          <StatCard label="Features" value={stats.features} icon={Box} />
          <StatCard label="Total Files" value={stats.totalFiles} icon={FileCode} />
          <StatCard label="Total Lines" value={stats.totalLines} icon={FileCode} />
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Backend Services ({services.length})
        </h3>
        <div className="space-y-1.5">
          {services.map(svc => (
            <div
              key={svc.name}
              className="rounded-md border bg-card overflow-hidden"
              data-testid={`service-${svc.name}`}
            >
              <button
                onClick={() => setExpandedService(expandedService === svc.name ? null : svc.name)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronRight className={`h-3.5 w-3.5 mt-0.5 text-muted-foreground transition-transform ${expandedService === svc.name ? "rotate-90" : ""}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono">{svc.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{svc.file}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{svc.description}</p>
                </div>
              </button>
              {expandedService === svc.name && svc.exports.length > 0 && (
                <div className="px-3 pb-2 pt-0 border-t bg-muted/20">
                  <p className="text-[10px] text-muted-foreground font-medium mt-1.5 mb-1">Exports:</p>
                  <div className="flex flex-wrap gap-1">
                    {svc.exports.map(exp => (
                      <Badge key={exp} variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5">{exp}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Database Tables ({tables.length})
        </h3>
        <div className="space-y-1.5">
          {tables.map(tbl => (
            <div
              key={tbl.name}
              className="rounded-md border bg-card overflow-hidden"
              data-testid={`table-${tbl.name}`}
            >
              <button
                onClick={() => setExpandedTable(expandedTable === tbl.name ? null : tbl.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedTable === tbl.name ? "rotate-90" : ""}`} />
                <span className="text-xs font-semibold font-mono">{tbl.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{tbl.columns.length} cols</Badge>
                <span className="text-[10px] text-muted-foreground font-mono ml-auto">{tbl.file}</span>
              </button>
              {expandedTable === tbl.name && tbl.columns.length > 0 && (
                <div className="px-3 pb-2 pt-0 border-t bg-muted/20">
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {tbl.columns.map(col => (
                      <Badge key={col} variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5">{col}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          API Endpoints ({endpoints.length})
        </h3>
        <div className="space-y-1">
          {endpoints.map((ep, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50" data-testid={`endpoint-${i}`}>
              <Badge variant="outline" className={`text-[10px] font-mono px-1.5 py-0 h-5 min-w-[52px] justify-center ${METHOD_COLORS[ep.method] || ""}`}>
                {ep.method}
              </Badge>
              <span className="text-xs font-mono text-foreground">{ep.path}</span>
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{ep.file}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureMapView({ data }: { data: AuditReport }) {
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-4">
        Maps every feature to the exact files that implement it, broken down by layer.
      </p>
      {data.featureMap.map(feature => {
        const layerEntries = Object.entries(feature.layers).filter(([, files]) => files && files.length > 0);
        const isExpanded = expandedFeature === feature.name;

        return (
          <div
            key={feature.name}
            className="rounded-lg border bg-card overflow-hidden"
            data-testid={`feature-${feature.name.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <button
              onClick={() => setExpandedFeature(isExpanded ? null : feature.name)}
              className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <ChevronRight className={`h-4 w-4 mt-0.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{feature.name}</span>
                  <div className="flex gap-1">
                    {layerEntries.map(([layer]) => {
                      const meta = LAYER_META[layer];
                      if (!meta) return null;
                      return (
                        <Badge key={layer} variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${meta.color}`}>
                          {meta.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{feature.description}</p>
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pt-0 border-t bg-muted/20 space-y-2">
                {layerEntries.map(([layer, files]) => {
                  const meta = LAYER_META[layer];
                  if (!meta) return null;
                  const LayerIcon = meta.icon;
                  return (
                    <div key={layer} className="mt-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <LayerIcon className={`h-3 w-3 ${meta.color.split(" ")[0]}`} />
                        <span className={`text-[10px] font-medium uppercase tracking-wider ${meta.color.split(" ")[0]}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="space-y-0.5 pl-4">
                        {(files as string[]).map(file => (
                          <p key={file} className="text-[11px] font-mono text-muted-foreground">{file}</p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JsonExportView({ data }: { data: AuditReport }) {
  const { toast } = useToast();
  const jsonStr = JSON.stringify(data, null, 2);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Raw structured data dump of the full system audit.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(jsonStr);
            toast({ title: "Copied", description: "JSON export copied to clipboard" });
          }}
          data-testid="button-copy-json"
        >
          <Copy className="h-3 w-3 mr-1.5" />
          Copy JSON
        </Button>
      </div>
      <pre
        className="rounded-lg border bg-muted/30 p-4 text-[11px] font-mono text-foreground overflow-auto max-h-[600px] leading-relaxed"
        data-testid="json-export"
      >
        {jsonStr}
      </pre>
    </div>
  );
}

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState<TabId>("architecture");
  const { toast } = useToast();

  const auditQuery = useQuery<AuditReport>({
    queryKey: ["/api/system-audit"],
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const data = auditQuery.data;

  const tabs: { id: TabId; label: string; icon: typeof Server }[] = [
    { id: "architecture", label: "System Architecture", icon: Server },
    { id: "features", label: "Feature File Map", icon: Map },
    { id: "json", label: "JSON Export", icon: Braces },
  ];

  const handleRefresh = async () => {
    toast({ title: "Refreshing", description: "Re-scanning codebase..." });
    const res = await fetch("/api/system-audit?refresh=true");
    const freshData = await res.json();
    queryClient.setQueryData(["/api/system-audit"], freshData);
  };

  const handleCopyAll = () => {
    if (!data) return;

    let text = `TradeSync System Audit\nGenerated: ${new Date(data.generatedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}\n\n`;

    text += "=== TECH STACK ===\n";
    for (const [k, v] of Object.entries(data.architecture.techStack)) {
      text += `${k}: ${v}\n`;
    }

    text += "\n=== STATISTICS ===\n";
    for (const [k, v] of Object.entries(data.architecture.stats)) {
      text += `${k.replace(/([A-Z])/g, " $1").trim()}: ${v}\n`;
    }

    text += "\n=== SERVICES ===\n";
    for (const svc of data.architecture.services) {
      text += `\n${svc.name} (${svc.file})\n  ${svc.description}\n  Exports: ${svc.exports.join(", ")}\n`;
    }

    text += "\n=== DATABASE TABLES ===\n";
    for (const tbl of data.architecture.tables) {
      text += `\n${tbl.name} (${tbl.file})\n  Columns: ${tbl.columns.join(", ")}\n`;
    }

    text += "\n=== API ENDPOINTS ===\n";
    for (const ep of data.architecture.endpoints) {
      text += `${ep.method.padEnd(7)} ${ep.path}  (${ep.file})\n`;
    }

    text += "\n=== FEATURE MAP ===\n";
    for (const f of data.featureMap) {
      text += `\n${f.name}\n  ${f.description}\n`;
      for (const [layer, files] of Object.entries(f.layers)) {
        if (files && files.length > 0) {
          text += `  [${layer}]: ${(files as string[]).join(", ")}\n`;
        }
      }
    }

    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Full audit report copied to clipboard" });
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        icon={ClipboardCheck}
        title="System Audit"
        description="Live, self-documenting overview of the entire TradeSync system"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={auditQuery.isFetching}
              data-testid="button-refresh-audit"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${auditQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAll}
              disabled={!data}
              data-testid="button-copy-all"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy All
            </Button>
          </div>
        }
      />

      {data && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Last scanned: {new Date(data.generatedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}</span>
          <span className="text-muted-foreground/50">|</span>
          <span>{data.architecture.stats.sourceFiles} files</span>
          <span className="text-muted-foreground/50">|</span>
          <span>{data.architecture.stats.sourceLines.toLocaleString()} lines of code</span>
        </div>
      )}

      <div className="flex items-center gap-1 border-b pb-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          {auditQuery.isLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="loading-audit">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Scanning codebase...</span>
            </div>
          ) : !data ? (
            <div className="text-center py-12 text-sm text-muted-foreground" data-testid="error-audit">
              Failed to load audit data. Click Refresh to try again.
            </div>
          ) : (
            <>
              {activeTab === "architecture" && <ArchitectureView data={data} />}
              {activeTab === "features" && <FeatureMapView data={data} />}
              {activeTab === "json" && <JsonExportView data={data} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
