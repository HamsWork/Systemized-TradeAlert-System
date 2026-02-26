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
  TrendingDown,
  Plus,
  Trash2,
  Target,
  Shield,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertSignalSchema, type Signal, type InsertSignal } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

function CreateSignalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<InsertSignal>({
    resolver: zodResolver(insertSignalSchema),
    defaultValues: {
      symbol: "",
      type: "technical",
      direction: "buy",
      confidence: 50,
      entryPrice: 0,
      targetPrice: 0,
      stopLoss: 0,
      status: "active",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertSignal) => {
      const res = await apiRequest("POST", "/api/signals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Signal created" });
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
          <DialogTitle>Create Signal</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., AAPL" {...field} data-testid="input-signal-symbol" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-signal-direction">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="buy">Buy (Long)</SelectItem>
                        <SelectItem value="sell">Sell (Short)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-signal-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="fundamental">Fundamental</SelectItem>
                        <SelectItem value="sentiment">Sentiment</SelectItem>
                        <SelectItem value="algorithmic">Algorithmic</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confidence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confidence (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-signal-confidence"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="entryPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-signal-entry"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || null)}
                        data-testid="input-signal-target"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stopLoss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stop Loss</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || null)}
                        data-testid="input-signal-stoploss"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Signal analysis notes..."
                      className="resize-none"
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-signal-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-signal">
              {createMutation.isPending ? "Creating..." : "Create Signal"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SignalCard({ signal, onDelete }: { signal: Signal; onDelete: (id: string) => void }) {
  const isBuy = signal.direction === "buy";
  const confidenceColor =
    signal.confidence >= 75 ? "text-emerald-500" : signal.confidence >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <Card className="hover-elevate" data-testid={`card-signal-${signal.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isBuy ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className="font-semibold text-lg">{signal.symbol}</span>
              <Badge variant={isBuy ? "default" : "destructive"} className="text-xs">
                {signal.direction.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {signal.type}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Entry</p>
                <p className="font-medium">${signal.entryPrice.toFixed(2)}</p>
              </div>
              {signal.targetPrice && (
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Target className="h-3 w-3" /> Target
                  </p>
                  <p className="font-medium text-emerald-500">${signal.targetPrice.toFixed(2)}</p>
                </div>
              )}
              {signal.stopLoss && (
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Shield className="h-3 w-3" /> Stop
                  </p>
                  <p className="font-medium text-red-500">${signal.stopLoss.toFixed(2)}</p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <span className={`font-medium ${confidenceColor}`}>
                {signal.confidence}% confidence
              </span>
              <Badge variant={signal.status === "active" ? "outline" : "secondary"} className="text-xs">
                {signal.status}
              </Badge>
              <span>
                {signal.createdAt ? formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true }) : ""}
              </span>
            </div>

            {signal.notes && (
              <p className="mt-2 text-xs text-muted-foreground border-t border-border/50 pt-2">
                {signal.notes}
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

  if (signalsQuery.isLoading) {
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
            <SignalCard key={signal.id} signal={signal} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}

      <CreateSignalDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
