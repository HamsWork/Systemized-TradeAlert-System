import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Puzzle,
  Plus,
  Trash2,
  Globe,
  Webhook,
  Bell,
  TrendingUp,
  Eye,
  Power,
  PowerOff,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertConnectedAppSchema, type ConnectedApp, type InsertConnectedApp } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

function CreateAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<InsertConnectedApp>({
    resolver: zodResolver(insertConnectedAppSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      status: "active",
      apiEndpoint: "",
      apiKey: "",
      webhookUrl: "",
      syncAlerts: true,
      syncSignals: true,
      syncWatchlist: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertConnectedApp) => {
      const res = await apiRequest("POST", "/api/connected-apps", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "App connected", description: "The app has been plugged into TradeSync." });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const nameValue = form.watch("name");
  const handleNameChange = (value: string, onChange: (v: string) => void) => {
    onChange(value);
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    form.setValue("slug", slug);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect New App</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., My Trading App"
                        {...field}
                        onChange={(e) => handleNameChange(e.target.value, field.onChange)}
                        data-testid="input-app-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="my-trading-app" {...field} data-testid="input-app-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Brief description of the app..." {...field} data-testid="input-app-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="apiEndpoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Endpoint</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com/v1" {...field} value={field.value ?? ""} data-testid="input-app-endpoint" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="webhookUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com/hooks" {...field} value={field.value ?? ""} data-testid="input-app-webhook" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Optional API key" {...field} value={field.value ?? ""} data-testid="input-app-apikey" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Sync Settings</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span>Sync Alerts</span>
                </div>
                <FormField
                  control={form.control}
                  name="syncAlerts"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-sync-alerts" />
                  )}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span>Sync Signals</span>
                </div>
                <FormField
                  control={form.control}
                  name="syncSignals"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-sync-signals" />
                  )}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span>Sync Watchlist</span>
                </div>
                <FormField
                  control={form.control}
                  name="syncWatchlist"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-sync-watchlist" />
                  )}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-app">
              {createMutation.isPending ? "Connecting..." : "Connect App"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AppCard({ app, onDelete, onToggleStatus }: {
  app: ConnectedApp;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, status: string) => void;
}) {
  const isActive = app.status === "active";

  return (
    <Card className="hover-elevate" data-testid={`card-app-${app.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Puzzle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold leading-tight" data-testid={`text-app-name-${app.id}`}>{app.name}</h3>
                <p className="text-xs text-muted-foreground">{app.slug}</p>
              </div>
              <Badge variant={isActive ? "default" : "secondary"} className="ml-auto text-xs" data-testid={`badge-app-status-${app.id}`}>
                {isActive ? (
                  <><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />Active</>
                ) : (
                  <><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 inline-block" />Inactive</>
                )}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2" data-testid={`text-app-description-${app.id}`}>
              {app.description}
            </p>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              {app.apiEndpoint && (
                <div className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[180px]">{app.apiEndpoint}</span>
                </div>
              )}
              {app.webhookUrl && (
                <div className="flex items-center gap-1">
                  <Webhook className="h-3.5 w-3.5" />
                  <span>Webhook</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {app.syncAlerts && (
                <Badge variant="outline" className="text-xs font-normal">
                  <Bell className="mr-1 h-3 w-3" />Alerts
                </Badge>
              )}
              {app.syncSignals && (
                <Badge variant="outline" className="text-xs font-normal">
                  <TrendingUp className="mr-1 h-3 w-3" />Signals
                </Badge>
              )}
              {app.syncWatchlist && (
                <Badge variant="outline" className="text-xs font-normal">
                  <Eye className="mr-1 h-3 w-3" />Watchlist
                </Badge>
              )}
            </div>

            {app.lastSyncAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                Last synced {formatDistanceToNow(new Date(app.lastSyncAt), { addSuffix: true })}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggleStatus(app.id, isActive ? "inactive" : "active")}
              title={isActive ? "Deactivate" : "Activate"}
              data-testid={`button-toggle-app-${app.id}`}
            >
              {isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(app.id)}
              data-testid={`button-delete-app-${app.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConnectedAppsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/connected-apps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-apps"] });
      toast({ title: "App disconnected" });
    },
  });

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

  if (appsQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const apps = appsQuery.data ?? [];
  const filtered = filter === "all" ? apps : apps.filter((a) => a.status === filter);

  return (
    <div className="space-y-6 p-6" data-testid="page-connected-apps">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Connected Apps</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage apps plugged into TradeSync
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-open-connect-app">
          <Plus className="mr-2 h-4 w-4" />
          Connect App
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {["all", "active", "inactive"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`button-filter-apps-${f}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "all" && ` (${apps.length})`}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Puzzle className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-medium">No connected apps</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "Plug in your first trading app to get started"
                : `No ${filter} apps`}
            </p>
            {filter === "all" && (
              <Button className="mt-4" onClick={() => setDialogOpen(true)} data-testid="button-empty-connect-app">
                <Plus className="mr-2 h-4 w-4" />
                Connect App
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggleStatus={(id, status) => toggleMutation.mutate({ id, status })}
            />
          ))}
        </div>
      )}

      <CreateAppDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
