import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAlertSchema, type Alert, type InsertAlert } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const alertFormSchema = insertAlertSchema.extend({
  targetPrice: insertAlertSchema.shape.targetPrice,
});

function CreateAlertDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<InsertAlert>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: {
      name: "",
      symbol: "",
      condition: "above",
      targetPrice: 0,
      status: "active",
      priority: "medium",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertAlert) => {
      const res = await apiRequest("POST", "/api/alerts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Alert created", description: "Your price alert has been set up." });
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
          <DialogTitle>Create Alert</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alert Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., BTC Breakout Alert" {...field} data-testid="input-alert-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., AAPL" {...field} data-testid="input-alert-symbol" />
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
                    <FormLabel>Target Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-alert-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-alert-condition">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="above">Price Above</SelectItem>
                        <SelectItem value="below">Price Below</SelectItem>
                        <SelectItem value="crosses">Price Crosses</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-alert-priority">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-alert">
              {createMutation.isPending ? "Creating..." : "Create Alert"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AlertCard({ alert, onDelete }: { alert: Alert; onDelete: (id: string) => void }) {
  const priorityColors = {
    low: "secondary",
    medium: "default",
    high: "destructive",
  } as const;

  const conditionLabels = {
    above: "Price Above",
    below: "Price Below",
    crosses: "Price Crosses",
  } as Record<string, string>;

  const statusIcon = alert.triggered ? (
    <CheckCircle className="h-4 w-4 text-emerald-500" />
  ) : alert.status === "active" ? (
    <Clock className="h-4 w-4 text-amber-500" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
  );

  return (
    <Card className="hover-elevate" data-testid={`card-alert-${alert.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {statusIcon}
              <span className="font-semibold">{alert.symbol}</span>
              <Badge variant={priorityColors[alert.priority as keyof typeof priorityColors] ?? "default"} className="text-xs">
                {alert.priority}
              </Badge>
              <Badge variant={alert.status === "active" ? "outline" : "secondary"} className="text-xs">
                {alert.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm">{alert.name}</p>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <span>{conditionLabels[alert.condition] ?? alert.condition} ${alert.targetPrice.toFixed(2)}</span>
              {alert.currentPrice && <span>Current: ${alert.currentPrice.toFixed(2)}</span>}
              <span>{alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : ""}</span>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(alert.id)}
            data-testid={`button-delete-alert-${alert.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AlertsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  const alertsQuery = useQuery<Alert[]>({ queryKey: ["/api/alerts"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Alert deleted" });
    },
  });

  if (alertsQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const alerts = alertsQuery.data ?? [];
  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.status === filter);

  return (
    <div className="space-y-6 p-6" data-testid="page-alerts">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your price alerts and notifications
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-open-create-alert">
          <Plus className="mr-2 h-4 w-4" />
          New Alert
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {["all", "active", "paused", "triggered"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`button-filter-${f}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "all" && ` (${alerts.length})`}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bell className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-medium">No alerts found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "Create your first alert to get started"
                : `No ${filter} alerts`}
            </p>
            {filter === "all" && (
              <Button className="mt-4" onClick={() => setDialogOpen(true)} data-testid="button-empty-create-alert">
                <Plus className="mr-2 h-4 w-4" />
                Create Alert
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}

      <CreateAlertDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
