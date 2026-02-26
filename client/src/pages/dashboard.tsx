import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  TrendingUp,
  Activity,
  Zap,
  BarChart3,
  Settings2,
  Puzzle,
  MessageSquare,
  Landmark,
  Shield,
  Radio,
  Cpu,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Power,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import type { Alert, Signal, ConnectedApp, SystemSetting, Integration } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function StatusIndicator({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SystemOverviewPanel({ stats, settings, connectedApps, integrationsData }: {
  stats: any;
  settings: SystemSetting[];
  connectedApps: ConnectedApp[];
  integrationsData: Integration[];
}) {
  const getSetting = (key: string) => settings.find(s => s.key === key);
  const isOn = (key: string) => getSetting(key)?.value === "true";

  const activeApps = connectedApps.filter(a => a.status === "active").length;
  const activeIntegrations = integrationsData.filter(i => i.enabled).length;
  const discordChannels = integrationsData.filter(i => i.type === "discord" && i.enabled).length;
  const ibkrAccounts = integrationsData.filter(i => i.type === "ibkr").length;

  return (
    <Card data-testid="card-system-overview">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          System Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border p-3 text-center" data-testid="stat-overview-alerts">
            <Bell className="mx-auto h-5 w-5 text-amber-500" />
            <p className="mt-1 text-2xl font-bold">{stats?.activeAlerts ?? 0}</p>
            <p className="text-xs text-muted-foreground">Active Alerts</p>
            <StatusIndicator active={isOn("alert_system_enabled")} label={isOn("alert_system_enabled") ? "Monitoring" : "Paused"} />
          </div>
          <div className="rounded-lg border p-3 text-center" data-testid="stat-overview-signals">
            <TrendingUp className="mx-auto h-5 w-5 text-emerald-500" />
            <p className="mt-1 text-2xl font-bold">{stats?.activeSignals ?? 0}</p>
            <p className="text-xs text-muted-foreground">Active Signals</p>
            <StatusIndicator active={isOn("signal_system_enabled")} label={isOn("signal_system_enabled") ? "Scanning" : "Off"} />
          </div>
          <div className="rounded-lg border p-3 text-center" data-testid="stat-overview-apps">
            <Puzzle className="mx-auto h-5 w-5 text-blue-500" />
            <p className="mt-1 text-2xl font-bold">{activeApps}/{connectedApps.length}</p>
            <p className="text-xs text-muted-foreground">Connected Apps</p>
            <StatusIndicator active={activeApps > 0} label={`${activeIntegrations} integrations`} />
          </div>
          <div className="rounded-lg border p-3 text-center" data-testid="stat-overview-trading">
            <Landmark className="mx-auto h-5 w-5 text-purple-500" />
            <p className="mt-1 text-2xl font-bold">{ibkrAccounts}</p>
            <p className="text-xs text-muted-foreground">Broker Accounts</p>
            <StatusIndicator active={isOn("trade_execution_enabled")} label={isOn("trade_paper_mode") ? "Paper Mode" : isOn("trade_execution_enabled") ? "Live" : "Disabled"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsToggle({ setting, onToggle, isPending }: {
  setting: SystemSetting;
  onToggle: (setting: SystemSetting, newValue: string) => void;
  isPending: boolean;
}) {
  const isBool = setting.type === "boolean";
  const isOn = setting.value === "true";
  const [localValue, setLocalValue] = useState(setting.value);

  return (
    <div className="flex items-center justify-between gap-3 py-2" data-testid={`setting-${setting.key}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{setting.label}</p>
        {setting.description && (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        )}
      </div>
      {isBool ? (
        <Switch
          checked={isOn}
          onCheckedChange={(checked) => onToggle(setting, String(checked))}
          disabled={isPending}
          data-testid={`switch-${setting.key}`}
        />
      ) : (
        <Input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            if (localValue !== setting.value && localValue.trim() !== "") {
              onToggle(setting, localValue);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && localValue.trim() !== "") {
              onToggle(setting, localValue);
            }
          }}
          className="w-20 h-8 text-sm"
          data-testid={`input-${setting.key}`}
        />
      )}
    </div>
  );
}

function SettingsPanel({ settings, category, icon: Icon, title }: {
  settings: SystemSetting[];
  category: string;
  icon: React.ElementType;
  title: string;
}) {
  const { toast } = useToast();
  const categorySettings = settings.filter(s => s.category === category);

  const updateMutation = useMutation({
    mutationFn: async (data: { key: string; value: string; category: string; label: string; description: string | null; type: string }) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (setting: SystemSetting, newValue: string) => {
    updateMutation.mutate({
      key: setting.key,
      value: newValue,
      category: setting.category,
      label: setting.label,
      description: setting.description,
      type: setting.type,
    });
  };

  if (categorySettings.length === 0) return null;

  return (
    <Card data-testid={`card-settings-${category}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {categorySettings.map((setting) => (
            <SettingsToggle
              key={setting.key}
              setting={setting}
              onToggle={handleToggle}
              isPending={updateMutation.isPending}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectedAppsPanel({ apps }: { apps: ConnectedApp[] }) {
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/connected-apps/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-apps"] });
      toast({ title: "App status updated" });
    },
  });

  return (
    <Card data-testid="card-connected-apps-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Puzzle className="h-4 w-4" />
          Plugged-In Apps
        </CardTitle>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No apps connected</p>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => {
              const isActive = app.status === "active";
              return (
                <div key={app.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" data-testid={`panel-app-${app.id}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Puzzle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{app.name}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {app.syncAlerts && <Badge variant="outline" className="text-[10px] h-5"><Bell className="mr-0.5 h-2.5 w-2.5" />Alerts</Badge>}
                        {app.syncSignals && <Badge variant="outline" className="text-[10px] h-5"><TrendingUp className="mr-0.5 h-2.5 w-2.5" />Signals</Badge>}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: app.id, status: checked ? "active" : "inactive" })}
                    data-testid={`switch-app-${app.id}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const { toast } = useToast();
  const config = integration.config as Record<string, any> | null;

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Integration>) => {
      const res = await apiRequest("PATCH", `/api/integrations/${integration.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (field: string, value: boolean) => {
    updateMutation.mutate({ [field]: value });
  };

  const isDiscord = integration.type === "discord";
  const isIBKR = integration.type === "ibkr";
  const Icon = isDiscord ? SiDiscord : Landmark;
  const iconColor = isDiscord ? "text-indigo-500" : "text-purple-500";

  return (
    <Card data-testid={`card-integration-${integration.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${integration.enabled ? "bg-primary/10" : "bg-muted"}`}>
              <Icon className={`h-4 w-4 ${integration.enabled ? iconColor : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm font-medium" data-testid={`text-integration-name-${integration.id}`}>{integration.name}</p>
              <p className="text-xs text-muted-foreground">
                {isDiscord && config?.channelName}
                {isIBKR && `Account: ${config?.accountId}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={integration.enabled ? "default" : "secondary"} className="text-xs">
              {integration.enabled ? (
                <><Wifi className="mr-1 h-3 w-3" />Connected</>
              ) : (
                <><WifiOff className="mr-1 h-3 w-3" />Offline</>
              )}
            </Badge>
            <Switch
              checked={integration.enabled}
              onCheckedChange={(checked) => handleToggle("enabled", checked)}
              data-testid={`switch-integration-enabled-${integration.id}`}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notification Channels</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs">Alerts</span>
              <Switch
                checked={integration.notifyAlerts}
                onCheckedChange={(checked) => handleToggle("notifyAlerts", checked)}
                className="scale-75"
                data-testid={`switch-integration-alerts-${integration.id}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Signals</span>
              <Switch
                checked={integration.notifySignals}
                onCheckedChange={(checked) => handleToggle("notifySignals", checked)}
                className="scale-75"
                data-testid={`switch-integration-signals-${integration.id}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Trades</span>
              <Switch
                checked={integration.notifyTrades}
                onCheckedChange={(checked) => handleToggle("notifyTrades", checked)}
                className="scale-75"
                data-testid={`switch-integration-trades-${integration.id}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">System</span>
              <Switch
                checked={integration.notifySystem}
                onCheckedChange={(checked) => handleToggle("notifySystem", checked)}
                className="scale-75"
                data-testid={`switch-integration-system-${integration.id}`}
              />
            </div>
          </div>

          {isIBKR && (
            <>
              <Separator className="my-2" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trading Controls</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Auto-Trade</span>
                  <Switch
                    checked={integration.autoTrade}
                    onCheckedChange={(checked) => handleToggle("autoTrade", checked)}
                    className="scale-75"
                    data-testid={`switch-integration-autotrade-${integration.id}`}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Paper Mode</span>
                  <Switch
                    checked={integration.paperTrade}
                    onCheckedChange={(checked) => handleToggle("paperTrade", checked)}
                    className="scale-75"
                    data-testid={`switch-integration-paper-${integration.id}`}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsPanel({ integrationsData }: { integrationsData: Integration[] }) {
  const discordIntegrations = integrationsData.filter(i => i.type === "discord");
  const ibkrIntegrations = integrationsData.filter(i => i.type === "ibkr");

  return (
    <div className="space-y-4">
      {discordIntegrations.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <SiDiscord className="h-4 w-4 text-indigo-500" />
            Discord Channels
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {discordIntegrations.map(i => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </div>
      )}
      {ibkrIntegrations.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-purple-500" />
            IBKR Trading Accounts
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {ibkrIntegrations.map(i => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </div>
      )}
      {integrationsData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Radio className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No integrations configured</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="mx-auto h-8 w-8 rounded-full" />
              <Skeleton className="mx-auto mt-2 h-8 w-12" />
              <Skeleton className="mx-auto mt-1 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => <Skeleton key={j} className="h-12 w-full" />)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const statsQuery = useQuery<{
    totalAlerts: number;
    activeAlerts: number;
    triggeredAlerts: number;
    totalSignals: number;
    activeSignals: number;
  }>({ queryKey: ["/api/dashboard/stats"] });

  const settingsQuery = useQuery<SystemSetting[]>({ queryKey: ["/api/settings"] });
  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });
  const integrationsQuery = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });

  if (statsQuery.isLoading || settingsQuery.isLoading || appsQuery.isLoading || integrationsQuery.isLoading) {
    return <LoadingSkeleton />;
  }

  const stats = statsQuery.data;
  const settings = settingsQuery.data ?? [];
  const connectedApps = appsQuery.data ?? [];
  const integrationsData = integrationsQuery.data ?? [];

  return (
    <div className="space-y-6 p-6" data-testid="page-dashboard">
      <div>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">System Control Center</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Full visibility into your trading system — every switch, every integration, every connection
        </p>
      </div>

      <SystemOverviewPanel
        stats={stats}
        settings={settings}
        connectedApps={connectedApps}
        integrationsData={integrationsData}
      />

      <Tabs defaultValue="controls" className="w-full">
        <TabsList className="w-full justify-start" data-testid="tabs-dashboard">
          <TabsTrigger value="controls" data-testid="tab-controls">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            System Controls
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            <Radio className="mr-1.5 h-3.5 w-3.5" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="apps" data-testid="tab-apps">
            <Puzzle className="mr-1.5 h-3.5 w-3.5" />
            Connected Apps
          </TabsTrigger>
          <TabsTrigger value="trading" data-testid="tab-trading">
            <Landmark className="mr-1.5 h-3.5 w-3.5" />
            Trading
          </TabsTrigger>
        </TabsList>

        <TabsContent value="controls" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SettingsPanel settings={settings} category="alerts" icon={Bell} title="Alert System Controls" />
            <SettingsPanel settings={settings} category="signals" icon={TrendingUp} title="Signal Engine Controls" />
            <SettingsPanel settings={settings} category="system" icon={Cpu} title="System Settings" />
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsPanel integrationsData={integrationsData} />
        </TabsContent>

        <TabsContent value="apps" className="mt-4">
          <ConnectedAppsPanel apps={connectedApps} />
        </TabsContent>

        <TabsContent value="trading" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SettingsPanel settings={settings} category="trading" icon={Shield} title="Trading Controls" />
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Landmark className="h-4 w-4 text-purple-500" />
                Broker Accounts
              </h3>
              {integrationsData.filter(i => i.type === "ibkr").map(i => (
                <IntegrationCard key={i.id} integration={i} />
              ))}
              {integrationsData.filter(i => i.type === "ibkr").length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Landmark className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No broker accounts connected</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
