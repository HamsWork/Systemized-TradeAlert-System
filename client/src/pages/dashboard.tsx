import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Eye,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
} from "lucide-react";
import type { Alert, Signal, WatchlistItem, ActivityLogEntry } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  testId,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  trend?: "up" | "down" | "neutral";
  testId: string;
}) {
  return (
    <Card className="hover-elevate" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight" data-testid={`${testId}-value`}>{value}</div>
        {description && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {trend === "up" && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
            {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentAlerts({ alerts }: { alerts: Alert[] }) {
  const recentAlerts = alerts.slice(0, 5);

  return (
    <Card data-testid="card-recent-alerts">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Recent Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No alerts configured yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-3"
                data-testid={`alert-item-${alert.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{alert.symbol}</span>
                    <Badge
                      variant={alert.status === "active" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {alert.status}
                    </Badge>
                    {alert.priority === "high" && (
                      <Badge variant="destructive" className="text-xs">
                        High
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {alert.name} - {alert.condition} ${alert.targetPrice.toFixed(2)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveSignals({ signals }: { signals: Signal[] }) {
  const activeSignals = signals.filter((s) => s.status === "active").slice(0, 5);

  return (
    <Card data-testid="card-active-signals">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Active Signals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeSignals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <TrendingUp className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No active signals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeSignals.map((signal) => (
              <div
                key={signal.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-3"
                data-testid={`signal-item-${signal.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{signal.symbol}</span>
                    <Badge
                      variant={signal.direction === "buy" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {signal.direction === "buy" ? (
                        <TrendingUp className="mr-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="mr-1 h-3 w-3" />
                      )}
                      {signal.direction.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {signal.type} - Confidence: {signal.confidence}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">${signal.entryPrice.toFixed(2)}</p>
                  {signal.targetPrice && (
                    <p className="text-xs text-muted-foreground">
                      Target: ${signal.targetPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ activities }: { activities: ActivityLogEntry[] }) {
  const recent = activities.slice(0, 8);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "alert_triggered":
        return <Bell className="h-3.5 w-3.5 text-amber-500" />;
      case "signal_created":
        return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
      case "watchlist_added":
        return <Eye className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <Card data-testid="card-recent-activity">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 py-2" data-testid={`activity-item-${entry.id}`}>
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  {getActivityIcon(entry.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{entry.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
                  <span className="text-xs text-muted-foreground">
                    {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WatchlistPreview({ items }: { items: WatchlistItem[] }) {
  const topItems = items.slice(0, 6);

  return (
    <Card data-testid="card-watchlist-preview">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Watchlist
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Eye className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Watchlist is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md p-2"
                data-testid={`watchlist-preview-${item.id}`}
              >
                <div>
                  <span className="text-sm font-medium">{item.symbol}</span>
                  <p className="text-xs text-muted-foreground">{item.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">${item.currentPrice.toFixed(2)}</p>
                  <p className={`text-xs font-medium ${item.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-12 w-full" />
                ))}
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
    watchlistCount: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
  });

  const alertsQuery = useQuery<Alert[]>({ queryKey: ["/api/alerts"] });
  const signalsQuery = useQuery<Signal[]>({ queryKey: ["/api/signals"] });
  const watchlistQuery = useQuery<WatchlistItem[]>({ queryKey: ["/api/watchlist"] });
  const activityQuery = useQuery<ActivityLogEntry[]>({ queryKey: ["/api/activity"] });

  if (statsQuery.isLoading || alertsQuery.isLoading || signalsQuery.isLoading) {
    return <LoadingSkeleton />;
  }

  const stats = statsQuery.data;
  const alerts = alertsQuery.data ?? [];
  const signals = signalsQuery.data ?? [];
  const watchlistItems = watchlistQuery.data ?? [];
  const activities = activityQuery.data ?? [];

  return (
    <div className="space-y-6 p-6" data-testid="page-dashboard">
      <div>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Trading system overview and recent activity
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Alerts"
          value={stats?.activeAlerts ?? 0}
          icon={Bell}
          description={`${stats?.triggeredAlerts ?? 0} triggered`}
          trend="up"
          testId="stat-active-alerts"
        />
        <StatCard
          title="Active Signals"
          value={stats?.activeSignals ?? 0}
          icon={TrendingUp}
          description={`${stats?.totalSignals ?? 0} total signals`}
          trend="neutral"
          testId="stat-active-signals"
        />
        <StatCard
          title="Watchlist"
          value={stats?.watchlistCount ?? 0}
          icon={Eye}
          description="Assets being tracked"
          testId="stat-watchlist"
        />
        <StatCard
          title="System Status"
          value="Active"
          icon={BarChart3}
          description="All systems operational"
          trend="up"
          testId="stat-system-status"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentAlerts alerts={alerts} />
        <ActiveSignals signals={signals} />
        <WatchlistPreview items={watchlistItems} />
        <RecentActivity activities={activities} />
      </div>
    </div>
  );
}
