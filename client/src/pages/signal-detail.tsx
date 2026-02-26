import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
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
  CircleDot,
} from "lucide-react";
import { type Signal, type SignalType, type IbkrOrder, type ActivityLogEntry } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { createChart, ColorType, LineSeries, AreaSeries } from "lightweight-charts";

function TradingChart({ symbol, orders, entryPrice, tpLevels, slLevels, direction }: {
  symbol: string;
  orders: IbkrOrder[];
  entryPrice?: number;
  tpLevels: number[];
  slLevels: number[];
  direction?: string;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  const priceLines = useMemo(() => {
    const lines: { price: number; color: string; title: string; lineStyle: number }[] = [];
    if (entryPrice) {
      lines.push({ price: entryPrice, color: "#3b82f6", title: "Entry", lineStyle: 0 });
    }
    tpLevels.forEach((tp, i) => {
      lines.push({ price: tp, color: "#10b981", title: `TP${i + 1}`, lineStyle: 2 });
    });
    slLevels.forEach((sl, i) => {
      lines.push({ price: sl, color: "#ef4444", title: `SL${i + 1}`, lineStyle: 2 });
    });
    orders.forEach(order => {
      if (order.avgFillPrice && order.status === "filled") {
        lines.push({
          price: order.avgFillPrice,
          color: order.side === "buy" ? "#22c55e" : "#f59e0b",
          title: `${order.side.toUpperCase()} @${order.avgFillPrice}`,
          lineStyle: 1,
        });
      }
    });
    return lines;
  }, [entryPrice, tpLevels, slLevels, orders]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

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
      height: 400,
      rightPriceScale: { borderColor: isDark ? "#3f3f46" : "#e4e4e7" },
      timeScale: { borderColor: isDark ? "#3f3f46" : "#e4e4e7" },
      crosshair: {
        horzLine: { color: isDark ? "#52525b" : "#d4d4d8" },
        vertLine: { color: isDark ? "#52525b" : "#d4d4d8" },
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: direction === "Short" ? "#ef4444" : "#3b82f6",
      topColor: direction === "Short" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)",
      bottomColor: direction === "Short" ? "rgba(239,68,68,0.02)" : "rgba(59,130,246,0.02)",
      lineWidth: 2,
    });

    const allPrices = [
      ...(entryPrice ? [entryPrice] : []),
      ...tpLevels,
      ...slLevels,
      ...orders.filter(o => o.avgFillPrice).map(o => o.avgFillPrice!),
      ...orders.filter(o => o.lastPrice).map(o => o.lastPrice!),
    ];

    if (allPrices.length > 0) {
      const mid = entryPrice || allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
      const spread = Math.max(...allPrices) - Math.min(...allPrices);
      const range = Math.max(spread * 1.5, mid * 0.05);

      const now = new Date();
      const dataPoints = [];
      for (let i = 30; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const noise = (Math.random() - 0.5) * range * 0.3;
        const trend = direction === "Short"
          ? mid + (range * 0.1 * (30 - i) / 30) - (range * 0.2 * i / 30)
          : mid - (range * 0.1 * (30 - i) / 30) + (range * 0.2 * i / 30);
        dataPoints.push({
          time: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          value: Math.max(0.01, trend + noise),
        });
      }
      areaSeries.setData(dataPoints as any);

      priceLines.forEach(pl => {
        areaSeries.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: 1,
          lineStyle: pl.lineStyle,
          axisLabelVisible: true,
          title: pl.title,
        });
      });
    } else {
      areaSeries.setData([
        { time: "2026-02-20", value: 100 },
        { time: "2026-02-21", value: 101 },
        { time: "2026-02-26", value: 102 },
      ] as any);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [priceLines, direction, entryPrice, tpLevels, slLevels, orders]);

  return (
    <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" data-testid="trading-chart" />
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
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`order-row-${order.id}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${order.side === "buy" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
        {order.side === "buy"
          ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          : <ArrowDownRight className="h-4 w-4 text-red-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{order.side.toUpperCase()} {order.quantity}</span>
          <span className="font-mono text-sm">{order.symbol}</span>
          {order.secType === "OPT" && (
            <span className="text-xs text-muted-foreground">
              {order.expiration} {order.strike}{order.right}
            </span>
          )}
          <Badge variant="outline" className={`text-[10px] ${statusColor}`} data-testid={`badge-order-status-${order.id}`}>
            {order.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span>{order.orderType}</span>
          {order.avgFillPrice && <span className="font-mono">Fill: ${order.avgFillPrice.toFixed(2)}</span>}
          {order.limitPrice && <span className="font-mono">Limit: ${order.limitPrice.toFixed(2)}</span>}
          {order.commission != null && <span>Comm: ${order.commission.toFixed(2)}</span>}
          {order.sourceAppName && <span className="text-blue-500">{order.sourceAppName}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-muted-foreground">
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
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`activity-row-${entry.id}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{entry.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</p>
      </div>
      <div className="text-xs text-muted-foreground shrink-0">
        {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
      </div>
    </div>
  );
}

export default function SignalDetailPage() {
  const [, params] = useRoute("/signals/:id");
  const signalId = params?.id;

  const signalQuery = useQuery<Signal>({
    queryKey: ["/api/signals", signalId],
    queryFn: async () => {
      const res = await fetch(`/api/signals/${signalId}`);
      if (!res.ok) throw new Error("Signal not found");
      return res.json();
    },
    enabled: !!signalId,
  });

  const typesQuery = useQuery<SignalType[]>({ queryKey: ["/api/signal-types"] });

  const signal = signalQuery.data;
  const data = (signal?.data || {}) as Record<string, any>;
  const ticker = data.ticker || data.symbol || "";

  const ordersQuery = useQuery<IbkrOrder[]>({
    queryKey: ["/api/ibkr/orders/by-symbol", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/ibkr/orders/by-symbol/${encodeURIComponent(ticker)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!ticker,
  });

  const activityQuery = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/activity/by-symbol", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/activity/by-symbol/${encodeURIComponent(ticker)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!ticker,
  });

  if (signalQuery.isLoading || typesQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6" data-testid="signal-not-found">
        <CircleDot className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <h2 className="text-lg font-medium">Signal not found</h2>
        <Link href="/signals">
          <Button variant="outline" className="mt-4" data-testid="link-back-to-signals">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Signals
          </Button>
        </Link>
      </div>
    );
  }

  const signalTypes = typesQuery.data ?? [];
  const signalType = signalTypes.find(st => st.id === signal.signalTypeId);
  const typeName = signalType?.name || "Signal";
  const color = signalType?.color || "#6b7280";

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
    <div className="space-y-6 p-6" data-testid="page-signal-detail">
      <div className="flex items-center gap-3">
        <Link href="/signals">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold font-mono" data-testid="text-symbol">{ticker || "Signal Detail"}</h1>
          <Badge
            className="text-xs border font-medium"
            style={{ backgroundColor: color + "15", color, borderColor: color + "30" }}
            data-testid="badge-signal-type-detail"
          >
            {typeName}
          </Badge>
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
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card data-testid="card-chart">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Trade Chart</span>
                <span className="text-xs text-muted-foreground">— {ticker}</span>
              </div>
              <TradingChart
                symbol={ticker}
                orders={orders}
                entryPrice={entryPrice}
                tpLevels={tpLevels}
                slLevels={slLevels}
                direction={direction}
              />
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Entry</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block border-dashed" /> Targets</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Stop Loss</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> Fill Price</span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-orders">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">IBKR Orders</span>
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-order-count">{orders.length}</Badge>
              </div>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-orders">
                  No IBKR orders found for {ticker}
                </p>
              ) : (
                <div className="space-y-1" data-testid="list-orders">
                  {orders.map(order => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-activity">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium">Activity</span>
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-activity-count">{activity.length}</Badge>
              </div>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-activity">
                  No activity found for {ticker}
                </p>
              ) : (
                <div className="space-y-1" data-testid="list-activity">
                  {activity.map(entry => (
                    <ActivityRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card data-testid="card-signal-info">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Braces className="h-4 w-4 text-muted-foreground" />
                Signal Details
              </h3>

              <div className="space-y-3">
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
                  <span className="text-xs">
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
                    <div className="flex gap-2 flex-wrap">
                      {tpLevels.map((tp, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
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
                    <div className="flex gap-2 flex-wrap">
                      {slLevels.map((sl, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-red-500 border-red-500/30 bg-red-500/5">
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
                    <p className="text-sm">{raiseMethod}{raiseValue ? ` (${raiseValue})` : ""}</p>
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
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{tradePlan}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
