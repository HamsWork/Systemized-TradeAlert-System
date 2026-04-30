import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type InsertIntegration, type ConnectedApp } from "@shared/schema";
import {
  VARIABLE_CATEGORIES,
  getVariablesForMessageType,
} from "@shared/discord-template-vars";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
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
  Copy,
  Info,
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

interface TemplateEmbed {
  description?: string;
  color: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  timestamp?: boolean;
  image?: { url: string };
  thumbnail?: { url: string };
}

interface RenderedEmbed {
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  image?: { url: string };
  thumbnail?: { url: string };
}

interface TemplateMsg {
  type: string;
  label: string;
  content: string;
  template: TemplateEmbed;
  sampleVars: Record<string, string>;
  preview: {
    content: string;
    embed: RenderedEmbed;
  };
  isCustom?: boolean;
}

interface TemplateGroup {
  instrumentType: string;
  ticker: string;
  templates: TemplateMsg[];
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

function cleanPreviewLabel(label: string): string {
  return label.replace(/\s*\(Discord\s*Embed\)\s*$/i, "");
}

const TYPE_ICONS: Record<string, typeof TrendingUp> = {
  signal_alert: TrendingUp,
  target_hit: Target,
  stop_loss_raised: ShieldAlert,
  stop_loss_hit: AlertTriangle,
  ten_pct_entry: TrendingUp,
  ten_pct_milestone: Target,
  current_status: Eye,
  end_trade: AlertCircle,
};

const TYPE_COLORS: Record<string, string> = {
  signal_alert: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  target_hit: "bg-green-500/10 text-green-500 border-green-500/20",
  stop_loss_raised: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  stop_loss_hit: "bg-red-500/10 text-red-500 border-red-500/20",
  ten_pct_entry: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  ten_pct_milestone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  current_status: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  end_trade: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
};

function isSpacerField(f: { name: string; value: string; inline?: boolean }): boolean {
  const n = f.name.trim();
  const v = f.value.trim();
  return (n === "\u200b" || n === "") && (v === "" || v === "\u200b") && !f.inline;
}

const CUSTOM_EMOJI_MAP: Record<string, { src: string; alt: string }> = {
  "swj_boom_emoji": { src: "https://cdn.discordapp.com/emojis/1485922107639726119.webp?size=60&animated=true", alt: "Boom" },
  "swj_kaboom_emoji": { src: "https://cdn.discordapp.com/emojis/1485921838675787806.webp?size=60&animated=true", alt: "Kaboom" },
};

function renderDiscordText(text: string) {
  const parts = text.split(/<a?:(\w+):\d+>|:(\w+):/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part === undefined) return null;
    if (i % 3 === 1 || i % 3 === 2) {
      if (!part) return null;
      const emoji = CUSTOM_EMOJI_MAP[part];
      if (emoji) {
        return (
          <img key={i} src={emoji.src} alt={emoji.alt} className="inline-block h-5 w-5 align-middle mx-0.5" />
        );
      }
      return <span key={i}>:{part}:</span>;
    }
    return part;
  });
}

function DiscordEmbed({ embed }: { embed: RenderedEmbed }) {
  const borderColor = colorToHex(embed.color);
  const allFields = embed.fields || [];

  const sections: { type: "spacer" | "inline" | "block"; fields: typeof allFields }[] = [];
  let currentInline: typeof allFields = [];

  const flushInline = () => {
    if (currentInline.length > 0) {
      sections.push({ type: "inline", fields: [...currentInline] });
      currentInline = [];
    }
  };

  for (const f of allFields) {
    if (isSpacerField(f)) {
      flushInline();
      sections.push({ type: "spacer", fields: [] });
    } else if (f.inline) {
      currentInline.push(f);
    } else {
      flushInline();
      sections.push({ type: "block", fields: [f] });
    }
  }
  flushInline();

  return (
    <div className="rounded-md overflow-hidden bg-[#2b2d31]">
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: borderColor }} />
        <div className="p-3 flex-1 min-w-0 space-y-2">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-2">
          {embed.description && (
            <p className="text-[13px] text-[#dbdee1] font-medium leading-snug">
              {embed.description.split(/\*\*(.*?)\*\*/).map((part, i) =>
                i % 2 === 1 ? <strong key={i}>{part}</strong> : part
              )}
            </p>
          )}

          {sections.map((section, si) => {
            if (section.type === "spacer") {
              return <div key={si} className="h-1" />;
            }
            if (section.type === "inline") {
              return (
                <div key={si} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {section.fields.map((field, fi) => (
                    <div key={fi} className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#b5bac1] uppercase tracking-wide">{renderDiscordText(field.name)}</p>
                      <p className="text-[12px] text-[#dbdee1] whitespace-pre-wrap break-words">{field.value ? renderDiscordText(field.value) : "\u200b"}</p>
                    </div>
                  ))}
                </div>
              );
            }
            const field = section.fields[0];
            return (
              <div key={si}>
                <p className="text-[11px] font-semibold text-[#b5bac1] uppercase tracking-wide">{renderDiscordText(field.name)}</p>
                <p className="text-[12px] text-[#dbdee1] whitespace-pre-wrap break-words leading-relaxed">{field.value ? renderDiscordText(field.value) : "\u200b"}</p>
              </div>
            );
          })}

            </div>
            {embed.thumbnail?.url && (
              <img src={embed.thumbnail.url} alt="" className="w-16 h-16 rounded object-cover shrink-0" />
            )}
          </div>

          {embed.image?.url && (
            <img src={embed.image.url} alt="" className="w-full max-h-48 rounded object-contain" />
          )}

          {embed.footer && (
            <p className="text-[10px] text-[#949ba4] pt-1 border-t border-[#3f4147]">{embed.footer.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function VariableTag({ varKey, onInsert }: { varKey: string; onInsert?: (v: string) => void }) {
  const { toast } = useToast();
  const tag = `{{${varKey}}}`;

  const handleClick = () => {
    if (onInsert) {
      onInsert(tag);
    } else {
      navigator.clipboard.writeText(tag).then(() => {
        toast({ title: "Copied", description: tag });
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
      data-testid={`var-tag-${varKey}`}
    >
      <Copy className="h-2.5 w-2.5" />
      {tag}
    </button>
  );
}

function VariablesPanel({ messageType, sampleVars }: { messageType: string; sampleVars: Record<string, string> }) {
  const vars = getVariablesForMessageType(messageType);
  const grouped = useMemo(() => {
    const map: Record<string, typeof vars> = {};
    for (const v of vars) {
      if (!map[v.category]) map[v.category] = [];
      map[v.category].push(v);
    }
    return map;
  }, [vars]);

  return (
    <div className="space-y-3" data-testid="panel-template-variables">
      <div className="flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Insert Variables</p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Click a variable to copy it. Paste into any field in the embed JSON.
      </p>
      {Object.entries(grouped).map(([cat, catVars]) => (
        <div key={cat} className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {VARIABLE_CATEGORIES[cat] || cat}
          </p>
          <div className="space-y-0.5">
            {catVars.map(v => {
              const defaultVal = sampleVars[v.key];
              return (
                <div key={v.key} className="flex items-start gap-1.5 group">
                  <VariableTag varKey={v.key} />
                  {defaultVal && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono truncate pt-0.5 max-w-[100px]" title={defaultVal} data-testid={`var-default-${v.key}`}>
                      {defaultVal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function buildTemplateJson(template: TemplateEmbed): string {
  const raw = JSON.stringify(template, null, 2);
  return raw
    .replace(/\u200b/g, "\\u200b")
    .replace(/\\\\u200b/g, "\\u200b");
}

function parseTemplateJson(json: string): TemplateEmbed | null {
  try {
    const normalized = json.replace(/\\u200b/gi, "\u200b");
    const parsed = JSON.parse(normalized);
    if (!parsed.color) return null;
    return parsed as TemplateEmbed;
  } catch {
    return null;
  }
}

function renderTemplateLocally(template: TemplateEmbed, sampleVars: Record<string, string>): RenderedEmbed {
  const sub = (s: string): string => {
    return s.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] ?? `{{${key}}}`);
  };

  const colorHex = sub(template.color);
  let colorNum: number;
  if (colorHex.startsWith("#")) {
    colorNum = parseInt(colorHex.slice(1), 16);
  } else {
    colorNum = parseInt(colorHex, 16) || 0x6b7280;
  }

  const resolvedImage = template.image?.url ? sub(template.image.url) : undefined;
  const resolvedThumbnail = template.thumbnail?.url ? sub(template.thumbnail.url) : undefined;

  return {
    description: template.description ? sub(template.description) : undefined,
    color: colorNum,
    fields: template.fields?.map(f => ({
      name: sub(f.name),
      value: sub(f.value),
      inline: f.inline,
    })),
    footer: template.footer ? { text: sub(template.footer) } : undefined,
    timestamp: template.timestamp ? new Date().toISOString() : undefined,
    image: resolvedImage && !resolvedImage.includes("{{") ? { url: resolvedImage } : undefined,
    thumbnail: resolvedThumbnail && !resolvedThumbnail.includes("{{") ? { url: resolvedThumbnail } : undefined,
  };
}

function EditTemplateModal({ template, appId, instrumentType, open, onOpenChange }: {
  template: TemplateMsg;
  appId: string;
  instrumentType: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sampleVars = template.sampleVars || {};
  const { toast } = useToast();
  const [jsonText, setJsonText] = useState(() => buildTemplateJson(template.template));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(buildTemplateJson(template.template));
    setJsonError(null);
  }, [template]);

  const livePreview = useMemo(() => {
    const parsed = parseTemplateJson(jsonText);
    if (!parsed) return template.preview.embed;
    return renderTemplateLocally(parsed, sampleVars);
  }, [jsonText, sampleVars, template]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      if (!parsed.color) {
        setJsonError("Missing 'color' field");
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
      if (!parsed.color) throw new Error("Missing color field");
      await apiRequest("PUT", `/api/discord-templates/app/${appId}`, {
        instrumentType,
        messageType: template.type,
        label: template.label,
        content: template.content,
        embedJson: parsed,
      });
    },
    onSuccess: () => {
      if (appId === "__default__") {
        queryClient.invalidateQueries({ queryKey: ["/api/discord-templates/var-templates"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/discord-templates/app", appId] });
      }
      toast({ title: "Template saved", description: `${template.label} template updated` });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" data-testid="modal-edit-template">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Edit: {template.label}
          </DialogTitle>
          <DialogDescription>
            Use {"{{variable}}"} placeholders in the embed template. They'll be replaced with real signal data when sent.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_240px] gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Embed Template (JSON)</p>
                <button
                  onClick={() => { setJsonText(buildTemplateJson(template.template)); setJsonError(null); }}
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
                className={`w-full rounded-lg border bg-muted/50 p-3 text-[11px] font-mono leading-relaxed resize-none min-h-[50vh] max-h-[60vh] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  jsonError ? "border-red-500/50" : "border-border"
                }`}
                data-testid="textarea-template-json"
              />
              {jsonError && (
                <p className="text-[11px] text-red-500" data-testid="text-template-json-error">{jsonError}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Preview (with sample data)</p>
            <div className="rounded-lg bg-[#313338] p-3 space-y-2">
              {template.content && (
                <p className="text-[13px] text-[#dbdee1]">{template.content}</p>
              )}
              <DiscordEmbed embed={livePreview} />
            </div>
          </div>

          <div className="lg:border-l lg:pl-4 border-border">
            <VariablesPanel messageType={template.type} sampleVars={sampleVars} />
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
  template: TemplateMsg;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [addChannelOpen, setAddChannelOpen] = useState(false);

  const renderedEmbed = template.preview.embed;
  const payloadJson = useMemo(() => {
    const raw = JSON.stringify({
      content: template.content || undefined,
      embeds: [{
        description: renderedEmbed.description,
        color: renderedEmbed.color,
        fields: renderedEmbed.fields,
        footer: renderedEmbed.footer,
        ...(renderedEmbed.timestamp ? { timestamp: renderedEmbed.timestamp } : {}),
      }],
    }, null, 2);
    return raw
      .replace(/\u200b/g, "\\u200b")
      .replace(/\\\\u200b/g, "\\u200b");
  }, [template, renderedEmbed]);

  const [jsonText, setJsonText] = useState(payloadJson);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(payloadJson);
    setJsonError(null);
    setSelectedChannelId("");
  }, [payloadJson]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const normalized = value.replace(/\\u200b/gi, "\u200b");
      const parsed = JSON.parse(normalized);
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
      const normalized = jsonText.replace(/\\u200b/gi, "\u200b");
      const body = {
        channelId: selectedChannelId,
        payload: JSON.parse(normalized),
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

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="modal-send-template">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SiDiscord className="h-4 w-4 text-[#5865F2]" />
            Send: {cleanPreviewLabel(template.label)}
          </DialogTitle>
          <DialogDescription>Select a Discord channel, review the rendered payload, then send</DialogDescription>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rendered Payload</p>
              <textarea
                value={jsonText}
                onChange={e => handleJsonChange(e.target.value)}
                spellCheck={false}
                className={`w-full rounded-lg border bg-muted/50 p-3 text-[11px] font-mono leading-relaxed resize-none min-h-[45vh] max-h-[55vh] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  jsonError ? "border-red-500/50" : "border-border"
                }`}
                data-testid="textarea-send-json"
              />
              {jsonError && (
                <p className="text-[11px] text-red-500">{jsonError}</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
              <div className="rounded-lg bg-[#313338] p-3 space-y-2">
                {template.content && (
                  <p className="text-[13px] text-[#dbdee1]">{template.content}</p>
                )}
                <DiscordEmbed embed={renderedEmbed} />
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
  const [sendModal, setSendModal] = useState<{ open: boolean; template: TemplateMsg | null }>({ open: false, template: null });
  const [editModal, setEditModal] = useState<{ open: boolean; template: TemplateMsg | null; instrumentType: string }>({ open: false, template: null, instrumentType: "" });
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const { data: connectedApps = [] } = useQuery<ConnectedApp[]>({
    queryKey: ["/api/connected-apps"],
  });

  const activeApps = connectedApps.filter(a => a.sendDiscordMessages);

  const defaultTemplatesQuery = useQuery<TemplateGroup[]>({
    queryKey: ["/api/discord-templates/app", "__default__"],
    enabled: selectedAppId === "__default__",
  });

  const appTemplatesQuery = useQuery<TemplateGroup[]>({
    queryKey: ["/api/discord-templates/app", selectedAppId],
    enabled: selectedAppId !== "__default__",
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const resetAppId = isDefault ? "__default__" : selectedAppId;
      await apiRequest("DELETE", `/api/discord-templates/app/${resetAppId}?instrumentType=${encodeURIComponent(activeInstrument)}`);
    },
    onSuccess: () => {
      if (isDefault) {
        queryClient.invalidateQueries({ queryKey: ["/api/discord-templates/var-templates"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/discord-templates/app", selectedAppId] });
      }
      toast({ title: "Reset to defaults", description: `${activeInstrument} templates reset${isDefault ? "" : " for this app"}` });
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
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 sm:p-6 text-center space-y-2" data-testid="error-templates">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-medium text-red-500">No template found, contact to admin</p>
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="page-discord-templates">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <SiDiscord className="h-6 w-6 text-[#5865F2]" />
            Discord Message Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isDefault
              ? "Default templates with {{variable}} placeholders. Select an app to customize."
              : `Custom templates for ${selectedApp?.name || "this app"}. Edit to customize Discord messages.`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAppId} onValueChange={(v) => { setSelectedAppId(v); setExpandedTemplate(null); }}>
            <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm" data-testid="select-app-templates">
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
              data-testid={`tab-instrument-${g.instrumentType.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {g.instrumentType}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {g.templates.length}
              </Badge>
            </Button>
          ))}
        </div>
        {hasCustomTemplates && (
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
              const renderedEmbed = template.preview.embed;
              const hasVars = JSON.stringify(template.template).includes("{{");

              return (
                <div
                  key={templateKey}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                  data-testid={`card-template-${template.type}-${idx}`}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1.5 rounded-md border shrink-0 ${colorClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold truncate" data-testid={`text-template-label-${idx}`}>{cleanPreviewLabel(template.label)}</p>
                            {template.isCustom && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-500 shrink-0">
                                <Check className="h-2.5 w-2.5 mr-0.5" />
                                Custom
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{template.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpandedTemplate(isExpanded ? null : templateKey)}
                          data-testid={`button-toggle-preview-${idx}`}
                          title={isExpanded ? "Hide Preview" : "Preview"}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setEditModal({ open: true, template, instrumentType: activeGroup.instrumentType })}
                          data-testid={`button-edit-template-${idx}`}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="icon"
                          className="h-7 w-7 bg-[#5865F2] hover:bg-[#4752C4] text-white"
                          onClick={() => setSendModal({ open: true, template })}
                          data-testid={`button-send-template-${idx}`}
                          title="Send to Discord"
                        >
                          <Send className="h-3.5 w-3.5" />
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
                        color: {template.template.color}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {(template.template.fields || []).filter(f => f.name !== "\u200b").length} fields
                      </Badge>
                      {hasVars && (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/5 text-blue-400 border-blue-500/20">
                          {"{{variables}}"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-[#313338] p-4 space-y-2">
                      {template.content && (
                        <p className="text-[13px] text-[#dbdee1]">{template.content}</p>
                      )}
                      <DiscordEmbed embed={renderedEmbed} />
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

      {editModal.template && (
        <EditTemplateModal
          template={editModal.template}
          appId={isDefault ? "__default__" : selectedAppId}
          instrumentType={editModal.instrumentType}
          open={editModal.open}
          onOpenChange={(open) => setEditModal(prev => ({ ...prev, open }))}
        />
      )}
    </div>
  );
}
