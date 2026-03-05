import { useState, useMemo, useEffect } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Puzzle,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Key,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Settings2,
  Landmark,
  MessageSquare,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertConnectedAppSchema, type ConnectedApp, type InsertConnectedApp, type Integration } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { Textarea } from "@/components/ui/textarea";

function IbkrAccountSelector({ form, ibkrAccounts, testIdPrefix }: { form: any; ibkrAccounts: Integration[]; testIdPrefix: string }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const watchHost = form.watch("ibkrHost");
  const watchPort = form.watch("ibkrPort");
  const watchClientId = form.watch("ibkrClientId");

  useEffect(() => {
    if (!watchHost && !watchPort && !watchClientId) {
      setSelectedAccountId("");
      return;
    }
    const match = ibkrAccounts.find(a => {
      const cfg = a.config as Record<string, any> | null;
      return cfg?.host === watchHost && String(cfg?.port) === String(watchPort) && String(cfg?.clientId) === String(watchClientId);
    });
    setSelectedAccountId(match?.id ?? "");
  }, [watchHost, watchPort, watchClientId, ibkrAccounts]);

  const handleAccountSelect = (accountId: string) => {
    const account = ibkrAccounts.find(a => a.id === accountId);
    if (account) {
      const config = account.config as Record<string, any> | null;
      form.setValue("ibkrClientId", String(config?.clientId ?? ""), { shouldDirty: true });
      form.setValue("ibkrHost", config?.host ?? "", { shouldDirty: true });
      form.setValue("ibkrPort", String(config?.port ?? ""), { shouldDirty: true });
    }
  };

  return (
    <>
      <div>
        <FormLabel>IBKR Account</FormLabel>
        <Select value={selectedAccountId} onValueChange={handleAccountSelect}>
          <SelectTrigger className="mt-1" data-testid={`${testIdPrefix}-select-ibkr-account`}>
            <SelectValue placeholder="Select an IBKR account..." />
          </SelectTrigger>
          <SelectContent>
            {ibkrAccounts.map(account => {
              const cfg = account.config as Record<string, any> | null;
              return (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({cfg?.host}:{cfg?.port})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {selectedAccountId && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 flex items-center gap-3">
          <span><span className="font-medium">Host:</span> {watchHost}:{watchPort}</span>
          <span><span className="font-medium">Client:</span> {watchClientId}</span>
        </div>
      )}
    </>
  );
}

function CreateAppDialog({ open, onOpenChange, ibkrAccounts }: { open: boolean; onOpenChange: (open: boolean) => void; ibkrAccounts: Integration[] }) {
  const { toast } = useToast();

  const form = useForm<InsertConnectedApp>({
    resolver: zodResolver(insertConnectedAppSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      status: "active",
      discordWebhookShares: "",
      discordWebhookOptions: "",
      discordWebhookLetf: "",
      discordWebhookLetfOption: "",
      discordWebhookCrypto: "",
      sendDiscordMessages: false,
      executeIbkrTrades: false,
      ibkrClientId: "",
      ibkrHost: "",
      ibkrPort: "",
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
      toast({ title: "App connected", description: "The app has been plugged into TradeSync. An API key has been generated automatically." });
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
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
            <div className="rounded-lg border border-dashed p-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Key className="h-4 w-4 text-amber-500" />
                API Key
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                An API key will be auto-generated when you connect this app. The app will use this key to send signals to TradeSync.
              </p>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <SiDiscord className="h-4 w-4 text-indigo-500" />
                  Discord Settings
                </div>
                <FormField
                  control={form.control}
                  name="sendDiscordMessages"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-send-discord" />
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="discordWebhookShares"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shares Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-discord-shares" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookOptions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Options Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-discord-options" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookLetf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Leveraged ETF Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-discord-letf" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookLetfOption"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LETF Option Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-discord-letf-option" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookCrypto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Crypto Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-discord-crypto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Landmark className="h-4 w-4 text-purple-500" />
                  IBKR Settings
                </div>
                <FormField
                  control={form.control}
                  name="executeIbkrTrades"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-execute-ibkr" />
                  )}
                />
              </div>
              <IbkrAccountSelector form={form} ibkrAccounts={ibkrAccounts} testIdPrefix="create" />
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

function EditAppDialog({ app, open, onOpenChange, ibkrAccounts }: { app: ConnectedApp; open: boolean; onOpenChange: (open: boolean) => void; ibkrAccounts: Integration[] }) {
  const { toast } = useToast();

  const form = useForm<InsertConnectedApp>({
    resolver: zodResolver(insertConnectedAppSchema),
    defaultValues: {
      name: app.name,
      slug: app.slug,
      description: app.description ?? "",
      status: app.status,
      discordWebhookShares: app.discordWebhookShares ?? "",
      discordWebhookOptions: app.discordWebhookOptions ?? "",
      discordWebhookLetf: app.discordWebhookLetf ?? "",
      discordWebhookLetfOption: app.discordWebhookLetfOption ?? "",
      discordWebhookCrypto: app.discordWebhookCrypto ?? "",
      sendDiscordMessages: app.sendDiscordMessages,
      executeIbkrTrades: app.executeIbkrTrades,
      ibkrClientId: app.ibkrClientId ?? "",
      ibkrHost: app.ibkrHost ?? "",
      ibkrPort: app.ibkrPort ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertConnectedApp) => {
      const res = await apiRequest("PATCH", `/api/connected-apps/${app.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "App updated", description: "The app settings have been saved." });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Edit App Settings
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-app-name" />
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
                      <Input {...field} data-testid="input-edit-app-slug" />
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
                    <Textarea {...field} data-testid="input-edit-app-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <SiDiscord className="h-4 w-4 text-indigo-500" />
                  Discord Settings
                </div>
                <FormField
                  control={form.control}
                  name="sendDiscordMessages"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-edit-send-discord" />
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="discordWebhookShares"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shares Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-edit-discord-shares" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookOptions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Options Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-edit-discord-options" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookLetf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Leveraged ETF Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-edit-discord-letf" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookLetfOption"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LETF Option Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-edit-discord-letf-option" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discordWebhookCrypto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Crypto Webhook URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://discord.com/api/webhooks/..." {...field} value={field.value ?? ""} data-testid="input-edit-discord-crypto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Landmark className="h-4 w-4 text-purple-500" />
                  IBKR Settings
                </div>
                <FormField
                  control={form.control}
                  name="executeIbkrTrades"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-edit-execute-ibkr" />
                  )}
                />
              </div>
              <IbkrAccountSelector form={form} ibkrAccounts={ibkrAccounts} testIdPrefix="edit" />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-save-app">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyDisplay({ app }: { app: ConnectedApp }) {
  const [visible, setVisible] = useState(false);
  const { toast } = useToast();

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/connected-apps/${app.id}/regenerate-key`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-apps"] });
      toast({ title: "API key regenerated", description: "Make sure to update this key in your app." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyKey = () => {
    if (app.apiKey) {
      navigator.clipboard.writeText(app.apiKey);
      toast({ title: "API key copied to clipboard" });
    }
  };

  if (!app.apiKey) return null;

  return (
    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3" data-testid={`api-key-section-${app.id}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <Key className="h-3.5 w-3.5" />
          API Key
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setVisible(!visible)}
            data-testid={`button-toggle-key-${app.id}`}
          >
            {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={copyKey}
            data-testid={`button-copy-key-${app.id}`}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            data-testid={`button-regenerate-key-${app.id}`}
          >
            <RefreshCw className={`h-3 w-3 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <code className="block text-xs font-mono break-all bg-background/50 rounded px-2 py-1.5 select-all" data-testid={`text-api-key-${app.id}`}>
        {visible ? app.apiKey : `${app.apiKey.slice(0, 6)}${"•".repeat(24)}${app.apiKey.slice(-4)}`}
      </code>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Use this key in your app's Authorization header: <code className="text-xs">Bearer {visible ? app.apiKey.slice(0, 10) + "..." : "ts_••••"}</code>
      </p>
    </div>
  );
}

function AppCard({ app, onDelete, onToggleStatus, onEdit }: {
  app: ConnectedApp;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, status: string) => void;
  onEdit: (app: ConnectedApp) => void;
}) {
  const isActive = app.status === "active";
  const hasSharesWebhook = !!app.discordWebhookShares;
  const hasOptionsWebhook = !!app.discordWebhookOptions;
  const hasLetfWebhook = !!app.discordWebhookLetf;
  const hasLetfOptionWebhook = !!app.discordWebhookLetfOption;
  const hasCryptoWebhook = !!app.discordWebhookCrypto;

  return (
    <Card className="hover-elevate" data-testid={`card-app-${app.id}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              <Puzzle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold leading-tight" data-testid={`text-app-name-${app.id}`}>{app.name}</h3>
              <p className="text-xs text-muted-foreground">{app.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {app.isBuiltIn && (
              <Badge variant="outline" className="text-xs mr-1 h-7 flex items-center border-primary/30 text-primary/80" data-testid={`badge-built-in-${app.id}`}>
                Built-in
              </Badge>
            )}
            <Badge variant={isActive ? "default" : "secondary"} className="text-xs mr-1 h-7 flex items-center" data-testid={`badge-app-status-${app.id}`}>
              {isActive ? (
                <><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />Active</>
              ) : (
                <><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 inline-block" />Inactive</>
              )}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(app)}
              title="Edit Settings"
              data-testid={`button-edit-app-${app.id}`}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            {!app.isBuiltIn && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onToggleStatus(app.id, isActive ? "inactive" : "active")}
                title={isActive ? "Deactivate" : "Activate"}
                data-testid={`button-toggle-app-${app.id}`}
              >
                {isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              </Button>
            )}
            {!app.isBuiltIn && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete(app.id)}
                title="Delete"
                data-testid={`button-delete-app-${app.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-app-description-${app.id}`}>
          {app.description}
        </p>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {app.executeIbkrTrades && (
            <Badge variant="outline" className="text-xs font-normal">
              <Landmark className="mr-1 h-3 w-3 text-purple-500" />IBKR Trades
            </Badge>
          )}
          {app.sendDiscordMessages && (
            <Badge variant="outline" className="text-xs font-normal">
              <MessageSquare className="mr-1 h-3 w-3 text-indigo-500" />Discord
            </Badge>
          )}
        </div>

        {(hasSharesWebhook || hasOptionsWebhook || hasLetfWebhook || hasLetfOptionWebhook || hasCryptoWebhook) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <SiDiscord className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
            {hasSharesWebhook && (
              <Badge variant="secondary" className="text-[10px] font-normal">Shares</Badge>
            )}
            {hasOptionsWebhook && (
              <Badge variant="secondary" className="text-[10px] font-normal">Options</Badge>
            )}
            {hasLetfWebhook && (
              <Badge variant="secondary" className="text-[10px] font-normal">Leveraged ETF</Badge>
            )}
            {hasLetfOptionWebhook && (
              <Badge variant="secondary" className="text-[10px] font-normal">LETF Option</Badge>
            )}
            {hasCryptoWebhook && (
              <Badge variant="secondary" className="text-[10px] font-normal">Crypto</Badge>
            )}
          </div>
        )}

        <ApiKeyDisplay app={app} />

        {app.lastSyncAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Last synced {formatDistanceToNow(new Date(app.lastSyncAt), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConnectedAppsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ConnectedApp | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  const appsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });
  const ibkrQuery = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });
  const ibkrAccounts = (ibkrQuery.data ?? []).filter(i => i.type === "ibkr");

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
      <PageHeader
        icon={Puzzle}
        title="Connected Apps"
        description="Manage apps plugged into TradeSync — each app gets an API key to send signals"
        testId="heading-connected-apps"
        actions={
          <Button onClick={() => setDialogOpen(true)} data-testid="button-open-connect-app">
            <Plus className="mr-2 h-4 w-4" />
            Connect App
          </Button>
        }
      />

      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Key className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-sm">
              <p className="font-medium">Signal Ingestion API</p>
              <p className="text-muted-foreground mt-0.5">
                Connected apps can push signals to TradeSync using their API key. Send a POST to{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded" data-testid="text-ingest-endpoint">/api/ingest/signals</code>{" "}
                with <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization: Bearer &lt;api_key&gt;</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
              onEdit={(app) => setEditingApp(app)}
            />
          ))}
        </div>
      )}

      <CreateAppDialog open={dialogOpen} onOpenChange={setDialogOpen} ibkrAccounts={ibkrAccounts} />
      {editingApp && (
        <EditAppDialog
          app={editingApp}
          open={!!editingApp}
          onOpenChange={(open) => { if (!open) setEditingApp(null); }}
          ibkrAccounts={ibkrAccounts}
        />
      )}
    </div>
  );
}
