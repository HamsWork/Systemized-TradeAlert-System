import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp,
  DollarSign,
  Clock,
  Target,
  Crosshair,
  ShieldAlert,
  Braces,
  FileText,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Activity,
  CandlestickChart,
} from "lucide-react";
import { type Signal, type IbkrOrder, type ActivityLogEntry } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from "lightweight-charts";

interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function buildChartQueryUrl(params: {
  symbol: string;
  instrumentType?: string;
  strike?: string;
  expiration?: string;
  optionType?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set("symbol", params.symbol);
  if (params.instrumentType === "Options" && params.strike && params.expiration) {
    qs.set("secType", "OPT");
    qs.set("strike", params.strike);
    qs.set("expiration", params.expiration);
    const right = params.optionType?.toUpperCase().startsWith("P") ? "P" : "C";
    qs.set("right", right);
  }
  return `/api/ibkr/chart-data?${qs.toString()}`;
}

function TradeChart({ symbol, instrumentType, strike, expiration, optionType, entryPrice, tpLevels, slLevels, direction }: {
  symbol: string;
  instrumentType?: string;
  strike?: string;
  expiration?: string;
  optionType?: string;
  entryPrice?: number;
  tpLevels: number[];
  slLevels: number[];
  direction?: string;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartUrl = useMemo(
    () => buildChartQueryUrl({ symbol, instrumentType, strike, expiration, optionType }),
    [symbol, instrumentType, strike, expiration, optionType],
  );

  const barsQuery = useQuery<ChartBar[]>({
    queryKey: ["/api/ibkr/chart-data", symbol, instrumentType, strike, expiration],
    queryFn: async () => {
      const res = await fetch(chartUrl);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 60_000,
    retry: false,
  });

  const liveBars = barsQuery.data ?? [];
  const hasLiveData = liveBars.length > 0;

  const isOption = instrumentType === "Options";
  const chartLabel = isOption && strike && expiration
    ? `${symbol} $${strike} ${expiration}`
    : symbol;

  const priceLines = useMemo(() => {
    const lines: { price: number; color: string; title: string; lineStyle: number }[] = [];
    if (entryPrice) lines.push({ price: entryPrice, color: "#3b82f6", title: "Entry", lineStyle: 0 });
    tpLevels.forEach((tp, i) => lines.push({ price: tp, color: "#10b981", title: `TP${i + 1}`, lineStyle: 2 }));
    slLevels.forEach((sl, i) => lines.push({ price: sl, color: "#ef4444", title: `SL${i + 1}`, lineStyle: 2 }));
    return lines;
  }, [entryPrice, tpLevels, slLevels]);

  useEffect(() => {
    if (!chartContainerRef.current || barsQuery.isLoading) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#09090b" : "#ffffff" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
      },
      grid: {
        vertLines: { color: isDark ? "#27272a" : "#f4f4f5" },
        horzLines: { color: isDark ? "#27272a" : "#f4f4f5" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
      rightPriceScale: { borderColor: isDark ? "#3f3f46" : "#e4e4e7" },
      timeScale: { borderColor: isDark ? "#3f3f46" : "#e4e4e7" },
      crosshair: {
        horzLine: { color: isDark ? "#52525b" : "#d4d4d8" },
        vertLine: { color: isDark ? "#52525b" : "#d4d4d8" },
      },
    });

    if (hasLiveData) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e80",
        wickDownColor: "#ef444480",
      });

      const candleData = liveBars.map(bar => {
        let t = bar.time;
        if (/^\d{8}$/.test(t)) t = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        return { time: t, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
      });
      candleSeries.setData(candleData as any);

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      chart.priceScale("").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      const volumeData = liveBars.map(bar => {
        let t = bar.time;
        if (/^\d{8}$/.test(t)) t = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        return { time: t, value: bar.volume, color: bar.close >= bar.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" };
      });
      volumeSeries.setData(volumeData as any);

      priceLines.forEach(pl => {
        candleSeries.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: 1,
          lineStyle: pl.lineStyle,
          axisLabelVisible: true,
          title: pl.title,
        });
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); chart.remove(); };
  }, [liveBars, hasLiveData, priceLines, barsQuery.isLoading]);

  if (barsQuery.isLoading) {
    return (
      <div data-testid="trading-chart-wrapper">
        <Skeleton className="w-full h-[350px] rounded-lg" />
        <p className="text-xs text-muted-foreground text-center mt-2">Fetching chart data from IBKR...</p>
      </div>
    );
  }

  return (
    <div data-testid="trading-chart-wrapper">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOption ? <CandlestickChart className="h-4 w-4 text-blue-500" /> : <BarChart3 className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium" data-testid="text-chart-label">
            {isOption ? "Option Contract" : "Trade Chart"}
          </span>
          <span className="text-xs text-muted-foreground font-mono" data-testid="text-chart-symbol">— {chartLabel}</span>
          {hasLiveData ? (
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30" data-testid="badge-live-data">
              LIVE
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid="badge-no-data">
              No Data
            </Badge>
          )}
        </div>
      </div>
      {hasLiveData ? (
        <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" data-testid="trading-chart" />
      ) : (
        <div className="w-full h-[350px] rounded-lg border border-dashed border-muted-foreground/20 flex items-center justify-center" data-testid="trading-chart-empty">
          <p className="text-sm text-muted-foreground">No chart data available from IBKR</p>
        </div>
      )}
      {hasLiveData && (
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Entry</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Targets</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Stop Loss</span>
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: IbkrOrder }) {
  const statusColor = {
    filled: "text-emerald-500",
    submitted: "text-blue-500",
    cancelled: "text-red-500",
    pending: "text-amber-500",
  }[order.status] || "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`order-row-${order.id}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${order.side === "buy" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
        {order.side === "buy"
          ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
          : <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-xs">{order.side.toUpperCase()} {order.quantity}</span>
          <span className="font-mono text-xs">{order.symbol}</span>
          {order.secType === "OPT" && (
            <span className="text-[10px] text-muted-foreground">
              {order.expiration} {order.strike}{order.right}
            </span>
          )}
          <Badge variant="outline" className={`text-[10px] ${statusColor}`} data-testid={`badge-order-status-${order.id}`}>
            {order.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
          <span>{order.orderType}</span>
          {order.avgFillPrice && <span className="font-mono">Fill: ${order.avgFillPrice.toFixed(2)}</span>}
          {order.limitPrice && <span className="font-mono">Limit: ${order.limitPrice.toFixed(2)}</span>}
          {order.commission != null && <span>Comm: ${order.commission.toFixed(2)}</span>}
          {order.sourceAppName && <span className="text-blue-500">{order.sourceAppName}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[10px] text-muted-foreground">
          {order.submittedAt ? format(new Date(order.submittedAt), "MMM d, h:mm a") : ""}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityLogEntry }) {
  const iconMap: Record<string, { icon: typeof Activity; color: string }> = {
    signal_ingested: { icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
    signal_created: { icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
    ibkr_order: { icon: Package, color: "text-purple-500 bg-purple-500/10" },
    discord_notification: { icon: Activity, color: "text-indigo-500 bg-indigo-500/10" },
  };

  const { icon: Icon, color } = iconMap[entry.type] || { icon: Activity, color: "text-muted-foreground bg-muted" };

  return (
    <div className="flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`activity-row-${entry.id}`}>
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{entry.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{entry.description}</p>
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0">
        {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
      </div>
    </div>
  );
}

export function SignalDetailDialog({ signal, open, onOpenChange }: {
  signal: Signal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const data = (signal?.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "";

  const ordersQuery = useQuery<IbkrOrder[]>({
    queryKey: ["/api/ibkr/orders/by-symbol", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/ibkr/orders/by-symbol/${encodeURIComponent(ticker)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!ticker && open,
  });

  const activityQuery = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/activity/by-symbol", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/activity/by-symbol/${encodeURIComponent(ticker)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!ticker && open,
  });

  if (!signal) return null;

  const instrumentType = data.instrument_type;
  const direction = data.direction;
  const entryPrice = data.entry_price ? parseFloat(data.entry_price) : undefined;
  const expiration = data.expiration;
  const strike = data.strike;

  const tpLevels = [data.take_profit_1, data.take_profit_2, data.take_profit_3].filter(Boolean).map(Number);
  const slLevels = [data.stop_loss_1, data.stop_loss_2, data.stop_loss_3].filter(Boolean).map(Number);
  const raiseMethod = data.raise_stop_method;
  const raiseValue = data.raise_stop_value;
  const tradePlan = data.trade_plan;

  const orders = ordersQuery.data ?? [];
  const activity = activityQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="dialog-signal-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold text-lg" data-testid="text-symbol">{ticker || "Signal Detail"}</span>
            {direction && (
              <Badge variant={direction === "Long" ? "default" : "destructive"} className="text-xs" data-testid="badge-direction">
                {direction === "Long" ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
                {direction}
              </Badge>
            )}
            {instrumentType && (
              <Badge variant="outline" className="text-xs text-muted-foreground" data-testid="badge-instrument">
                {instrumentType}
              </Badge>
            )}
            <Badge variant={signal.status === "active" ? "outline" : "secondary"} className="text-xs" data-testid="badge-signal-status">
              {signal.status}
            </Badge>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Trade details for {ticker}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px] mt-2">
          <div className="space-y-4">
            <Card data-testid="card-chart">
              <CardContent className="p-3">
                <TradeChart
                  symbol={ticker}
                  instrumentType={instrumentType}
                  strike={strike}
                  expiration={expiration}
                  optionType={data.option_type}
                  entryPrice={entryPrice}
                  tpLevels={tpLevels}
                  slLevels={slLevels}
                  direction={direction}
                />
              </CardContent>
            </Card>

            <Card data-testid="card-orders">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">IBKR Orders</span>
                  <Badge variant="secondary" className="text-[10px]" data-testid="badge-order-count">{orders.length}</Badge>
                </div>
                {ordersQuery.isLoading ? (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center" data-testid="text-no-orders">
                    No IBKR orders found for {ticker}
                  </p>
                ) : (
                  <div className="space-y-0.5" data-testid="list-orders">
                    {orders.map(order => (
                      <OrderRow key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card data-testid="card-signal-info">
              <CardContent className="p-3 space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Braces className="h-4 w-4 text-muted-foreground" />
                  Signal Details
                </h3>

                <div className="space-y-2.5">
                  {entryPrice && (
                    <div className="flex items-center justify-between" data-testid="detail-entry-price">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3" /> Entry Price
                      </span>
                      <span className="font-mono font-semibold text-sm">${entryPrice}</span>
                    </div>
                  )}

                  {instrumentType === "Options" && expiration && (
                    <div className="flex items-center justify-between" data-testid="detail-expiration">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3 w-3" /> Expiration
                      </span>
                      <span className="text-sm font-medium">{expiration}</span>
                    </div>
                  )}

                  {instrumentType === "Options" && strike && (
                    <div className="flex items-center justify-between" data-testid="detail-strike">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Target className="h-3 w-3" /> Strike
                      </span>
                      <span className="font-mono font-semibold text-sm">${strike}</span>
                    </div>
                  )}

                  {signal.sourceAppName && (
                    <div className="flex items-center justify-between" data-testid="detail-source">
                      <span className="text-xs text-muted-foreground">Source</span>
                      <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30">
                        {signal.sourceAppName}
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between" data-testid="detail-created">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-[10px]">
                      {signal.createdAt ? format(new Date(signal.createdAt), "MMM d, yyyy h:mm a") : ""}
                    </span>
                  </div>
                </div>

                {tpLevels.length > 0 && (
                  <>
                    <Separator />
                    <div data-testid="detail-targets">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Crosshair className="h-3.5 w-3.5 text-emerald-500/70" />
                        <span className="text-[10px] font-medium text-emerald-500/80 uppercase tracking-wider">Targets</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {tpLevels.map((tp, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
                            TP{i + 1}: ${tp}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {slLevels.length > 0 && (
                  <>
                    <Separator />
                    <div data-testid="detail-stop-loss">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ShieldAlert className="h-3.5 w-3.5 text-red-500/70" />
                        <span className="text-[10px] font-medium text-red-500/80 uppercase tracking-wider">Stop Loss</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {slLevels.map((sl, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs text-red-500 border-red-500/30 bg-red-500/5">
                            SL{i + 1}: ${sl}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {raiseMethod && raiseMethod !== "None" && (
                  <>
                    <Separator />
                    <div data-testid="detail-raise-stop">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="h-3.5 w-3.5 text-amber-500/70" />
                        <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wider">Raise Stop</span>
                      </div>
                      <p className="text-xs">{raiseMethod}{raiseValue ? ` (${raiseValue})` : ""}</p>
                    </div>
                  </>
                )}

                {tradePlan && (
                  <>
                    <Separator />
                    <div data-testid="detail-trade-plan">
                      <div className="flex items-center gap-1.5 mb-1">
                        <FileText className="h-3.5 w-3.5 text-blue-500/70" />
                        <span className="text-[10px] font-medium text-blue-500/80 uppercase tracking-wider">Notes</span>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tradePlan}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-activity">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-medium">Activity</span>
                  <Badge variant="secondary" className="text-[10px]" data-testid="badge-activity-count">{activity.length}</Badge>
                </div>
                {activityQuery.isLoading ? (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center" data-testid="text-no-activity">
                    No activity found for {ticker}
                  </p>
                ) : (
                  <div className="space-y-0.5" data-testid="list-activity">
                    {activity.map(entry => (
                      <ActivityRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
