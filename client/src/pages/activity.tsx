import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Bell,
  TrendingUp,
  Eye,
  Zap,
} from "lucide-react";
import type { ActivityLogEntry } from "@shared/schema";
import { formatRelativeTime } from "@/lib/formatters";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

function getActivityIcon(type: string) {
  switch (type) {
    case "alert_triggered":
      return <Bell className="h-4 w-4 text-amber-500" />;
    case "alert_created":
      return <Bell className="h-4 w-4 text-blue-500" />;
    case "signal_created":
      return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    case "watchlist_added":
      return <Eye className="h-4 w-4 text-purple-500" />;
    case "system":
      return <Zap className="h-4 w-4 text-primary" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function getActivityBadge(type: string) {
  switch (type) {
    case "alert_triggered":
      return <Badge variant="destructive" className="text-xs">Alert Triggered</Badge>;
    case "alert_created":
      return <Badge variant="default" className="text-xs">Alert Created</Badge>;
    case "signal_created":
      return <Badge variant="default" className="text-xs">Signal Created</Badge>;
    case "watchlist_added":
      return <Badge variant="secondary" className="text-xs">Watchlist</Badge>;
    case "system":
      return <Badge variant="outline" className="text-xs">System</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{type}</Badge>;
  }
}

export default function ActivityPage() {
  const activityQuery = useQuery<ActivityLogEntry[]>({ queryKey: ["/api/activity"] });

  if (activityQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const activities = activityQuery.data ?? [];

  return (
    <div className="space-y-6 p-6" data-testid="page-activity">
      <PageHeader
        icon={Activity}
        title="Activity"
        description="Complete log of system events and actions"
        testId="heading-activity"
      />

      {activities.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Activity will appear here as you use the system"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map((entry) => (
            <Card key={entry.id} className="hover-elevate" data-testid={`card-activity-${entry.id}`}>
              <CardContent className="flex items-start gap-4 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  {getActivityIcon(entry.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{entry.title}</span>
                    {getActivityBadge(entry.type)}
                    {entry.symbol && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {entry.symbol}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                    {entry.createdAt && (
                      <>
                        <span className="text-border">|</span>
                        <span>{format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}</span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
