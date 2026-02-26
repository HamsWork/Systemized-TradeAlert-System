import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertWatchlistSchema, type WatchlistItem, type InsertWatchlistItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function AddToWatchlistDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<InsertWatchlistItem>({
    resolver: zodResolver(insertWatchlistSchema),
    defaultValues: {
      symbol: "",
      name: "",
      currentPrice: 0,
      change24h: 0,
      changePercent: 0,
      volume: "",
      marketCap: "",
      sector: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertWatchlistItem) => {
      const res = await apiRequest("POST", "/api/watchlist", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Added to watchlist" });
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
          <DialogTitle>Add to Watchlist</DialogTitle>
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
                      <Input placeholder="e.g., AAPL" {...field} data-testid="input-watchlist-symbol" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Apple Inc." {...field} data-testid="input-watchlist-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="currentPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-watchlist-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="change24h"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>24h Change</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-watchlist-change"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="changePercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Change %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-watchlist-change-percent"
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
                name="sector"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sector</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Technology" {...field} value={field.value ?? ""} data-testid="input-watchlist-sector" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="volume"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Volume</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 12.5M" {...field} value={field.value ?? ""} data-testid="input-watchlist-volume" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-add-watchlist">
              {createMutation.isPending ? "Adding..." : "Add to Watchlist"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function WatchlistPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const watchlistQuery = useQuery<WatchlistItem[]>({ queryKey: ["/api/watchlist"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Removed from watchlist" });
    },
  });

  if (watchlistQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const items = watchlistQuery.data ?? [];

  return (
    <div className="space-y-6 p-6" data-testid="page-watchlist">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your favorite assets and their performance
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-open-add-watchlist">
          <Plus className="mr-2 h-4 w-4" />
          Add Asset
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Eye className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-medium">Your watchlist is empty</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add assets to track their performance
            </p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)} data-testid="button-empty-add-watchlist">
              <Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">24h Change</TableHead>
                  <TableHead className="text-right">Change %</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`row-watchlist-${item.id}`}>
                    <TableCell className="font-semibold">{item.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">{item.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${item.currentPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`flex items-center justify-end gap-1 font-medium ${item.change24h >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {item.change24h >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        ${Math.abs(item.change24h).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={item.changePercent >= 0 ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.sector || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.volume || "-"}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(item.id)}
                        data-testid={`button-remove-watchlist-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <AddToWatchlistDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
