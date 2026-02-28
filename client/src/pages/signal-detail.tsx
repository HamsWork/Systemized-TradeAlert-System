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
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";

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

function TradingViewFallback({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";

    const widgetInner = document.createElement("div");
    widgetInner.className = "tradingview-widget-container__widget";
    widgetInner.style.height = "calc(100% - 32px)";
    widgetInner.style.width = "100%";
    widgetContainer.appendChild(widgetInner);
    containerRef.current.appendChild(widgetContainer);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: symbol.toUpperCase(),
      interval: "D",
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });
    widgetContainer.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol]);

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height: 400 }} data-testid="trading-chart-fallback" />;
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
    if (!chartContainerRef.current || barsQuery.isLoading || !hasLiveData) return;

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
        <div className="flex items-center gap-2 mb-2">
          {isOption ? <CandlestickChart className="h-4 w-4 text-blue-500" /> : <BarChart3 className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{isOption ? "Option Contract" : "Trade Chart"}</span>
          <span className="text-xs text-muted-foreground font-mono">— {chartLabel}</span>
        </div>
        <div className="w-full h-[350px] rounded-lg bg-card border border-border/50 flex flex-col items-center justify-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-muted-foreground/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-emerald-500 animate-spin" />
            <BarChart3 className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Loading chart data</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Fetching from Polygon.io</p>
          </div>
        </div>
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
              IBKR LIVE
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30" data-testid="badge-tradingview">
              TradingView
            </Badge>
          )}
        </div>
      </div>
      {hasLiveData ? (
        <>
          <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" data-testid="trading-chart" />
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Entry</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Targets</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Stop Loss</span>
          </div>
        </>
      ) : (
        <TradingViewFallback symbol={symbol} />
      )}
    </div>
  );
}

function OrderRow({ order }: { order: IbkrOrder }) {
  const statusColor = {
    filled: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    submitted: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    cancelled: "text-red-500 bg-red-500/10 border-red-500/20",
    rejected: "text-red-500 bg-red-500/10 border-red-500/20",
    pending: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  }[order.status] || "text-muted-foreground bg-muted border-border";

  const typeLabel = (order.orderType || "").replace(/_/g, " ").toUpperCase();
  const filledQty = order.filledQuantity || 0;
  const totalQty = order.quantity || 0;

  return (
    <div className="flex items-center gap-3 py-2.5 px-2.5 rounded-lg hover:bg-muted/50 transition-colors border border-border/40 mb-1" data-testid={`order-row-${order.id}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${order.side === "buy" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
        {order.side === "buy"
          ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          : <ArrowDownRight className="h-4 w-4 text-red-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-semibold text-xs ${order.side === "buy" ? "text-emerald-500" : "text-red-500"}`}>
            {order.side.toUpperCase()}
          </span>
          <span className="font-mono text-xs font-semibold" data-testid={`text-order-symbol-${order.id}`}>{order.symbol}</span>
          {order.secType === "OPT" && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {order.strike}{order.right} {order.expiration}
            </span>
          )}
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${statusColor}`} data-testid={`badge-order-status-${order.id}`}>
            {order.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium" data-testid={`text-order-type-${order.id}`}>
            {typeLabel}
          </span>
          <span className="text-[10px] text-muted-foreground" data-testid={`text-order-qty-${order.id}`}>
            Qty: <span className="font-mono font-medium text-foreground">{filledQty}/{totalQty}</span>
          </span>
          {order.avgFillPrice != null && order.avgFillPrice > 0 && (
            <span className="text-[10px] text-muted-foreground" data-testid={`text-order-fill-${order.id}`}>
              Fill: <span className="font-mono font-medium text-foreground">${order.avgFillPrice.toFixed(2)}</span>
            </span>
          )}
          {order.limitPrice != null && (
            <span className="text-[10px] text-muted-foreground" data-testid={`text-order-limit-${order.id}`}>
              Limit: <span className="font-mono font-medium text-foreground">${order.limitPrice.toFixed(2)}</span>
            </span>
          )}
          {order.stopPrice != null && (
            <span className="text-[10px] text-muted-foreground" data-testid={`text-order-stop-${order.id}`}>
              Stop: <span className="font-mono font-medium text-foreground">${order.stopPrice.toFixed(2)}</span>
            </span>
          )}
          {order.lastPrice != null && order.lastPrice > 0 && (
            <span className="text-[10px] text-muted-foreground" data-testid={`text-order-last-${order.id}`}>
              Last: <span className="font-mono font-medium text-foreground">${order.lastPrice.toFixed(2)}</span>
            </span>
          )}
          {order.commission != null && order.commission > 0 && (
            <span className="text-[10px] text-muted-foreground" data-testid={`text-order-comm-${order.id}`}>
              Comm: <span className="font-mono">${order.commission.toFixed(2)}</span>
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {order.sourceAppName && (
          <div className="text-[10px] text-blue-500 font-medium mb-0.5" data-testid={`text-order-app-${order.id}`}>{order.sourceAppName}</div>
        )}
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
    <div className="py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`activity-row-${entry.id}`}>
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-3 w-3" />
        </div>
        <p className="text-xs font-medium flex-1 min-w-0">{entry.title}</p>
        <div className="text-[10px] text-muted-foreground shrink-0">
          {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
        </div>
      </div>
      {entry.description && (
        <p className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap break-words w-full">{entry.description}</p>
      )}
    </div>
  );
}

function OptionChartTabs({ symbol, strike, expiration, optionType, entryPrice, tpLevels, slLevels, direction }: {
  symbol: string;
  strike?: string;
  expiration?: string;
  optionType?: string;
  entryPrice?: number;
  tpLevels: number[];
  slLevels: number[];
  direction?: string;
}) {
  const [activeTab, setActiveTab] = useState<"option" | "underlying">("option");

  const optionLabel = strike && expiration ? `${symbol} $${strike} ${expiration}` : symbol;

  return (
    <div data-testid="option-chart-tabs">
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setActiveTab("option")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === "option"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-option-chart"
        >
          <CandlestickChart className="inline-block h-3 w-3 mr-1.5 -mt-0.5" />
          Option Contract
        </button>
        <button
          onClick={() => setActiveTab("underlying")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === "underlying"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-underlying-chart"
        >
          <BarChart3 className="inline-block h-3 w-3 mr-1.5 -mt-0.5" />
          Underlying ({symbol})
        </button>
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {activeTab === "option" ? optionLabel : symbol}
        </span>
      </div>
      {activeTab === "option" ? (
        <TradeChart
          symbol={symbol}
          instrumentType="Options"
          strike={strike}
          expiration={expiration}
          optionType={optionType}
          entryPrice={entryPrice}
          tpLevels={tpLevels}
          slLevels={slLevels}
          direction={direction}
        />
      ) : (
        <TradeChart
          symbol={symbol}
          tpLevels={[]}
          slLevels={[]}
          direction={direction}
        />
      )}
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
    queryKey: ["/api/ibkr/orders/by-signal", signal?.id],
    queryFn: async () => {
      const res = await fetch(`/api/ibkr/orders/by-signal/${encodeURIComponent(signal!.id)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!signal?.id && open,
  });

  const activityQuery = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/activity/by-signal", signal?.id],
    queryFn: async () => {
      const res = await fetch(`/api/activity/by-signal/${encodeURIComponent(signal!.id)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!signal?.id && open,
  });

  if (!signal) return null;

  const instrumentType = data.instrument_type;
  const direction = data.direction;
  const entryPrice = data.entry_price ? parseFloat(data.entry_price) : undefined;
  const expiration = data.expiration;
  const strike = data.strike;

  const targets: { key: string; price: number; takeOffPercent?: number; raiseStopLoss?: number }[] = [];
  if (data.targets && typeof data.targets === "object") {
    for (const [key, val] of Object.entries(data.targets)) {
      const t = val as any;
      if (t && t.price) {
        targets.push({ key, price: Number(t.price), takeOffPercent: t.take_off_percent ? Number(t.take_off_percent) : undefined, raiseStopLoss: t.raise_stop_loss?.price ? Number(t.raise_stop_loss.price) : undefined });
      }
    }
  }
  const tpLevels = targets.map(t => t.price);
  const stopLoss = data.stop_loss !== undefined && data.stop_loss !== null ? Number(data.stop_loss) : undefined;
  const slLevels = stopLoss !== undefined ? [stopLoss] : [];
  const timeStop = data.time_stop || null;

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
              <Badge variant={(direction === "Long" || direction === "Call") ? "default" : "destructive"} className="text-xs" data-testid="badge-direction">
                {(direction === "Long" || direction === "Call") ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
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
                {instrumentType === "Options" ? (
                  <OptionChartTabs
                    symbol={ticker}
                    strike={strike}
                    expiration={expiration}
                    optionType={data.option_type}
                    entryPrice={entryPrice}
                    tpLevels={tpLevels}
                    slLevels={slLevels}
                    direction={direction}
                  />
                ) : (
                  <TradeChart
                    symbol={ticker}
                    instrumentType={instrumentType}
                    entryPrice={entryPrice}
                    tpLevels={tpLevels}
                    slLevels={slLevels}
                    direction={direction}
                  />
                )}
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
                        {targets.map((t, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
                            TP{i + 1}: ${t.price}{t.takeOffPercent ? ` (${t.takeOffPercent}%)` : ""}
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

                {timeStop && (
                  <>
                    <Separator />
                    <div data-testid="detail-time-stop">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Clock className="h-3.5 w-3.5 text-amber-500/70" />
                        <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wider">Time Stop</span>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs text-amber-500 border-amber-500/30 bg-amber-500/5">
                        {timeStop}
                      </Badge>
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
