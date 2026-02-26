import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { type Signal, type SignalType, insertSignalSchema, type InsertSignal } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";

type SignalVariable = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  showWhen?: { field: string; value?: string; values?: string[] };
};

function renderTemplatePreview(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function CreateSignalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [signalData, setSignalData] = useState<Record<string, string>>({});

  const typesQuery = useQuery<SignalType[]>({ queryKey: ["/api/signal-types"] });
  const signalTypes = typesQuery.data ?? [];
  const selectedType = signalTypes.find(t => t.id === selectedTypeId);

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
      setSignalData({});
      setSelectedTypeId("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedTypeId) return;
    createMutation.mutate({
      signalTypeId: selectedTypeId,
      data: signalData,
      status: "active",
    });
  };

  const variables = (selectedType?.variables || []) as SignalVariable[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Signal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Signal Type</label>
            <Select value={selectedTypeId} onValueChange={(val) => { setSelectedTypeId(val); setSignalData({}); }} data-testid="select-signal-type-dropdown">
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
              <div className="rounded-md p-2 text-xs" style={{ backgroundColor: selectedType.color + "15", borderLeft: `3px solid ${selectedType.color}` }}>
                <span className="font-medium" style={{ color: selectedType.color }}>{selectedType.name}</span>
                {selectedType.descriptionTemplate && (
                  <p className="text-muted-foreground mt-0.5">
                    {renderTemplatePreview(selectedType.descriptionTemplate, signalData)}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {variables.filter((v) => {
                  if (!v.showWhen) return true;
                  const currentVal = signalData[v.showWhen.field];
                  if (v.showWhen.values) return v.showWhen.values.includes(currentVal);
                  return currentVal === v.showWhen.value;
                }).map((v) => {
                  const handleChange = (name: string, value: string) => {
                    setSignalData(prev => {
                      const next = { ...prev, [name]: value };
                      const dependents = variables.filter(vr => vr.showWhen?.field === name);
                      dependents.forEach(dep => {
                        if (!dep.showWhen) return;
                        const matches = dep.showWhen.values
                          ? dep.showWhen.values.includes(value)
                          : dep.showWhen.value === value;
                        if (!matches) {
                          delete next[dep.name];
                        }
                      });
                      return next;
                    });
                  };

                  if (v.type === "boolean") {
                    return (
                      <div key={v.name} className="flex items-center justify-between">
                        <label className="text-sm font-medium">{v.label}</label>
                        <Switch
                          checked={signalData[v.name] === "true"}
                          onCheckedChange={(checked) => handleChange(v.name, checked ? "true" : "false")}
                          data-testid={`input-signal-${v.name}`}
                        />
                      </div>
                    );
                  }

                  if (v.type === "select" && v.options) {
                    return (
                      <div key={v.name}>
                        <label className="text-sm font-medium">{v.label}{v.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                        <Select value={signalData[v.name] || ""} onValueChange={(val) => handleChange(v.name, val)}>
                          <SelectTrigger data-testid={`select-signal-${v.name}`}>
                            <SelectValue placeholder={`Select ${v.label.toLowerCase()}...`} />
                          </SelectTrigger>
                          <SelectContent>
                            {v.options.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  if (v.type === "text") {
                    return (
                      <div key={v.name}>
                        <label className="text-sm font-medium">{v.label}{v.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                        <Textarea
                          placeholder={v.label}
                          className="resize-none"
                          value={signalData[v.name] || ""}
                          onChange={(e) => handleChange(v.name, e.target.value)}
                          data-testid={`input-signal-${v.name}`}
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={v.name}>
                      <label className="text-sm font-medium">{v.label}{v.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                      <Input
                        type={v.type === "number" ? "number" : v.type === "date" ? "date" : "text"}
                        step={v.type === "number" ? "0.01" : undefined}
                        placeholder={v.label}
                        value={signalData[v.name] || ""}
                        onChange={(e) => handleChange(v.name, e.target.value)}
                        data-testid={`input-signal-${v.name}`}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <Button
            className="w-full"
            disabled={!selectedTypeId || createMutation.isPending}
            onClick={handleSubmit}
            data-testid="button-create-signal"
          >
            {createMutation.isPending ? "Creating..." : "Create Signal"}
          </Button>
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

function SignalCard({ signal, signalType, onDelete }: { signal: Signal; signalType?: SignalType; onDelete: (id: string) => void }) {
  const data = (signal.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "";
  const typeName = signalType?.name || "Signal";
  const color = signalType?.color || "#6b7280";
  const fieldsTemplate = (signalType?.fieldsTemplate || []) as Array<{ name: string; value: string; inline?: boolean }>;

  const renderedFields = fieldsTemplate
    .map(f => ({
      name: f.name,
      value: renderTemplatePreview(f.value, data),
      inline: f.inline,
    }))
    .filter(f => f.value && f.value !== "$" && f.value.trim() !== "");

  return (
    <Card className="hover-elevate" data-testid={`card-signal-${signal.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {getSignalIcon(typeName)}
              {ticker && <span className="font-semibold text-lg">{ticker}</span>}
              <Badge
                className="text-xs border"
                style={{ backgroundColor: color + "20", color, borderColor: color + "40" }}
              >
                {typeName}
              </Badge>
            </div>

            {signalType?.descriptionTemplate && (
              <p className="mt-1 text-sm text-muted-foreground">
                {renderTemplatePreview(signalType.descriptionTemplate, data)}
              </p>
            )}

            {renderedFields.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                {renderedFields.map((f, i) => (
                  <div key={i}>
                    <p className="text-xs text-muted-foreground">{f.name}</p>
                    <p className="font-medium">{f.value}</p>
                  </div>
                ))}
              </div>
            )}

            {data.trade_plan && (
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Trade Plan</p>
                <p className="text-sm whitespace-pre-wrap">{data.trade_plan}</p>
              </div>
            )}

            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <Badge variant={signal.status === "active" ? "outline" : "secondary"} className="text-xs">
                {signal.status}
              </Badge>
              {data.instrument_type && (
                <Badge variant="outline" className="text-xs">{data.instrument_type}</Badge>
              )}
              {signal.sourceAppName && (
                <Badge variant="outline" className="text-xs font-normal text-blue-500 border-blue-500/30" data-testid={`badge-source-${signal.id}`}>
                  <Puzzle className="mr-1 h-2.5 w-2.5" />
                  {signal.sourceAppName}
                </Badge>
              )}
              <span>
                {signal.createdAt ? formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true }) : ""}
              </span>
            </div>

            {data.notes && (
              <p className="mt-2 text-xs text-muted-foreground border-t border-border/50 pt-2">
                {data.notes}
              </p>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(signal.id)}
            data-testid={`button-delete-signal-${signal.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SignalsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Signals</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and manage your trading signals
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-open-create-signal">
          <Plus className="mr-2 h-4 w-4" />
          New Signal
        </Button>
      </div>

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
            />
          ))}
        </div>
      )}

      <CreateSignalDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
