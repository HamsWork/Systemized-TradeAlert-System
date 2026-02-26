import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ElementType } from "react";
import {
  Bell,
  TrendingUp,
  Activity,
  Zap,
  Puzzle,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Layers,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { Link } from "wouter";
import type { Alert, Signal, ConnectedApp, ActivityLogEntry, Integration, IbkrPosition } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function StatCard({ title, value, subtitle, icon: Icon, accent, href }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ElementType;
  accent: string;
  href?: string;
}) {
  const content = (
    <Card className={`transition-colors ${href ? "hover:bg-muted/50 cursor-pointer" : ""}`} data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function RecentAlerts({ alerts }: { alerts: Alert[] }) {
  const recent = alerts.slice(0, 5);
  return (
    <Card data-testid="card-recent-alerts">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-amber-500" />
            Recent Alerts
          </CardTitle>
          <Link href="/alerts">
            <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-view-all-alerts">View all</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No alerts yet</p>
        ) : (
          <div className="space-y-1">
            {recent.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0" data-testid={`recent-alert-${alert.id}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${alert.status === "active" ? "bg-emerald-500" : alert.triggered ? "bg-amber-500" : "bg-gray-400"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{alert.name}</p>
                    <p className="text-xs text-muted-foreground">{alert.symbol} {alert.condition} ${alert.targetPrice}</p>
                  </div>
                </div>
                <Badge variant={alert.priority === "high" ? "destructive" : alert.priority === "medium" ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {alert.priority}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSignals({ signals }: { signals: Signal[] }) {
  const recent = signals.slice(0, 5);
  return (
    <Card data-testid="card-recent-signals">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Recent Signals
          </CardTitle>
          <Link href="/signals">
            <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-view-all-signals">View all</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No signals yet</p>
        ) : (
          <div className="space-y-1">
            {recent.map((signal) => {
              const isBuy = signal.direction === "buy";
              return (
                <div key={signal.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0" data-testid={`recent-signal-${signal.id}`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isBuy ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                      {isBuy ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{signal.symbol} <span className="text-xs text-muted-foreground capitalize">{signal.direction}</span></p>
                      <p className="text-xs text-muted-foreground">${signal.entryPrice} &middot; {signal.confidence}% confidence</p>
                    </div>
                  </div>
                  {signal.sourceAppName && (
                    <Badge variant="outline" className="text-[10px] shrink-0">{signal.sourceAppName}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ activity }: { activity: ActivityLogEntry[] }) {
  const recent = activity.slice(0, 8);
  const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
    alert_created: { icon: Bell, color: "text-amber-500" },
    signal_created: { icon: TrendingUp, color: "text-emerald-500" },
    signal_ingested: { icon: TrendingUp, color: "text-blue-500" },
    app_connected: { icon: Puzzle, color: "text-purple-500" },
    integration_added: { icon: Activity, color: "text-indigo-500" },
    ibkr_order: { icon: Landmark, color: "text-purple-500" },
  };

  return (
    <Card data-testid="card-activity-feed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-blue-500" />
            Activity Feed
          </CardTitle>
          <Link href="/activity">
            <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-view-all-activity">View all</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {recent.map((entry) => {
              const config = typeIcons[entry.type] || { icon: Activity, color: "text-muted-foreground" };
              const Icon = config.icon;
              return (
                <div key={entry.id} className="flex items-start gap-2.5 py-2 border-b last:border-b-0" data-testid={`activity-${entry.id}`}>
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5`}>
                    <Icon className={`h-3 w-3 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionStatus({ apps, integrations }: { apps: ConnectedApp[]; integrations: Integration[] }) {
  const discordChannels = integrations.filter(i => i.type === "discord" && i.enabled);
  const ibkrAccounts = integrations.filter(i => i.type === "ibkr");
  const activeApps = apps.filter(a => a.status === "active");

  return (
    <Card data-testid="card-connection-status">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Puzzle className="h-4 w-4 text-blue-500" />
          Connections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeApps.map((app) => (
          <div key={app.id} className="flex items-center justify-between gap-2 py-1.5" data-testid={`connection-app-${app.id}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm truncate">{app.name}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {app.syncSignals && <Badge variant="outline" className="text-[9px] h-4"><TrendingUp className="mr-0.5 h-2 w-2" />Signals</Badge>}
              {app.syncAlerts && <Badge variant="outline" className="text-[9px] h-4"><Bell className="mr-0.5 h-2 w-2" />Alerts</Badge>}
            </div>
          </div>
        ))}
        {apps.filter(a => a.status !== "active").map((app) => (
          <div key={app.id} className="flex items-center gap-2 py-1.5 opacity-50" data-testid={`connection-app-${app.id}`}>
            <span className="h-2 w-2 rounded-full bg-gray-400 shrink-0" />
            <span className="text-sm truncate">{app.name}</span>
            <Badge variant="secondary" className="text-[9px] h-4 ml-auto">Inactive</Badge>
          </div>
        ))}

        {(discordChannels.length > 0 || ibkrAccounts.length > 0) && (
          <div className="border-t pt-3 mt-2 space-y-2">
            {discordChannels.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SiDiscord className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="text-sm">Discord</span>
                </div>
                <span className="text-xs text-muted-foreground">{discordChannels.length} channel{discordChannels.length !== 1 ? "s" : ""}</span>
              </div>
            )}
            {ibkrAccounts.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-sm">IBKR</span>
                </div>
                <span className="text-xs text-muted-foreground">{ibkrAccounts.length} account{ibkrAccounts.length !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PositionsSummary({ positions }: { positions: IbkrPosition[] }) {
  if (positions.length === 0) return null;
  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
  const totalPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);
  const pnlPositive = totalPnl >= 0;

  return (
    <Card data-testid="card-positions-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-purple-500" />
            Open Positions
          </CardTitle>
          <Link href="/ibkr">
            <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-view-ibkr">View all</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3 pb-3 border-b">
          <div>
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-lg font-bold">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Unrealized P&L</p>
            <p className={`text-lg font-bold ${pnlPositive ? "text-emerald-500" : "text-red-500"}`}>
              {pnlPositive ? "+" : ""}{totalPnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          {positions.map((pos) => {
            const pnl = pos.unrealizedPnl || 0;
            const isUp = pnl >= 0;
            return (
              <div key={pos.id} className="flex items-center justify-between gap-2 py-1.5" data-testid={`position-${pos.id}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{pos.symbol}</span>
                  <span className="text-xs text-muted-foreground">{pos.quantity} shares</span>
                </div>
                <span className={`text-sm font-medium ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                  {isUp ? "+" : ""}{pnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
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

  const alertsQuery = useQuery<Alert[]>({ queryKey: ["/api/alerts"] });
  const signalsQuery = useQuery<Signal[]>({ queryKey: ["/api/signals"] });
  const activityQuery = useQuery<ActivityLogEntry[]>({ queryKey: ["/api/activity"] });
  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });
  const integrationsQuery = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });
  const positionsQuery = useQuery<IbkrPosition[]>({ queryKey: ["/api/ibkr/positions"] });

  const isLoading = statsQuery.isLoading || alertsQuery.isLoading || signalsQuery.isLoading || activityQuery.isLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-dashboard">
        <div>
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const stats = statsQuery.data;
  const alerts = alertsQuery.data ?? [];
  const signals = signalsQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const integrations = integrationsQuery.data ?? [];
  const positions = positionsQuery.data ?? [];
  const activeApps = apps.filter(a => a.status === "active").length;

  return (
    <div className="p-6 space-y-6" data-testid="page-dashboard">
      <div>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-dashboard">Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Trading system overview and recent activity
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Active Alerts"
          value={stats?.activeAlerts ?? 0}
          subtitle={`${stats?.totalAlerts ?? 0} total`}
          icon={Bell}
          accent="text-amber-500"
          href="/alerts"
        />
        <StatCard
          title="Active Signals"
          value={stats?.activeSignals ?? 0}
          subtitle={`${stats?.totalSignals ?? 0} total`}
          icon={TrendingUp}
          accent="text-emerald-500"
          href="/signals"
        />
        <StatCard
          title="Connected Apps"
          value={activeApps}
          subtitle={`${apps.length} registered`}
          icon={Puzzle}
          accent="text-blue-500"
          href="/connected-apps"
        />
        <StatCard
          title="Positions"
          value={positions.length}
          subtitle={positions.length > 0 ? `$${positions.reduce((s, p) => s + (p.marketValue || 0), 0).toLocaleString()}` : "No open positions"}
          icon={BarChart3}
          accent="text-purple-500"
          href="/ibkr"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentAlerts alerts={alerts} />
        <RecentSignals signals={signals} />
        <ActivityFeed activity={activity} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConnectionStatus apps={apps} integrations={integrations} />
        <PositionsSummary positions={positions} />
      </div>
    </div>
  );
}
