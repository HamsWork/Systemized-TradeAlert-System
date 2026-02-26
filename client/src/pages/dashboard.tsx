import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ElementType } from "react";
import {
  TrendingUp,
  Activity,
  Zap,
  Puzzle,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Layers,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { Link } from "wouter";
import type { Signal, ConnectedApp, ActivityLogEntry, Integration, IbkrPosition, IbkrOrder } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/page-header";

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

function SignalFlowCard({ signals, orders, integrations }: { signals: Signal[]; orders: IbkrOrder[]; integrations: Integration[] }) {
  const activeSignals = signals.filter(s => s.status === "active").length;
  const recentSignals = signals.slice(0, 3);
  const filledOrders = orders.filter(o => o.status === "filled").length;
  const discordChannels = integrations.filter(i => i.type === "discord" && i.enabled).length;

  return (
    <Card data-testid="card-signal-flow">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Signal Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-2 mb-4 py-3 px-4 rounded-lg bg-muted/50">
          <div className="text-center flex-1">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Puzzle className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-medium">Ingest</span>
            </div>
            <p className="text-lg font-bold" data-testid="text-flow-signals">{signals.length}</p>
            <p className="text-[10px] text-muted-foreground">{activeSignals} active</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="text-center flex-1">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Landmark className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-medium">Execute</span>
            </div>
            <p className="text-lg font-bold" data-testid="text-flow-orders">{orders.length}</p>
            <p className="text-[10px] text-muted-foreground">{filledOrders} filled</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="text-center flex-1">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <SiDiscord className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-medium">Notify</span>
            </div>
            <p className="text-lg font-bold" data-testid="text-flow-discord">{discordChannels}</p>
            <p className="text-[10px] text-muted-foreground">channel{discordChannels !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {recentSignals.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Latest Signals</p>
            <div className="space-y-1">
              {recentSignals.map((signal) => {
                const data = (signal.data || {}) as Record<string, any>;
                const ticker = data.ticker || data.symbol || "";
                return (
                  <div key={signal.id} className="flex items-center justify-between gap-2 py-1.5" data-testid={`flow-signal-${signal.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <TrendingUp className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{ticker}</span>
                    </div>
                    {signal.sourceAppName && (
                      <span className="text-xs text-muted-foreground">{signal.sourceAppName}</span>
                    )}
                  </div>
                );
              })}
            </div>
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
              const data = (signal.data || {}) as Record<string, any>;
              const ticker = data.ticker || data.symbol || "";
              const instrumentType = data.instrument_type;
              const color = instrumentType === "Options" ? "#3b82f6" : instrumentType === "LETF" ? "#f59e0b" : "#10b981";
              return (
                <div key={signal.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0" data-testid={`recent-signal-${signal.id}`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: color + "15" }}>
                      <TrendingUp className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ticker} <span className="text-xs text-muted-foreground">{instrumentType || ""}</span></p>
                      {data.entry_price && <p className="text-xs text-muted-foreground">${data.entry_price}</p>}
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
  const typeIcons: Record<string, { icon: ElementType; color: string }> = {
    signal_created: { icon: TrendingUp, color: "text-emerald-500" },
    signal_ingested: { icon: TrendingUp, color: "text-blue-500" },
    app_connected: { icon: Puzzle, color: "text-purple-500" },
    integration_added: { icon: Activity, color: "text-indigo-500" },
    ibkr_order: { icon: Landmark, color: "text-purple-500" },
    discord_sent: { icon: MessageSquare, color: "text-indigo-500" },
    trade_executed: { icon: Landmark, color: "text-emerald-500" },
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
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
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
              {app.executeIbkrTrades && <Badge variant="outline" className="text-[9px] h-4"><Landmark className="mr-0.5 h-2 w-2" />IBKR</Badge>}
              {app.sendDiscordMessages && <Badge variant="outline" className="text-[9px] h-4"><MessageSquare className="mr-0.5 h-2 w-2" />Discord</Badge>}
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

  const signalsQuery = useQuery<Signal[]>({ queryKey: ["/api/signals"] });
  const activityQuery = useQuery<ActivityLogEntry[]>({ queryKey: ["/api/activity"] });
  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });
  const integrationsQuery = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });
  const positionsQuery = useQuery<IbkrPosition[]>({ queryKey: ["/api/ibkr/positions"] });
  const ordersQuery = useQuery<IbkrOrder[]>({ queryKey: ["/api/ibkr/orders"] });

  const isLoading = statsQuery.isLoading || signalsQuery.isLoading || activityQuery.isLoading;

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
  const signals = signalsQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const integrations = integrationsQuery.data ?? [];
  const positions = positionsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const activeApps = apps.filter(a => a.status === "active").length;
  const ibkrAccounts = integrations.filter(i => i.type === "ibkr").length;

  return (
    <div className="p-6 space-y-6" data-testid="page-dashboard">
      <PageHeader
        icon={Zap}
        title="Dashboard"
        description="Signal execution system overview and recent activity"
        testId="heading-dashboard"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          title="IBKR Orders"
          value={orders.length}
          subtitle={`${orders.filter(o => o.status === "filled").length} filled`}
          icon={Landmark}
          accent="text-purple-500"
          href="/ibkr"
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
        <SignalFlowCard signals={signals} orders={orders} integrations={integrations} />
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
