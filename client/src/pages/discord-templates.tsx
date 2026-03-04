import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { SiDiscord } from "react-icons/si";

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

function SendFromTemplateModal({ template, open, onOpenChange }: {
  template: DiscordPreviewMsg;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
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
      onOpenChange(false);
      setLocation("/integrations");
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
              <p className="text-[11px] text-muted-foreground">No Discord channels configured. Add one via Integrations.</p>
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
  );
}

export default function DiscordTemplatesPage() {
  const [activeInstrument, setActiveInstrument] = useState<string>("Options");
  const [sendModal, setSendModal] = useState<{ open: boolean; template: DiscordPreviewMsg | null }>({ open: false, template: null });
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const templatesQuery = useQuery<TemplateGroup[]>({
    queryKey: ["/api/discord-templates"],
  });

  const activeGroup = useMemo(() => {
    if (!templatesQuery.data) return null;
    return templatesQuery.data.find(g => g.instrumentType === activeInstrument) || null;
  }, [templatesQuery.data, activeInstrument]);

  if (templatesQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (templatesQuery.isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center space-y-2" data-testid="error-templates">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-medium text-red-500">Failed to load templates</p>
          <p className="text-xs text-muted-foreground">{(templatesQuery.error as Error)?.message || "Unknown error"}</p>
          <Button variant="outline" size="sm" onClick={() => templatesQuery.refetch()} data-testid="button-retry-templates">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const groups = templatesQuery.data || [];

  return (
    <div className="p-6 space-y-6" data-testid="page-discord-templates">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <SiDiscord className="h-6 w-6 text-[#5865F2]" />
            Discord Message Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All available Discord message templates by instrument type. Click any template to send it manually.
          </p>
        </div>
      </div>

      <div className="flex gap-2" data-testid="tabs-instrument-type">
        {groups.map((g) => (
          <Button
            key={g.instrumentType}
            variant={activeInstrument === g.instrumentType ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveInstrument(g.instrumentType)}
            data-testid={`tab-instrument-${g.instrumentType.toLowerCase()}`}
          >
            {g.instrumentType}
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
              {g.templates.length}
            </Badge>
          </Button>
        ))}
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
                          <p className="text-sm font-semibold" data-testid={`text-template-label-${idx}`}>{template.label}</p>
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
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[#5865F2] hover:bg-[#4752C4] text-white"
                          onClick={() => setSendModal({ open: true, template })}
                          data-testid={`button-send-template-${idx}`}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Send Manual
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
    </div>
  );
}
