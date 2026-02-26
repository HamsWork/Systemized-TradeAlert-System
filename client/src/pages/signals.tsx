import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  TrendingUp,
  Plus,
  Trash2,
  Puzzle,
  CircleDot,
  OctagonX,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Braces,
  ShieldAlert,
  Crosshair,
  TrendingDown,
  Clock,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { type Signal, type SignalType, type InsertSignal } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SignalDetailDialog } from "@/pages/signal-detail";

function renderTemplatePreview(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function CreateSignalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [ticker, setTicker] = useState("");
  const [instrumentType, setInstrumentType] = useState("");
  const [direction, setDirection] = useState("");
  const [expiration, setExpiration] = useState("");
  const [strike, setStrike] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [tp3, setTp3] = useState("");
  const [sl1, setSl1] = useState("");
  const [sl2, setSl2] = useState("");
  const [sl3, setSl3] = useState("");
  const [raiseMethod, setRaiseMethod] = useState("");
  const [raiseValue, setRaiseValue] = useState("");
  const [notes, setNotes] = useState("");

  const typesQuery = useQuery<SignalType[]>({ queryKey: ["/api/signal-types"] });
  const signalTypes = typesQuery.data ?? [];
  const selectedType = signalTypes.find(t => t.id === selectedTypeId);

  const resetForm = () => {
    setTicker(""); setInstrumentType(""); setDirection("");
    setExpiration(""); setStrike(""); setEntryPrice("");
    setTp1(""); setTp2(""); setTp3("");
    setSl1(""); setSl2(""); setSl3("");
    setRaiseMethod(""); setRaiseValue(""); setNotes("");
  };

  const createMutation = useMutation({
    mutationFn: async (payload: InsertSignal) => {
      const res = await apiRequest("POST", "/api/signals", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Signal created" });
      resetForm();
      setSelectedTypeId("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedTypeId || !ticker || !instrumentType || !direction) return;

    const data: Record<string, any> = {
      ticker,
      instrument_type: instrumentType,
      direction,
      entry_price: entryPrice || null,
    };

    if (instrumentType === "Options") {
      data.expiration = expiration || null;
      data.strike = strike || null;
    }

    if (sl1) data.stop_loss_1 = sl1;
    if (sl2) data.stop_loss_2 = sl2;
    if (sl3) data.stop_loss_3 = sl3;
    if (tp1) data.take_profit_1 = tp1;
    if (tp2) data.take_profit_2 = tp2;
    if (tp3) data.take_profit_3 = tp3;
    if (raiseMethod && raiseMethod !== "None") {
      data.raise_stop_method = raiseMethod;
      if (raiseValue) data.raise_stop_value = raiseValue;
    }
    if (notes) data.trade_plan = notes;

    createMutation.mutate({
      signalTypeId: selectedTypeId,
      data,
      status: "active",
    });
  };

  const showRaiseValue = ["Trail by %", "Trail by $", "Custom"].includes(raiseMethod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-create-signal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Create Signal
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Signal Type</Label>
            <Select value={selectedTypeId} onValueChange={(val) => { setSelectedTypeId(val); resetForm(); }} data-testid="select-signal-type-dropdown">
              <SelectTrigger data-testid="select-signal-type">
                <SelectValue placeholder="Select signal type..." />
              </SelectTrigger>
              <SelectContent>
                {signalTypes.map(st => (
                  <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType && (
            <>
              <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: selectedType.color + "12", borderLeft: `3px solid ${selectedType.color}` }}>
                <span className="font-semibold text-sm" style={{ color: selectedType.color }}>{selectedType.name}</span>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-sm font-medium mb-1.5 block">Ticker <span className="text-red-500">*</span></Label>
                  <Input
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    className="font-mono"
                    data-testid="input-signal-ticker"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-sm font-medium mb-1.5 block">Instrument Type <span className="text-red-500">*</span></Label>
                  <Select value={instrumentType} onValueChange={(v) => { setInstrumentType(v); setExpiration(""); setStrike(""); }}>
                    <SelectTrigger data-testid="select-signal-instrumentType">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Options">Options</SelectItem>
                      <SelectItem value="Shares">Shares</SelectItem>
                      <SelectItem value="LETF">Leveraged ETF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Direction <span className="text-red-500">*</span></Label>
                  <Select value={direction} onValueChange={setDirection}>
                    <SelectTrigger data-testid="select-signal-direction">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Long">Long</SelectItem>
                      <SelectItem value="Short">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Entry Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="0.00"
                    className="font-mono"
                    data-testid="input-signal-entryPrice"
                  />
                </div>
              </div>

              {instrumentType === "Options" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Expiration <span className="text-red-500">*</span></Label>
                    <Input
                      type="date"
                      value={expiration}
                      onChange={(e) => setExpiration(e.target.value)}
                      data-testid="input-signal-expiration"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Strike <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={strike}
                      onChange={(e) => setStrike(e.target.value)}
                      placeholder="0.00"
                      className="font-mono"
                      data-testid="input-signal-strike"
                    />
                  </div>
                </div>
              )}

              <Separator />

              <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/30 bg-zinc-800/20">
                  <Braces className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-sm font-semibold">Trade Plan</span>
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                      <Crosshair className="h-3 w-3" />
                      Target Levels
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" step="0.01" value={tp1} onChange={(e) => setTp1(e.target.value)} placeholder="TP1" className="font-mono text-sm h-8" data-testid="input-signal-tp1" />
                      <Input type="number" step="0.01" value={tp2} onChange={(e) => setTp2(e.target.value)} placeholder="TP2" className="font-mono text-sm h-8" data-testid="input-signal-tp2" />
                      <Input type="number" step="0.01" value={tp3} onChange={(e) => setTp3(e.target.value)} placeholder="TP3" className="font-mono text-sm h-8" data-testid="input-signal-tp3" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                      <ShieldAlert className="h-3 w-3" />
                      Stop Loss Levels
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" step="0.01" value={sl1} onChange={(e) => setSl1(e.target.value)} placeholder="SL1" className="font-mono text-sm h-8" data-testid="input-signal-sl1" />
                      <Input type="number" step="0.01" value={sl2} onChange={(e) => setSl2(e.target.value)} placeholder="SL2" className="font-mono text-sm h-8" data-testid="input-signal-sl2" />
                      <Input type="number" step="0.01" value={sl3} onChange={(e) => setSl3(e.target.value)} placeholder="SL3" className="font-mono text-sm h-8" data-testid="input-signal-sl3" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />
                      Raise Stop Level
                    </Label>
                    <div className={`grid ${showRaiseValue ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                      <Select value={raiseMethod} onValueChange={setRaiseMethod}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-signal-raiseMethod">
                          <SelectValue placeholder="Method..." />
                        </SelectTrigger>
                        <SelectContent>
                          {["None", "Trail by %", "Trail by $", "Move to Entry at TP1", "Move to TP1 at TP2", "Custom"].map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showRaiseValue && (
                        <Input value={raiseValue} onChange={(e) => setRaiseValue(e.target.value)} placeholder="Value" className="font-mono text-sm h-8" data-testid="input-signal-raiseValue" />
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />
                      Notes
                    </Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Trade thesis, plan details..."
                      className="resize-none text-sm min-h-[60px]"
                      data-testid="input-signal-notes"
                    />
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!selectedTypeId || !ticker || !instrumentType || !direction || createMutation.isPending}
                onClick={handleSubmit}
                data-testid="button-create-signal"
              >
                {createMutation.isPending ? "Creating..." : "Create Signal"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getSignalIcon(typeName: string) {
  if (typeName.toLowerCase().includes("stop loss")) return <OctagonX className="h-4 w-4 text-red-500" />;
  if (typeName.toLowerCase().includes("take profit")) return <Target className="h-4 w-4 text-blue-500" />;
  return <CircleDot className="h-4 w-4 text-emerald-500" />;
}

function getDirectionBadge(direction: string | undefined) {
  if (!direction) return null;
  const isLong = direction.toLowerCase() === "long";
  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 ${isLong ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5" : "text-red-500 border-red-500/30 bg-red-500/5"}`}
      data-testid="badge-direction"
    >
      {isLong ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {direction}
    </Badge>
  );
}

function SignalCard({ signal, signalType, onDelete, onOpen }: { signal: Signal; signalType?: SignalType; onDelete: (id: string) => void; onOpen: (signal: Signal) => void }) {
  const [expanded, setExpanded] = useState(false);
  const data = (signal.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "";
  const typeName = signalType?.name || "Signal";
  const color = signalType?.color || "#6b7280";

  const instrumentType = data.instrument_type;
  const direction = data.direction;
  const entryPrice = data.entry_price;
  const expiration = data.expiration;
  const strike = data.strike;

  const tpLevels = [data.take_profit_1, data.take_profit_2, data.take_profit_3].filter(Boolean);
  const slLevels = [data.stop_loss_1, data.stop_loss_2, data.stop_loss_3].filter(Boolean);
  const raiseMethod = data.raise_stop_method;
  const raiseValue = data.raise_stop_value;
  const tradePlan = data.trade_plan;
  const notes = data.notes;

  const hasTradePlan = tpLevels.length > 0 || slLevels.length > 0 || raiseMethod || tradePlan;

  return (
    <Card className="hover-elevate overflow-hidden cursor-pointer" onClick={() => onOpen(signal)} data-testid={`card-signal-${signal.id}`}>
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {getSignalIcon(typeName)}
                {ticker && <span className="font-bold text-lg font-mono" data-testid="text-ticker">{ticker}</span>}
                <Badge
                  className="text-[10px] border font-medium"
                  style={{ backgroundColor: color + "15", color, borderColor: color + "30" }}
                  data-testid="badge-signal-type"
                >
                  {typeName}
                </Badge>
                {getDirectionBadge(direction)}
                {instrumentType && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid="badge-instrument-type">
                    {instrumentType}
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex items-center gap-4 flex-wrap text-sm">
                {entryPrice && (
                  <div className="flex items-center gap-1.5" data-testid="field-entry-price">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-muted-foreground text-xs">Entry</span>
                    <span className="font-semibold font-mono">${entryPrice}</span>
                  </div>
                )}
                {instrumentType === "Options" && expiration && (
                  <div className="flex items-center gap-1.5" data-testid="field-expiration">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-muted-foreground text-xs">Exp</span>
                    <span className="font-medium text-xs">{expiration}</span>
                  </div>
                )}
                {instrumentType === "Options" && strike && (
                  <div className="flex items-center gap-1.5" data-testid="field-strike">
                    <Target className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-muted-foreground text-xs">Strike</span>
                    <span className="font-semibold font-mono">${strike}</span>
                  </div>
                )}
              </div>

              {hasTradePlan && (
                <div className="mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-toggle-trade-plan"
                  >
                    <Braces className="h-3 w-3" />
                    <span className="font-medium">Trade Plan</span>
                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {expanded && (
                    <div className="mt-2 rounded-lg border border-zinc-700/30 bg-zinc-900/20 p-3 space-y-2.5">
                      {tpLevels.length > 0 && (
                        <div className="flex items-start gap-2" data-testid="field-target-levels">
                          <Crosshair className="h-3.5 w-3.5 text-emerald-500/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[10px] font-medium text-emerald-500/80 uppercase tracking-wider">Targets</span>
                            <div className="flex gap-2 mt-0.5">
                              {tpLevels.map((tp, i) => (
                                <span key={i} className="font-mono text-sm font-medium text-emerald-400">${tp}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {slLevels.length > 0 && (
                        <div className="flex items-start gap-2" data-testid="field-stop-loss-levels">
                          <ShieldAlert className="h-3.5 w-3.5 text-red-500/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[10px] font-medium text-red-500/80 uppercase tracking-wider">Stop Loss</span>
                            <div className="flex gap-2 mt-0.5">
                              {slLevels.map((sl, i) => (
                                <span key={i} className="font-mono text-sm font-medium text-red-400">${sl}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {raiseMethod && raiseMethod !== "None" && (
                        <div className="flex items-start gap-2" data-testid="field-raise-stop">
                          <TrendingUp className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wider">Raise Stop</span>
                            <p className="text-sm mt-0.5">
                              {raiseMethod}{raiseValue ? ` (${raiseValue})` : ""}
                            </p>
                          </div>
                        </div>
                      )}
                      {tradePlan && (
                        <div className="flex items-start gap-2" data-testid="field-trade-plan-notes">
                          <FileText className="h-3.5 w-3.5 text-blue-500/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[10px] font-medium text-blue-500/80 uppercase tracking-wider">Notes</span>
                            <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{tradePlan}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Badge variant={signal.status === "active" ? "outline" : "secondary"} className="text-[10px]" data-testid="badge-status">
                  {signal.status}
                </Badge>
                {signal.sourceAppName && (
                  <Badge variant="outline" className="text-[10px] font-normal text-blue-500 border-blue-500/30" data-testid={`badge-source-${signal.id}`}>
                    <Puzzle className="mr-1 h-2.5 w-2.5" />
                    {signal.sourceAppName}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground" data-testid="text-time">
                  {signal.createdAt ? formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true }) : ""}
                </span>
              </div>

              {(notes || tradePlan) && !expanded && (
                <p className="mt-2 text-xs text-muted-foreground/70 line-clamp-1" data-testid="text-notes-preview">
                  {notes || tradePlan}
                </p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              onClick={(e) => { e.stopPropagation(); onDelete(signal.id); }}
              data-testid={`button-delete-signal-${signal.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SignalsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  const signalsQuery = useQuery<Signal[]>({ queryKey: ["/api/signals"] });
  const typesQuery = useQuery<SignalType[]>({ queryKey: ["/api/signal-types"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/signals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Signal removed" });
    },
  });

  if (signalsQuery.isLoading || typesQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const signals = signalsQuery.data ?? [];
  const signalTypes = typesQuery.data ?? [];
  const typeMap = new Map(signalTypes.map(st => [st.id, st]));
  const filtered = filter === "all" ? signals : signals.filter((s) => s.status === filter);

  return (
    <div className="space-y-6 p-6" data-testid="page-signals">
      <PageHeader
        icon={TrendingUp}
        title="Signals"
        description="Track and manage your trading signals"
        testId="heading-signals"
        actions={
          <Button onClick={() => setDialogOpen(true)} data-testid="button-open-create-signal">
            <Plus className="mr-2 h-4 w-4" />
            New Signal
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        {["all", "active", "closed", "expired"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`button-filter-signal-${f}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <TrendingUp className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-medium">No signals found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "Create your first signal to get started"
                : `No ${filter} signals`}
            </p>
            {filter === "all" && (
              <Button className="mt-4" onClick={() => setDialogOpen(true)} data-testid="button-empty-create-signal">
                <Plus className="mr-2 h-4 w-4" />
                Create Signal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {filtered.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              signalType={typeMap.get(signal.signalTypeId)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onOpen={(s) => setSelectedSignal(s)}
            />
          ))}
        </div>
      )}

      <CreateSignalDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <SignalDetailDialog
        signal={selectedSignal}
        open={!!selectedSignal}
        onOpenChange={(open) => { if (!open) setSelectedSignal(null); }}
      />
    </div>
  );
}
