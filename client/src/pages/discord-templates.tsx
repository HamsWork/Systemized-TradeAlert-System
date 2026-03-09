import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type InsertIntegration, type ConnectedApp } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  Loader2,
  Target,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  Eye,
  X,
  AlertCircle,
  Plus,
  Save,
  RotateCcw,
  Pencil,
  Check,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const addChannelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  channelName: z.string().min(1, "Channel name is required"),
  webhookUrl: z.string().min(1, "Webhook URL is required"),
});

type AddChannelValues = z.infer<typeof addChannelSchema>;

function AddDiscordChannelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (channelId: string) => void }) {
  const { toast } = useToast();

  const form = useForm<AddChannelValues>({
    resolver: zodResolver(addChannelSchema),
    defaultValues: { name: "", channelName: "", webhookUrl: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AddChannelValues) => {
      const payload: InsertIntegration = {
        type: "discord",
        name: data.name,
        status: "active",
        config: { channelName: data.channelName, webhookUrl: data.webhookUrl },
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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discord/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Discord channel added" });
      form.reset();
      onOpenChange(false);
      if (onCreated && data?.id) {
        onCreated(String(data.id));
      }
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
                    <Input placeholder="e.g., Trading Alerts Channel" {...field} data-testid="input-add-discord-name" />
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
                    <Input placeholder="#trading-alerts" {...field} data-testid="input-add-discord-channel" />
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
                    <Input placeholder="https://discord.com/api/webhooks/..." {...field} data-testid="input-add-discord-webhook" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-discord-channel">
              {createMutation.isPending ? "Adding..." : "Add Discord Channel"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface DiscordPreviewEmbed {
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordPreviewMsg {
  type: string;
  label: string;
  content: string;
  embed: DiscordPreviewEmbed;
  isCustom?: boolean;
}

interface TemplateGroup {
  instrumentType: string;
  ticker: string;
  templates: DiscordPreviewMsg[];
}

interface DiscordChannel {
  id: string;
  integrationId: string;
  name: string;
  channelName: string;
  webhookUrl: string;
}

const COLOR_HEX: Record<number, string> = {
  0x22c55e: "#22c55e",
  0xef4444: "#ef4444",
  0x3b82f6: "#3b82f6",
  0xf59e0b: "#f59e0b",
  0x6b7280: "#6b7280",
};

function colorToHex(color: number): string {
  return COLOR_HEX[color] || `#${color.toString(16).padStart(6, "0")}`;
}

const TYPE_ICONS: Record<string, typeof TrendingUp> = {
  signal_alert: TrendingUp,
  target_hit: Target,
  stop_loss_raised: ShieldAlert,
  stop_loss_hit: AlertTriangle,
  trade_closed_manually: X,
};

const TYPE_COLORS: Record<string, string> = {
  signal_alert: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  target_hit: "bg-green-500/10 text-green-500 border-green-500/20",
  stop_loss_raised: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  stop_loss_hit: "bg-red-500/10 text-red-500 border-red-500/20",
  trade_closed_manually: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

function DiscordEmbed({ msg }: { msg: DiscordPreviewMsg }) {
  const embed = msg.embed;
  const borderColor = colorToHex(embed.color);
  const fields = embed.fields?.filter(f => f.name !== "\u200b") || [];
  const inlineFields = fields.filter(f => f.inline);
  const blockFields = fields.filter(f => !f.inline);

  return (
    <div className="rounded-md overflow-hidden bg-[#2b2d31] border border-[#1e1f22]" data-testid={`discord-embed-${msg.type}`}>
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: borderColor }} />
        <div className="p-3 flex-1 min-w-0 space-y-2">
          {embed.description && (
            <p className="text-[13px] text-[#dbdee1] font-medium leading-snug">
              {embed.description.split(/\*\*(.*?)\*\*/).map((part, i) =>
                i % 2 === 1 ? <strong key={i}>{part}</strong> : part
              )}
            </p>
          )}

          {inlineFields.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {inlineFields.map((field, i) => (
                <div key={i} className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#b5bac1] uppercase tracking-wide">{field.name}</p>
                  <p className="text-[12px] text-[#dbdee1] whitespace-pre-wrap break-words">{field.value || "\u200b"}</p>
                </div>
              ))}
            </div>
          )}

          {blockFields.map((field, i) => (
            <div key={i}>
              <p className="text-[11px] font-semibold text-[#b5bac1] uppercase tracking-wide">{field.name}</p>
              <p className="text-[12px] text-[#dbdee1] whitespace-pre-wrap break-words leading-relaxed">{field.value || "\u200b"}</p>
            </div>
          ))}

          {embed.footer && (
            <p className="text-[10px] text-[#949ba4] pt-1 border-t border-[#3f4147]">{embed.footer.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPayloadJson(preview: DiscordPreviewMsg): string {
  return JSON.stringify({
    content: preview.content || undefined,
    embeds: [{
      description: preview.embed.description,
      color: preview.embed.color,
      fields: preview.embed.fields,
      footer: preview.embed.footer,
      ...(preview.embed.timestamp ? { timestamp: preview.embed.timestamp } : {}),
    }],
  }, null, 2);
}

function parseJsonToPreview(json: string, fallback: DiscordPreviewMsg): DiscordPreviewMsg | null {
  try {
    const parsed = JSON.parse(json);
    const embed = parsed.embeds?.[0];
    if (!embed) return null;
    return {
      type: fallback.type,
      label: fallback.label,
      content: parsed.content || "",
      embed: {
        description: embed.description || "",
        color: typeof embed.color === "number" ? embed.color : fallback.embed.color,
        fields: Array.isArray(embed.fields) ? embed.fields : [],
        footer: embed.footer || undefined,
        timestamp: embed.timestamp || undefined,
      },
    };
  } catch {
    return null;
  }
}

function EditTemplateModal({ template, appId, instrumentType, open, onOpenChange }: {
  template: DiscordPreviewMsg;
  appId: string;
  instrumentType: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [jsonText, setJsonText] = useState(() => buildPayloadJson(template));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(buildPayloadJson(template));
    setJsonError(null);
  }, [template]);

  const livePreview = useMemo(() => parseJsonToPreview(jsonText, template), [jsonText, template]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      if (!parsed.embeds?.[0]) {
        setJsonError("Missing embeds[0]");
      } else {
        setJsonError(null);
      }
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(jsonText);
      const embed = parsed.embeds?.[0];
      if (!embed) throw new Error("Missing embed");
      await apiRequest("PUT", `/api/discord-templates/app/${appId}`, {
        instrumentType,
        messageType: template.type,
        label: template.label,
        content: parsed.content || "",
        embedJson: {
          description: embed.description,
          color: embed.color,
          fields: embed.fields,
          footer: embed.footer,
          timestamp: embed.timestamp,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discord-templates/app", appId] });
      toast({ title: "Template saved", description: `${template.label} template updated` });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const displayPreview = livePreview || template;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="modal-edit-template">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Edit: {template.label}
          </DialogTitle>
          <DialogDescription>Customize the embed JSON for this template</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Embed JSON</p>
              <button
                onClick={() => { setJsonText(buildPayloadJson(template)); setJsonError(null); }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-reset-template-json"
              >
                Reset
              </button>
            </div>
            <textarea
              value={jsonText}
              onChange={e => handleJsonChange(e.target.value)}
              spellCheck={false}
              className={`w-full rounded-lg border bg-muted/50 p-3 text-[11px] font-mono leading-relaxed resize-none min-h-[45vh] max-h-[55vh] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                jsonError ? "border-red-500/50" : "border-border"
              }`}
              data-testid="textarea-template-json"
            />
            {jsonError && (
              <p className="text-[11px] text-red-500" data-testid="text-template-json-error">{jsonError}</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
            <div className="rounded-lg bg-[#313338] p-3 space-y-2">
              {displayPreview.content && (
                <p className="text-[13px] text-[#dbdee1]">{displayPreview.content}</p>
              )}
              <DiscordEmbed msg={displayPreview} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !!jsonError}
            data-testid="button-save-template"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendFromTemplateModal({ template, open, onOpenChange }: {
  template: DiscordPreviewMsg;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [jsonText, setJsonText] = useState(() => buildPayloadJson(template));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(buildPayloadJson(template));
    setJsonError(null);
    setSelectedChannelId("");
  }, [template]);

  const livePreview = useMemo(() => parseJsonToPreview(jsonText, template), [jsonText, template]);
  const isEdited = jsonText !== buildPayloadJson(template);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      if (!parsed.embeds?.[0]) {
        setJsonError("Missing embeds[0]");
      } else {
        setJsonError(null);
      }
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  const channelsQuery = useQuery<DiscordChannel[]>({
    queryKey: ["/api/discord/channels"],
  });

  const channels = channelsQuery.data || [];

  const handleChannelChange = (value: string) => {
    if (value === "__add_new__") {
      setAddChannelOpen(true);
      return;
    }
    setSelectedChannelId(value);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChannelId) throw new Error("Select a Discord channel first");
      const body = {
        channelId: selectedChannelId,
        payload: JSON.parse(jsonText),
      };
      const res = await apiRequest("POST", "/api/discord/send-manual", body);
      const result = await res.json();
      if (result.sent === false) {
        throw new Error(result.error || "Discord webhook delivery failed");
      }
      return result;
    },
    onSuccess: () => {
      toast({ title: "Sent", description: `Discord ${template.label} message sent` });
      queryClient.invalidateQueries({ queryKey: ["/api/discord-messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Failed to send", variant: "destructive" });
    },
  });

  const displayPreview = livePreview || template;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="modal-send-template">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SiDiscord className="h-4 w-4 text-[#5865F2]" />
            Send: {template.label}
          </DialogTitle>
          <DialogDescription>Select a Discord channel, edit the embed, then send</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Discord Channel</p>
            <Select value={selectedChannelId} onValueChange={handleChannelChange}>
              <SelectTrigger data-testid="select-discord-channel">
                <SelectValue placeholder="Select a Discord channel to send to..." />
              </SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id} data-testid={`option-channel-${ch.id}`}>
                    <span className="flex items-center gap-1.5">
                      <SiDiscord className="h-3 w-3 text-[#5865F2] shrink-0" />
                      {ch.name} — #{ch.channelName}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="__add_new__" data-testid="option-add-new-channel">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Plus className="h-3 w-3 shrink-0" />
                    Add new Discord channel...
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {channels.length === 0 && !channelsQuery.isLoading && (
              <p className="text-[11px] text-muted-foreground">No Discord channels configured. Select "Add new Discord channel" above to create one.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Embed JSON</p>
                {isEdited && (
                  <button
                    onClick={() => { setJsonText(buildPayloadJson(template)); setJsonError(null); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-reset-template-json"
                  >
                    Reset
                  </button>
                )}
              </div>
              <textarea
                value={jsonText}
                onChange={e => handleJsonChange(e.target.value)}
                spellCheck={false}
                className={`w-full rounded-lg border bg-muted/50 p-3 text-[11px] font-mono leading-relaxed resize-none min-h-[45vh] max-h-[55vh] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  jsonError ? "border-red-500/50" : "border-border"
                }`}
                data-testid="textarea-template-json"
              />
              {jsonError && (
                <p className="text-[11px] text-red-500" data-testid="text-template-json-error">{jsonError}</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
              <div className="rounded-lg bg-[#313338] p-3 space-y-2">
                {displayPreview.content && (
                  <p className="text-[13px] text-[#dbdee1]">{displayPreview.content}</p>
                )}
                <DiscordEmbed msg={displayPreview} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-template-send">
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !!jsonError || !selectedChannelId}
            className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
            data-testid="button-confirm-template-send"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Send to Discord
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AddDiscordChannelDialog
      open={addChannelOpen}
      onOpenChange={setAddChannelOpen}
      onCreated={(channelId) => setSelectedChannelId(channelId)}
    />
    </>
  );
}

export default function DiscordTemplatesPage() {
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<string>("__default__");
  const [activeInstrument, setActiveInstrument] = useState<string>("Options");
  const [sendModal, setSendModal] = useState<{ open: boolean; template: DiscordPreviewMsg | null }>({ open: false, template: null });
  const [editModal, setEditModal] = useState<{ open: boolean; template: DiscordPreviewMsg | null; instrumentType: string }>({ open: false, template: null, instrumentType: "" });
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const { data: connectedApps = [] } = useQuery<ConnectedApp[]>({
    queryKey: ["/api/connected-apps"],
  });

  const activeApps = connectedApps.filter(a => a.sendDiscordMessages);

  const defaultTemplatesQuery = useQuery<TemplateGroup[]>({
    queryKey: ["/api/discord-templates"],
    enabled: selectedAppId === "__default__",
  });

  const appTemplatesQuery = useQuery<TemplateGroup[]>({
    queryKey: ["/api/discord-templates/app", selectedAppId],
    enabled: selectedAppId !== "__default__",
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/discord-templates/app/${selectedAppId}?instrumentType=${encodeURIComponent(activeInstrument)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discord-templates/app", selectedAppId] });
      toast({ title: "Reset to defaults", description: `${activeInstrument} templates reset for this app` });
    },
    onError: (err: Error) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  const isDefault = selectedAppId === "__default__";
  const templatesData = isDefault ? defaultTemplatesQuery.data : appTemplatesQuery.data;
  const isLoading = isDefault ? defaultTemplatesQuery.isLoading : appTemplatesQuery.isLoading;
  const isError = isDefault ? defaultTemplatesQuery.isError : appTemplatesQuery.isError;
  const error = isDefault ? defaultTemplatesQuery.error : appTemplatesQuery.error;
  const refetch = isDefault ? defaultTemplatesQuery.refetch : appTemplatesQuery.refetch;

  const activeGroup = useMemo(() => {
    if (!templatesData) return null;
    return templatesData.find(g => g.instrumentType === activeInstrument) || null;
  }, [templatesData, activeInstrument]);

  const hasCustomTemplates = activeGroup?.templates.some(t => t.isCustom) ?? false;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center space-y-2" data-testid="error-templates">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-medium text-red-500">Failed to load templates</p>
          <p className="text-xs text-muted-foreground">{(error as Error)?.message || "Unknown error"}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-templates">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const groups = templatesData || [];
  const selectedApp = connectedApps.find(a => a.id === selectedAppId);

  return (
    <div className="p-6 space-y-6" data-testid="page-discord-templates">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <SiDiscord className="h-6 w-6 text-[#5865F2]" />
            Discord Message Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isDefault
              ? "Default templates used when an app has no custom overrides."
              : `Custom templates for ${selectedApp?.name || "this app"}. Edit to customize Discord messages.`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAppId} onValueChange={(v) => { setSelectedAppId(v); setExpandedTemplate(null); }}>
            <SelectTrigger className="w-[220px] h-9 text-sm" data-testid="select-app-templates">
              <SelectValue placeholder="Select App" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__" data-testid="option-default-templates">
                Default Templates
              </SelectItem>
              {activeApps.map(app => (
                <SelectItem key={app.id} value={app.id} data-testid={`option-app-${app.id}`}>
                  {app.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2" data-testid="tabs-instrument-type">
          {groups.map((g) => (
            <Button
              key={g.instrumentType}
              variant={activeInstrument === g.instrumentType ? "default" : "outline"}
              size="sm"
              onClick={() => { setActiveInstrument(g.instrumentType); setExpandedTemplate(null); }}
              data-testid={`tab-instrument-${g.instrumentType.toLowerCase()}`}
            >
              {g.instrumentType}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {g.templates.length}
              </Badge>
            </Button>
          ))}
        </div>
        {!isDefault && hasCustomTemplates && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="text-xs"
            data-testid="button-reset-all-templates"
          >
            {resetMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3 mr-1.5" />
            )}
            Reset to Defaults
          </Button>
        )}
      </div>

      {activeGroup && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Showing templates for <span className="font-medium text-foreground">{activeGroup.instrumentType}</span> using sample ticker <span className="font-mono font-medium text-foreground">{activeGroup.ticker}</span>
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeGroup.templates.map((template, idx) => {
              const Icon = TYPE_ICONS[template.type] || MessageSquare;
              const colorClass = TYPE_COLORS[template.type] || "bg-muted text-muted-foreground border-border";
              const isExpanded = expandedTemplate === `${activeGroup.instrumentType}-${idx}`;
              const templateKey = `${activeGroup.instrumentType}-${idx}`;

              return (
                <div
                  key={templateKey}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                  data-testid={`card-template-${template.type}-${idx}`}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md border ${colorClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold" data-testid={`text-template-label-${idx}`}>{template.label}</p>
                            {template.isCustom && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-500">
                                <Check className="h-2.5 w-2.5 mr-0.5" />
                                Custom
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{template.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setExpandedTemplate(isExpanded ? null : templateKey)}
                          data-testid={`button-toggle-preview-${idx}`}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          {isExpanded ? "Hide" : "Preview"}
                        </Button>
                        {!isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditModal({ open: true, template, instrumentType: activeGroup.instrumentType })}
                            data-testid={`button-edit-template-${idx}`}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[#5865F2] hover:bg-[#4752C4] text-white"
                          onClick={() => setSendModal({ open: true, template })}
                          data-testid={`button-send-template-${idx}`}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Send
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {template.content && (
                        <Badge variant="outline" className="text-[10px]">
                          content: {template.content}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        color: {colorToHex(template.embed.color)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {(template.embed.fields || []).filter(f => f.name !== "\u200b").length} fields
                      </Badge>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-[#313338] p-4 space-y-2">
                      {template.content && (
                        <p className="text-[13px] text-[#dbdee1]">{template.content}</p>
                      )}
                      <DiscordEmbed msg={template} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sendModal.template && (
        <SendFromTemplateModal
          template={sendModal.template}
          open={sendModal.open}
          onOpenChange={(open) => setSendModal(prev => ({ ...prev, open }))}
        />
      )}

      {editModal.template && !isDefault && (
        <EditTemplateModal
          template={editModal.template}
          appId={selectedAppId}
          instrumentType={editModal.instrumentType}
          open={editModal.open}
          onOpenChange={(open) => setEditModal(prev => ({ ...prev, open }))}
        />
      )}
    </div>
  );
}
