import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Bell,
  TrendingUp,
  Eye,
  Zap,
} from "lucide-react";
import type { ActivityLogEntry, Signal } from "@shared/schema";
import { formatRelativeTime } from "@/lib/formatters";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SignalDetailDialog } from "./signal-detail";

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
  const [selectedEntry, setSelectedEntry] = useState<ActivityLogEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const signalQuery = useQuery<Signal>({
    queryKey: ["/api/signals", selectedSignalId],
    queryFn: async () => {
      const res = await fetch(`/api/signals/${encodeURIComponent(selectedSignalId!)}`);
      if (!res.ok) {
        throw new Error("Failed to load signal details");
      }
      return res.json();
    },
    enabled: !!selectedSignalId && detailOpen,
  });

  const handleCardClick = (entry: ActivityLogEntry) => {
    setSelectedEntry(entry);
    setSelectedSignalId(entry.signalId ?? null);
    setDetailOpen(true);
  };

  const closeDialog = (open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedEntry(null);
      setSelectedSignalId(null);
    }
  };

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
            <Card
              key={entry.id}
              className="hover-elevate cursor-pointer"
              onClick={() => handleCardClick(entry)}
              data-testid={`card-activity-${entry.id}`}
            >
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

      {selectedSignalId ? (
        <SignalDetailDialog
          signal={signalQuery.data ?? null}
          open={detailOpen}
          onOpenChange={closeDialog}
        />
      ) : (
        <Dialog open={detailOpen} onOpenChange={closeDialog}>
          <DialogContent className="max-w-2xl" data-testid="dialog-activity-detail">
            {selectedEntry && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {selectedEntry.type}
                    </span>
                    <span className="text-base font-semibold truncate">{selectedEntry.title}</span>
                    {selectedEntry.symbol && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {selectedEntry.symbol}
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {selectedEntry.createdAt
                      ? `Occurred ${formatRelativeTime(selectedEntry.createdAt)} — ${format(new Date(selectedEntry.createdAt), "MMM d, yyyy h:mm a")}`
                      : "Activity event details"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Summary
                    </h3>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {String(selectedEntry.description ?? "")}
                    </p>
                  </div>

                  {selectedEntry.metadata != null ? (
                    <div>
                      <Separator className="my-3" />
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Details
                      </h3>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        {"sourceApp" in (selectedEntry.metadata as any) && (
                          <div className="flex items-center justify-between">
                            <span>Source App</span>
                            <Badge variant="outline" className="text-[10px]">
                              {(selectedEntry.metadata as any).sourceApp}
                            </Badge>
                          </div>
                        )}

                        {"errors" in (selectedEntry.metadata as any) && Array.isArray((selectedEntry.metadata as any).errors) && (
                          <div>
                            <p className="mb-1 text-xs text-red-400 font-medium">
                              Validation Errors
                            </p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {(selectedEntry.metadata as any).errors.map((err: string, idx: number) => (
                                <li key={idx}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {"rawSignal" in (selectedEntry.metadata as any) && (selectedEntry.metadata as any).rawSignal && (
                          <div className="mt-2">
                            <p className="mb-1 text-xs text-muted-foreground font-medium">
                              Raw Signal Payload
                            </p>
                            <div className="rounded-md bg-zinc-950 border border-border/60 max-h-64 overflow-auto text-[11px]">
                              <pre className="p-3 whitespace-pre-wrap break-all">
                                <code>
                                  {JSON.stringify((selectedEntry.metadata as any).rawSignal, null, 2)}
                                </code>
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
