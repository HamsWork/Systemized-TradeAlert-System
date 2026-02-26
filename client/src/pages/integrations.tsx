import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Radio,
  Plus,
  Trash2,
  Landmark,
  Wifi,
  WifiOff,
  TrendingUp,
  BarChart3,
  Cpu,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertIntegrationSchema, type Integration, type InsertIntegration } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";

const discordFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  channelName: z.string().min(1, "Channel name is required"),
  webhookUrl: z.string().min(1, "Webhook URL is required"),
  serverId: z.string().optional(),
  notifySignals: z.boolean(),
  notifyTrades: z.boolean(),
  notifySystem: z.boolean(),
});

const ibkrFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().min(1, "Port is required"),
  clientId: z.coerce.number().min(0, "Client ID is required"),
  accountType: z.enum(["paper", "live"]),
});

type DiscordFormValues = z.infer<typeof discordFormSchema>;
type IbkrFormValues = z.infer<typeof ibkrFormSchema>;

function CreateDiscordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<DiscordFormValues>({
    resolver: zodResolver(discordFormSchema),
    defaultValues: {
      name: "",
      channelName: "",
      webhookUrl: "",
      serverId: "",
      notifySignals: true,
      notifyTrades: false,
      notifySystem: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DiscordFormValues) => {
      const payload: InsertIntegration = {
        type: "discord",
        name: data.name,
        status: "active",
        config: {
          channelName: data.channelName,
          webhookUrl: data.webhookUrl,
          serverId: data.serverId || null,
        },
        enabled: true,
        notifyAlerts: false,
        notifySignals: data.notifySignals,
        notifyTrades: data.notifyTrades,
        notifySystem: data.notifySystem,
        autoTrade: false,
        paperTrade: false,
      };
      const res = await apiRequest("POST", "/api/integrations", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Discord channel added" });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SiDiscord className="h-5 w-5 text-indigo-500" />
            Add Discord Channel
          </DialogTitle>
          <DialogDescription>
            Connect a Discord channel to receive notifications from TradeSync.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Trading Alerts Channel" {...field} data-testid="input-discord-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="channelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Name</FormLabel>
                    <FormControl>
                      <Input placeholder="#trading-alerts" {...field} data-testid="input-discord-channel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} data-testid="input-discord-server" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="webhookUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Webhook URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://discord.com/api/webhooks/..." {...field} data-testid="input-discord-webhook" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Notification Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Signals</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="notifySignals"
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-discord-signals" />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Trades</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="notifyTrades"
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-discord-trades" />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>System</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="notifySystem"
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-discord-system" />
                    )}
                  />
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-discord">
              {createMutation.isPending ? "Adding..." : "Add Discord Channel"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CreateIbkrDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<IbkrFormValues | null>(null);

  const form = useForm<IbkrFormValues>({
    resolver: zodResolver(ibkrFormSchema),
    defaultValues: {
      name: "",
      host: "127.0.0.1",
      port: 7497,
      clientId: 1,
      accountType: "paper",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: IbkrFormValues) => {
      const payload: InsertIntegration = {
        type: "ibkr",
        name: data.name,
        status: "active",
        config: {
          host: data.host,
          port: data.port,
          clientId: data.clientId,
          accountType: data.accountType,
        },
        enabled: true,
        notifyAlerts: false,
        notifySignals: false,
        notifyTrades: false,
        notifySystem: false,
        autoTrade: false,
        paperTrade: data.accountType === "paper",
      };
      const res = await apiRequest("POST", "/api/integrations", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "IBKR account added" });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-purple-500" />
            Add IBKR Account
          </DialogTitle>
          <DialogDescription>
            Connect an Interactive Brokers account for trade execution and notifications.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => {
            if (data.accountType === "live") {
              setPendingData(data);
              setShowLiveConfirm(true);
            } else {
              createMutation.mutate(data);
            }
          })} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., IBKR Paper Account" {...field} data-testid="input-ibkr-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-ibkr-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="paper">Paper</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host</FormLabel>
                    <FormControl>
                      <Input placeholder="127.0.0.1" {...field} data-testid="input-ibkr-host" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="7497" {...field} data-testid="input-ibkr-port" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client ID</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1" {...field} data-testid="input-ibkr-client" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-ibkr">
              {createMutation.isPending ? "Adding..." : "Add IBKR Account"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showLiveConfirm} onOpenChange={setShowLiveConfirm}>
      <AlertDialogContent data-testid="alert-ibkr-live-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            Live Account Warning
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">You are about to connect a <strong className="text-foreground">live IBKR trading account</strong>. This means:</span>
            <span className="block text-red-400 font-medium">Real money will be at risk if trade execution is enabled.</span>
            <span className="block">Make sure the connection details (host, port, client ID) are correct and that you understand the risks before proceeding.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingData(null)} data-testid="button-cancel-live-ibkr">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => {
              if (pendingData) {
                createMutation.mutate(pendingData);
                setPendingData(null);
              }
              setShowLiveConfirm(false);
            }}
            data-testid="button-confirm-live-ibkr"
          >
            I understand, proceed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function IntegrationCard({ integration, onDelete }: { integration: Integration; onDelete: (id: string) => void }) {
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
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${integration.enabled ? "bg-primary/10" : "bg-muted"}`}>
              <Icon className={`h-4 w-4 ${integration.enabled ? iconColor : "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" data-testid={`text-integration-name-${integration.id}`}>{integration.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {isDiscord && config?.channelName}
                {isIBKR && `Account: ${config?.accountId} (${config?.accountType})`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onDelete(integration.id)}
              data-testid={`button-delete-integration-${integration.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isDiscord && config?.webhookUrl && (
          <div className="mb-3 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
            <span className="font-medium">Webhook: </span>
            <span className="font-mono truncate">{config.webhookUrl.slice(0, 50)}...</span>
          </div>
        )}

        {isIBKR && (
          <div className="mb-3 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 flex items-center gap-3">
            <span><span className="font-medium">Host:</span> {config?.host}:{config?.port}</span>
            <span><span className="font-medium">Client:</span> {config?.clientId}</span>
          </div>
        )}

        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notification Channels</p>
          <div className="grid grid-cols-2 gap-2">
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

        <p className="mt-3 text-[10px] text-muted-foreground">
          Added {integration.createdAt ? formatDistanceToNow(new Date(integration.createdAt), { addSuffix: true }) : "recently"}
        </p>
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const [discordDialogOpen, setDiscordDialogOpen] = useState(false);
  const [ibkrDialogOpen, setIbkrDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  const integrationsQuery = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/integrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Integration removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (integrationsQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const integrations = integrationsQuery.data ?? [];
  const discordIntegrations = integrations.filter(i => i.type === "discord");
  const ibkrIntegrations = integrations.filter(i => i.type === "ibkr");

  const filtered = filter === "all"
    ? integrations
    : filter === "discord"
      ? discordIntegrations
      : ibkrIntegrations;

  return (
    <div className="space-y-6 p-6" data-testid="page-integrations">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Discord channels and IBKR trading accounts to TradeSync
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDiscordDialogOpen(true)} data-testid="button-add-discord">
            <SiDiscord className="mr-2 h-4 w-4 text-indigo-500" />
            Add Discord
          </Button>
          <Button variant="outline" onClick={() => setIbkrDialogOpen(true)} data-testid="button-add-ibkr">
            <Landmark className="mr-2 h-4 w-4 text-purple-500" />
            Add IBKR
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
              <SiDiscord className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="stat-discord-count">{discordIntegrations.length}</p>
              <p className="text-xs text-muted-foreground">Discord Channels</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <Landmark className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="stat-ibkr-count">{ibkrIntegrations.length}</p>
              <p className="text-xs text-muted-foreground">IBKR Accounts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Wifi className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="stat-active-count">{integrations.filter(i => i.enabled).length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all", label: "All", count: integrations.length },
          { key: "discord", label: "Discord", count: discordIntegrations.length },
          { key: "ibkr", label: "IBKR", count: ibkrIntegrations.length },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f.key)}
            data-testid={`button-filter-integrations-${f.key}`}
          >
            {f.label} ({f.count})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Radio className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-medium">No integrations</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "Add your first integration to get started"
                : `No ${filter === "discord" ? "Discord channels" : "IBKR accounts"} configured`}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setDiscordDialogOpen(true)} data-testid="button-empty-add-discord">
                <SiDiscord className="mr-2 h-4 w-4 text-indigo-500" />
                Add Discord
              </Button>
              <Button variant="outline" onClick={() => setIbkrDialogOpen(true)} data-testid="button-empty-add-ibkr">
                <Landmark className="mr-2 h-4 w-4 text-purple-500" />
                Add IBKR
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {(filter === "all" || filter === "discord") && discordIntegrations.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 mb-3 text-sm font-semibold">
                <SiDiscord className="h-4 w-4 text-indigo-500" />
                Discord Channels
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {discordIntegrations.map(i => (
                  <IntegrationCard key={i.id} integration={i} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </div>
            </div>
          )}
          {(filter === "all" || filter === "ibkr") && ibkrIntegrations.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 mb-3 text-sm font-semibold">
                <Landmark className="h-4 w-4 text-purple-500" />
                IBKR Trading Accounts
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {ibkrIntegrations.map(i => (
                  <IntegrationCard key={i.id} integration={i} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <CreateDiscordDialog open={discordDialogOpen} onOpenChange={setDiscordDialogOpen} />
      <CreateIbkrDialog open={ibkrDialogOpen} onOpenChange={setIbkrDialogOpen} />
    </div>
  );
}
