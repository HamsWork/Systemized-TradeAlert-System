import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  Pencil,
  Landmark,
  Wifi,
  WifiOff,
  Puzzle,
  AlertTriangle,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/page-header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertIntegrationSchema, type Integration, type InsertIntegration, type ConnectedApp } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";

const discordFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  channelName: z.string().min(1, "Channel name is required"),
  webhookUrl: z.string().min(1, "Webhook URL is required"),
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
        },
        enabled: true,
        notifyAlerts: false,
        notifySignals: false,
        notifyTrades: false,
        notifySystem: false,
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

function IntegrationCard({ integration, onDelete, onEdit, connectedApps = [] }: { integration: Integration; onDelete: (id: string) => void; onEdit: (integration: Integration) => void; connectedApps?: ConnectedApp[] }) {
  const { toast } = useToast();
  const config = integration.config as Record<string, any> | null;
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

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

  const linkedApps = isIBKR ? connectedApps.filter(app => {
    return app.ibkrHost === config?.host &&
      app.ibkrPort === String(config?.port) &&
      app.ibkrClientId === String(config?.clientId);
  }) : [];

  const handleDelete = () => {
    if (linkedApps.length > 0) {
      setShowDeleteWarning(true);
    } else {
      onDelete(integration.id);
    }
  };

  return (
    <>
    <Card className={`overflow-hidden transition-colors ${integration.enabled ? (isIBKR ? "border-purple-500/30" : "border-indigo-500/30") : "border-border"}`} data-testid={`card-integration-${integration.id}`}>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4 pb-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${integration.enabled ? (isIBKR ? "bg-purple-500/10" : "bg-indigo-500/10") : "bg-muted"}`}>
            <Icon className={`h-5 w-5 ${integration.enabled ? iconColor : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight" data-testid={`text-integration-name-${integration.id}`}>{integration.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isDiscord && config?.channelName}
              {isIBKR && `${config?.accountType === "paper" ? "Paper" : "Live"} Account`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(integration)}
              data-testid={`button-edit-integration-${integration.id}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              data-testid={`button-delete-integration-${integration.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="px-4 pb-3 space-y-2.5">
          {isDiscord && config?.webhookUrl && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 font-mono truncate">
              {config.webhookUrl.slice(0, 60)}...
            </div>
          )}

          {isIBKR && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">Host</span>
                <span className="font-mono font-medium text-foreground/80">{config?.host}:{config?.port}</span>
              </div>
              <Separator orientation="vertical" className="h-3.5" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">Client</span>
                <span className="font-mono font-medium text-foreground/80">{config?.clientId}</span>
              </div>
            </div>
          )}

          {isIBKR && (
            <div className="flex items-center justify-between">
              <Badge
                variant={integration.enabled ? "default" : "destructive"}
                className={`text-xs px-2.5 py-0.5 ${integration.enabled ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15" : ""}`}
                data-testid={`badge-connection-status-${integration.id}`}
              >
                {integration.enabled ? (
                  <><Wifi className="mr-1.5 h-3 w-3" />Connected</>
                ) : (
                  <><WifiOff className="mr-1.5 h-3 w-3" />Disconnected</>
                )}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className={`h-7 text-xs gap-1.5 ${integration.enabled ? "text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" : "text-emerald-400 hover:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"}`}
                onClick={() => handleToggle("enabled", !integration.enabled)}
                data-testid={`button-toggle-connection-${integration.id}`}
              >
                {integration.enabled ? (
                  <><WifiOff className="h-3 w-3" />Disconnect</>
                ) : (
                  <><Wifi className="h-3 w-3" />Connect</>
                )}
              </Button>
            </div>
          )}

          {isIBKR && linkedApps.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Linked Apps</p>
              <div className="space-y-1">
                {linkedApps.map(app => (
                  <div key={app.id} className="flex items-center gap-2 text-xs" data-testid={`text-linked-app-${app.id}`}>
                    <Puzzle className="h-3 w-3 text-purple-400" />
                    <span className="font-medium">{app.name}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-auto">
                      {app.executeIbkrTrades ? "Trading" : "Linked"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border/50 bg-muted/20">
          <p className="text-[10px] text-muted-foreground">
            Added {integration.createdAt ? formatDistanceToNow(new Date(integration.createdAt), { addSuffix: true }) : "recently"}
          </p>
        </div>
      </CardContent>
    </Card>

    <AlertDialog open={showDeleteWarning} onOpenChange={setShowDeleteWarning}>
      <AlertDialogContent data-testid="alert-delete-ibkr-warning">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            Connected Apps Warning
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              This IBKR account is currently used by <strong className="text-foreground">{linkedApps.length} connected app{linkedApps.length > 1 ? "s" : ""}</strong>:
            </span>
            <span className="block">
              {linkedApps.map(app => (
                <span key={app.id} className="flex items-center gap-1.5 py-0.5">
                  <Puzzle className="h-3 w-3" />
                  <strong className="text-foreground">{app.name}</strong>
                </span>
              ))}
            </span>
            <span className="block text-amber-400 font-medium">
              Deleting this account will break the IBKR connection for these apps.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete-ibkr">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => {
              onDelete(integration.id);
              setShowDeleteWarning(false);
            }}
            data-testid="button-confirm-delete-ibkr"
          >
            Delete Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function EditIntegrationDialog({ integration, open, onOpenChange }: { integration: Integration; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const config = integration.config as Record<string, any> | null;
  const isDiscord = integration.type === "discord";
  const isIBKR = integration.type === "ibkr";

  const discordForm = useForm<DiscordFormValues>({
    resolver: zodResolver(discordFormSchema),
    defaultValues: {
      name: integration.name,
      channelName: config?.channelName ?? "",
      webhookUrl: config?.webhookUrl ?? "",
    },
  });

  const ibkrForm = useForm<IbkrFormValues>({
    resolver: zodResolver(ibkrFormSchema),
    defaultValues: {
      name: integration.name,
      host: config?.host ?? "127.0.0.1",
      port: config?.port ?? 7497,
      clientId: config?.clientId ?? 1,
      accountType: config?.accountType ?? "paper",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      let payload: Partial<InsertIntegration>;
      if (isDiscord) {
        payload = {
          name: data.name,
          config: {
            channelName: data.channelName,
            webhookUrl: data.webhookUrl,
          },
        };
      } else {
        payload = {
          name: data.name,
          config: {
            host: data.host,
            port: data.port,
            clientId: data.clientId,
            accountType: data.accountType,
          },
          paperTrade: data.accountType === "paper",
        };
      }
      const res = await apiRequest("PATCH", `/api/integrations/${integration.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: `${isDiscord ? "Discord channel" : "IBKR account"} updated` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const Icon = isDiscord ? SiDiscord : Landmark;
  const iconColor = isDiscord ? "text-indigo-500" : "text-purple-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            Edit {isDiscord ? "Discord Channel" : "IBKR Account"}
          </DialogTitle>
          <DialogDescription>
            Update the {isDiscord ? "Discord channel" : "IBKR account"} settings.
          </DialogDescription>
        </DialogHeader>

        {isDiscord && (
          <Form {...discordForm}>
            <form onSubmit={discordForm.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
              <FormField
                control={discordForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-discord-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={discordForm.control}
                name="channelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-discord-channel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={discordForm.control}
                name="webhookUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-discord-webhook" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-save-edit-discord">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        )}

        {isIBKR && (
          <Form {...ibkrForm}>
            <form onSubmit={ibkrForm.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
              <FormField
                control={ibkrForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-ibkr-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={ibkrForm.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-ibkr-type">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField
                  control={ibkrForm.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Host</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-ibkr-host" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={ibkrForm.control}
                  name="port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Port</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-edit-ibkr-port" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={ibkrForm.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client ID</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-edit-ibkr-client" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-save-edit-ibkr">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function IntegrationsPage() {
  const [discordDialogOpen, setDiscordDialogOpen] = useState(false);
  const [ibkrDialogOpen, setIbkrDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  const integrationsQuery = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });
  const connectedAppsQuery = useQuery<ConnectedApp[]>({ queryKey: ["/api/connected-apps"] });
  const connectedApps = connectedAppsQuery.data ?? [];

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
      <div className="space-y-4 p-4 sm:p-6">
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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6" data-testid="page-integrations">
      <PageHeader
        icon={Radio}
        title="Integrations"
        description="Connect Discord channels and IBKR trading accounts to TradeSync"
        testId="heading-integrations"
        actions={
          <>
            <Button variant="outline" onClick={() => setDiscordDialogOpen(true)} data-testid="button-add-discord">
              <SiDiscord className="mr-2 h-4 w-4 text-indigo-500" />
              Add Discord
            </Button>
            <Button variant="outline" onClick={() => setIbkrDialogOpen(true)} data-testid="button-add-ibkr">
              <Landmark className="mr-2 h-4 w-4 text-purple-500" />
              Add IBKR
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <IntegrationCard key={i.id} integration={i} onDelete={(id) => deleteMutation.mutate(id)} onEdit={setEditingIntegration} connectedApps={connectedApps} />
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
                  <IntegrationCard key={i.id} integration={i} onDelete={(id) => deleteMutation.mutate(id)} onEdit={setEditingIntegration} connectedApps={connectedApps} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <CreateDiscordDialog open={discordDialogOpen} onOpenChange={setDiscordDialogOpen} />
      <CreateIbkrDialog open={ibkrDialogOpen} onOpenChange={setIbkrDialogOpen} />
      {editingIntegration && (
        <EditIntegrationDialog
          integration={editingIntegration}
          open={!!editingIntegration}
          onOpenChange={(open) => { if (!open) setEditingIntegration(null); }}
        />
      )}
    </div>
  );
}
