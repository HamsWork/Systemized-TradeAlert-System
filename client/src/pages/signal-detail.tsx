import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Code,
  Send,
  Loader2,
  Milestone,
} from "lucide-react";
import { type Signal, type IbkrOrder, type ActivityLogEntry } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { formatDateTime } from "@/lib/formatters";
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
  if ((params.instrumentType === "Options" || params.instrumentType === "LETF Option") && params.strike && params.expiration) {
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
  const chartInstanceRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<{ setData: (d: any) => void; createPriceLine: (opts: any) => any; removePriceLine: (line: any) => void } | null>(null);
  const priceLineRefsRef = useRef<any[]>([]);

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
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const liveBars = barsQuery.data ?? [];
  const hasLiveData = liveBars.length > 0;

  const isOption = instrumentType === "Options" || instrumentType === "LETF Option";
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

  const hasIntraday = liveBars.some(b => b.time.includes("T"));

  const candleData = useMemo(
    () =>
      liveBars.map(bar => {
        let t: string | number = bar.time;
        if (hasIntraday) {
          if (t.includes("T")) {
            t = Math.floor(new Date(t + "Z").getTime() / 1000) as number;
          } else {
            const normalized = /^\d{8}$/.test(t)
              ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`
              : t;
            t = Math.floor(new Date(normalized + "T00:00:00Z").getTime() / 1000) as number;
          }
        } else {
          if (/^\d{8}$/.test(t)) t = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        }
        return { time: t, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
      }),
    [liveBars, hasIntraday],
  );

  useEffect(() => {
    if (!chartContainerRef.current || barsQuery.isLoading || !hasLiveData) return;

    const isDark = document.documentElement.classList.contains("dark");

    if (chartInstanceRef.current && candleSeriesRef.current) {
      candleSeriesRef.current.setData(candleData as any);
      priceLineRefsRef.current.forEach(line => candleSeriesRef.current!.removePriceLine(line));
      priceLineRefsRef.current = [];
      priceLines.forEach(pl => {
        const line = candleSeriesRef.current!.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: 1,
          lineStyle: pl.lineStyle,
          axisLabelVisible: true,
          title: pl.title,
        });
        priceLineRefsRef.current.push(line);
      });
      return;
    }

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
      timeScale: { borderColor: isDark ? "#3f3f46" : "#e4e4e7", timeVisible: hasIntraday, secondsVisible: false },
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

    candleSeries.setData(candleData as any);

    priceLines.forEach(pl => {
      const line = candleSeries.createPriceLine({
        price: pl.price,
        color: pl.color,
        lineWidth: 1,
        lineStyle: pl.lineStyle,
        axisLabelVisible: true,
        title: pl.title,
      });
      priceLineRefsRef.current.push(line);
    });

    chart.timeScale().fitContent();

    chartInstanceRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current)
        chartInstanceRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); };
  }, [candleData, hasLiveData, priceLines, barsQuery.isLoading]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        candleSeriesRef.current = null;
        priceLineRefsRef.current = [];
      }
    };
  }, []);

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
            <>
              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30" data-testid="badge-live-data">
                IBKR LIVE
              </Badge>
              <span className="text-[10px] text-muted-foreground" title="Chart refreshes every 30 seconds">
                · updates every 30s
              </span>
            </>
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
          {order.limitPrice != null && order.limitPrice > 0 && (
            <span className="text-[10px] text-muted-foreground" data-testid={`text-order-limit-${order.id}`}>
              Limit: <span className="font-mono font-medium text-foreground">${order.limitPrice.toFixed(2)}</span>
            </span>
          )}
          {order.stopPrice != null && order.stopPrice > 0 && (
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
          {order.submittedAt ? formatDateTime(order.submittedAt, "short") : ""}
        </div>
      </div>
    </div>
  );
}

function SignalPayloadCard({ payload, isLoading }: { payload: Record<string, any> | null; isLoading: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card data-testid="card-signal-payload">
      <CardContent className="p-3">
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-toggle-payload"
        >
          <Code className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium flex-1">Signal Payload</span>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {expanded && (
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : payload ? (
              <pre
                className="text-[11px] leading-relaxed bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-[400px] overflow-y-auto font-mono whitespace-pre-wrap break-all"
                data-testid="text-signal-payload"
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground py-2 text-center" data-testid="text-no-payload">
                No payload data available
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
        <p className="text-[10px] text-muted-foreground mt-1 pl-8 whitespace-pre-wrap break-words">{entry.description}</p>
      )}
    </div>
  );
}

function OptionChartTabs({ symbol, strike, expiration, optionType, entryPrice, tpLevels, slLevels, direction, underlyingPriceBased, underlyingSymbol }: {
  symbol: string;
  strike?: string;
  expiration?: string;
  optionType?: string;
  entryPrice?: number;
  tpLevels: number[];
  slLevels: number[];
  direction?: string;
  underlyingPriceBased?: boolean;
  underlyingSymbol?: string;
}) {
  const showTargetsOnUnderlying = underlyingPriceBased === true;
  const underlyingTicker = underlyingSymbol || symbol;
  const [activeTab, setActiveTab] = useState<"option" | "underlying">(showTargetsOnUnderlying ? "underlying" : "option");

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
          Underlying ({underlyingTicker})
        </button>
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {activeTab === "option" ? optionLabel : underlyingTicker}
        </span>
      </div>
      {activeTab === "option" ? (
        <TradeChart
          key="option-contract"
          symbol={symbol}
          instrumentType="Options"
          strike={strike}
          expiration={expiration}
          optionType={optionType}
          entryPrice={showTargetsOnUnderlying ? undefined : entryPrice}
          tpLevels={showTargetsOnUnderlying ? [] : tpLevels}
          slLevels={showTargetsOnUnderlying ? [] : slLevels}
          direction={direction}
        />
      ) : (
        <TradeChart
          key="underlying-stock"
          symbol={underlyingTicker}
          entryPrice={showTargetsOnUnderlying ? entryPrice : undefined}
          tpLevels={showTargetsOnUnderlying ? tpLevels : []}
          slLevels={showTargetsOnUnderlying ? slLevels : []}
          direction={direction}
        />
      )}
    </div>
  );
}

function LetfChartTabs({ symbol, entryPrice, tpLevels, slLevels, direction, underlyingPriceBased, underlyingSymbol }: {
  symbol: string;
  entryPrice?: number;
  tpLevels: number[];
  slLevels: number[];
  direction?: string;
  underlyingPriceBased?: boolean;
  underlyingSymbol?: string;
}) {
  const underlying = underlyingSymbol || null;
  const showTargetsOnUnderlying = true;
  const [activeTab, setActiveTab] = useState<"letf" | "underlying">(underlying ? "underlying" : "letf");

  if (!underlying) {
    return (
      <TradeChart
        symbol={symbol}
        instrumentType="LETF"
        entryPrice={entryPrice}
        tpLevels={tpLevels}
        slLevels={slLevels}
        direction={direction}
      />
    );
  }

  return (
    <div data-testid="letf-chart-tabs">
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setActiveTab("letf")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === "letf"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-letf-chart"
        >
          <CandlestickChart className="inline-block h-3 w-3 mr-1.5 -mt-0.5" />
          LETF ({symbol})
        </button>
        <button
          onClick={() => setActiveTab("underlying")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === "underlying"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-underlying-chart-letf"
        >
          <BarChart3 className="inline-block h-3 w-3 mr-1.5 -mt-0.5" />
          Underlying ({underlying})
        </button>
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {activeTab === "letf" ? symbol : underlying}
        </span>
      </div>
      {activeTab === "letf" ? (
        <TradeChart
          key="letf-chart"
          symbol={symbol}
          instrumentType="LETF"
          entryPrice={showTargetsOnUnderlying ? undefined : entryPrice}
          tpLevels={showTargetsOnUnderlying ? [] : tpLevels}
          slLevels={showTargetsOnUnderlying ? [] : slLevels}
          direction={direction}
        />
      ) : (
        <TradeChart
          key="letf-underlying"
          symbol={underlying}
          entryPrice={entryPrice}
          tpLevels={tpLevels}
          slLevels={slLevels}
          direction={direction}
        />
      )}
    </div>
  );
}

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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

function extractTargetKey(preview: DiscordPreviewMsg): string | undefined {
  if (preview.type === "target_hit") {
    const match = preview.label.match(/Target\s+(TP\d+)/i);
    return match ? match[1].toLowerCase() : "tp1";
  }
  if (preview.type === "stop_loss_raised") {
    const match = preview.label.match(/\((TP\d+)\)/i);
    return match ? match[1].toLowerCase() : "tp1";
  }
  return undefined;
}

const UPDATE_SIGNAL_LABELS: Record<string, string> = {
  target_hit: "Mark target as hit and update stop loss on signal",
  stop_loss_raised: "Update stop loss level on signal",
  stop_loss_hit: "Mark signal as stopped out",
};

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

function DiscordSendModal({ preview, signalId, open, onOpenChange }: {
  preview: DiscordPreviewMsg;
  signalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [jsonText, setJsonText] = useState(() => buildPayloadJson(preview));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(buildPayloadJson(preview));
    setJsonError(null);
  }, [preview]);

  const livePreview = useMemo(() => {
    const parsed = parseJsonToPreview(jsonText, preview);
    if (!parsed) return null;
    return parsed;
  }, [jsonText, preview]);

  const isEdited = jsonText !== buildPayloadJson(preview);

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

  const sendMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        messageType: preview.type,
        targetKey: extractTargetKey(preview),
      };
      if (isEdited && livePreview) {
        body.customPayload = JSON.parse(jsonText);
      }
      const res = await apiRequest("POST", `/api/signals/${encodeURIComponent(signalId)}/send-discord`, body);
      const result = await res.json();
      if (result.sent === false) {
        throw new Error(result.error || "Discord webhook delivery failed");
      }
      return result;
    },
    onSuccess: () => {
      toast({ title: "Sent", description: `Discord ${preview.label} message sent` });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/by-signal", signalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/discord-messages/by-signal", signalId] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Failed to send Discord message", variant: "destructive" });
    },
  });

  const displayPreview = livePreview || preview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="modal-discord-send">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#5865F2]" />
            Send: {preview.label}
          </DialogTitle>
          <DialogDescription>Edit the embed JSON and preview before sending to Discord</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Embed JSON</p>
              {isEdited && (
                <button
                  onClick={() => { setJsonText(buildPayloadJson(preview)); setJsonError(null); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-reset-json"
                >
                  Reset
                </button>
              )}
            </div>
            <textarea
              value={jsonText}
              onChange={e => handleJsonChange(e.target.value)}
              spellCheck={false}
              className={`w-full rounded-lg border bg-muted/50 p-3 text-[11px] font-mono leading-relaxed resize-none min-h-[50vh] max-h-[60vh] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                jsonError ? "border-red-500/50" : "border-border"
              }`}
              data-testid="textarea-discord-json"
            />
            {jsonError && (
              <p className="text-[11px] text-red-500" data-testid="text-json-error">{jsonError}</p>
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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-discord-send">
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !!jsonError}
            className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
            data-testid="button-confirm-discord-send"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isEdited ? "Send Custom" : "Send to Discord"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscordPreviewSection({ signalId, open }: { signalId: string; open: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [activePreview, setActivePreview] = useState(0);
  const [sendModalOpen, setSendModalOpen] = useState(false);

  const previewQuery = useQuery<DiscordPreviewMsg[]>({
    queryKey: ["/api/signals", signalId, "discord-preview"],
    queryFn: async () => {
      const res = await fetch(`/api/signals/${encodeURIComponent(signalId)}/discord-preview`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!signalId && open,
    staleTime: 60_000,
  });

  const previews = previewQuery.data ?? [];

  if (previewQuery.isLoading) {
    return (
      <Card data-testid="card-discord-preview">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-[#5865F2]" />
            <span className="text-sm font-medium">Discord Messages</span>
          </div>
          <div className="space-y-2 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (previews.length === 0) return null;

  const TYPE_COLORS: Record<string, string> = {
    signal_alert: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    target_hit: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    stop_loss_raised: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    stop_loss_hit: "text-red-500 bg-red-500/10 border-red-500/30",
  };

  const active = previews[activePreview] || previews[0];

  return (
    <>
      <Card data-testid="card-discord-preview">
        <CardContent className="p-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 mb-0 text-left"
            data-testid="button-toggle-discord-preview"
          >
            <MessageSquare className="h-4 w-4 text-[#5865F2]" />
            <span className="text-sm font-medium flex-1">Discord Messages</span>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-discord-count">{previews.length}</Badge>
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>

          {expanded && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-1">
                {previews.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePreview(i)}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                      i === activePreview
                        ? TYPE_COLORS[p.type] || "text-foreground bg-muted border-border"
                        : "text-muted-foreground bg-transparent border-transparent hover:bg-muted/50"
                    }`}
                    data-testid={`button-preview-${p.type}-${i}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="rounded-lg bg-[#313338] p-3 space-y-2">
                {active.content && (
                  <p className="text-[13px] text-[#dbdee1]">{active.content}</p>
                )}
                <DiscordEmbed msg={active} />
              </div>

              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSendModalOpen(true)}
                  className="text-[#5865F2] border-[#5865F2]/30 hover:bg-[#5865F2]/10"
                  data-testid="button-send-discord"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Send to Discord
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {active && (
        <DiscordSendModal
          preview={active}
          signalId={signalId}
          open={sendModalOpen}
          onOpenChange={setSendModalOpen}
        />
      )}
    </>
  );
}

export function SignalDetailDialog({ signal, open, onOpenChange }: {
  signal: Signal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [endTradeOpen, setEndTradeOpen] = useState(false);
  const [endTradeMessage, setEndTradeMessage] = useState(
    "Manage your trade accordingly.",
  );
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

  const sendCurrentStatusMutation = useMutation({
    mutationFn: async () => {
      if (!signal) throw new Error("No signal selected");
      const res = await apiRequest(
        "POST",
        `/api/signals/${encodeURIComponent(signal.id)}/send-current-status`,
      );
      return res.json();
    },
    onSuccess: (result: any) => {
      if (result?.sent === false) {
        toast({
          title: "Failed",
          description: result?.error || "Failed to send current status to Discord",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Sent",
        description: "Current trade status pushed to Discord",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/by-signal", signal.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/discord-messages/by-signal", signal.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed",
        description: err.message || "Failed to send current status",
        variant: "destructive",
      });
    },
  });

  const endTradeMutation = useMutation({
    mutationFn: async () => {
      if (!signal) throw new Error("No signal selected");
      const res = await apiRequest(
        "POST",
        `/api/signals/${encodeURIComponent(signal.id)}/end-trade`,
        { message: endTradeMessage },
      );
      return res.json();
    },
    onSuccess: (result: any) => {
      if (result?.sent === false) {
        toast({
          title: "Ended, but Discord failed",
          description: result?.error || "Trade ended but Discord message failed",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Trade ended",
          description: "Trade closed and gold embed sent to Discord",
        });
      }
      setEndTradeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/by-signal", signal.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/discord-messages/by-signal", signal.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed",
        description: err.message || "Failed to end trade",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (open) {
      setEndTradeMessage("Manage your trade accordingly.");
      setEndTradeOpen(false);
    }
  }, [open, signal?.id]);

  if (!signal) return null;

  const instrumentType = data.instrument_type;
  const direction = data.direction;
  const entryPrice = data.entry_price ? parseFloat(data.entry_price) : undefined;
  const expiration = data.expiration;
  const strike = data.strike;
  const underlyingSymbol = data.underlying_symbol || data.underlying_ticker || null;

  const hitTargetsData = data.hit_targets as Record<string, { hitAt: string; price: number }> | undefined;
  const isStoppedOut = signal.status === "stopped_out";
  const isCompleted = signal.status === "completed";
  const isClosed = signal.status === "closed";
  const autoTrackEnabled = data.auto_track !== false;

  const targets: { key: string; price: number; takeOffPercent?: number; raiseStopLoss?: number; trailingStopPercent?: number; isHit: boolean; hitAt?: string; hitPrice?: number }[] = [];
  if (data.targets && typeof data.targets === "object") {
    for (const [key, val] of Object.entries(data.targets)) {
      const t = val as any;
      if (t && t.price && Number(t.take_off_percent) !== 0) {
        const hit = hitTargetsData?.[key];
        targets.push({
          key,
          price: Number(t.price),
          takeOffPercent: t.take_off_percent ? Number(t.take_off_percent) : undefined,
          raiseStopLoss: t.raise_stop_loss?.price ? Number(t.raise_stop_loss.price) : undefined,
          trailingStopPercent: t.trailing_stop_percent != null ? Number(t.trailing_stop_percent) : undefined,
          isHit: !!hit,
          hitAt: hit?.hitAt,
          hitPrice: hit?.price,
        });
      }
    }
  }
  const tpLevels = targets.map(t => t.price);
  const stopLoss = data.stop_loss !== undefined && data.stop_loss !== null ? Number(data.stop_loss) : undefined;
  const slLevels = stopLoss !== undefined ? [stopLoss] : [];
  const timeStop = data.time_stop || null;
  const hitCount = targets.filter(t => t.isHit).length;

  const orders = ordersQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const ingestEntry = activity.find(a => a.type === "signal_ingested");
  const rawPayload = (ingestEntry?.metadata as any)?.rawSignal ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto" data-testid="dialog-signal-detail">
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
            {data.trade_type && (
              <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30 bg-blue-500/10" data-testid="badge-trade-type">
                {data.trade_type}
              </Badge>
            )}
            {data.alert_mode === "ten_percent" && (
              <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30 bg-amber-500/10" data-testid="badge-alert-mode">
                <Milestone className="mr-1 h-3 w-3" />
                10% Milestones
              </Badge>
            )}
            <Badge
              variant={signal.status === "active" ? "outline" : "secondary"}
              className={`text-xs ${
                isCompleted
                  ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                  : isStoppedOut
                    ? "text-red-500 border-red-500/30 bg-red-500/10"
                    : isClosed
                      ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                      : ""
              }`}
              data-testid="badge-signal-status"
            >
              {isCompleted && <CheckCircle2 className="mr-1 h-3 w-3" />}
              {isStoppedOut && <XCircle className="mr-1 h-3 w-3" />}
              {isStoppedOut ? "Stopped Out" : isCompleted ? "Completed" : isClosed ? "Closed" : signal.status}
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
                {(instrumentType === "Options" || instrumentType === "LETF Option") ? (
                  <OptionChartTabs
                    symbol={ticker}
                    strike={strike}
                    expiration={expiration}
                    optionType={data.option_type || data.right || (data.direction === "Put" ? "P" : data.direction === "Call" ? "C" : undefined)}
                    entryPrice={entryPrice}
                    tpLevels={tpLevels}
                    slLevels={slLevels}
                    direction={direction}
                    underlyingPriceBased={data.underlying_price_based === true}
                    underlyingSymbol={data.underlying_symbol}
                  />
                ) : instrumentType === "LETF" ? (
                  <LetfChartTabs
                    symbol={ticker}
                    entryPrice={entryPrice}
                    tpLevels={tpLevels}
                    slLevels={slLevels}
                    direction={direction}
                    underlyingPriceBased={data.underlying_price_based === true}
                    underlyingSymbol={data.underlying_symbol}
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

            <DiscordPreviewSection signalId={signal.id} open={open} />

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
            <Card data-testid="card-trade-actions">
              <CardContent className="p-3 space-y-2">
                <h3 className="text-sm font-medium">Trade Actions</h3>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => sendCurrentStatusMutation.mutate()}
                  disabled={
                    signal.status !== "active" || sendCurrentStatusMutation.isPending
                  }
                  data-testid="button-send-current-status"
                >
                  {sendCurrentStatusMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Send Current Status
                </Button>
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black border-none"
                  onClick={() => setEndTradeOpen(true)}
                  disabled={signal.status !== "active" || endTradeMutation.isPending}
                  data-testid="button-end-trade"
                >
                  End Trade
                </Button>
              </CardContent>
            </Card>

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

                  {(instrumentType === "Options" || instrumentType === "LETF Option") && expiration && (
                    <div className="flex items-center justify-between" data-testid="detail-expiration">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3 w-3" /> Expiration
                      </span>
                      <span className="text-sm font-medium">{expiration}</span>
                    </div>
                  )}

                  {(instrumentType === "Options" || instrumentType === "LETF Option") && strike && (
                    <div className="flex items-center justify-between" data-testid="detail-strike">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Target className="h-3 w-3" /> Strike
                      </span>
                      <span className="font-mono font-semibold text-sm">${strike}</span>
                    </div>
                  )}

                  {underlyingSymbol && (instrumentType === "LETF" || instrumentType === "LETF Option") && (
                    <div className="flex items-center justify-between" data-testid="detail-letf-underlying">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3" /> Underlying
                      </span>
                      <span className="font-mono font-semibold text-sm">{underlyingSymbol}</span>
                    </div>
                  )}

                  {(instrumentType === "Options" || instrumentType === "LETF" || instrumentType === "LETF Option") && (
                    <div className="flex items-center justify-between" data-testid="detail-price-basis">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <BarChart3 className="h-3 w-3" /> Price Basis
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${data.underlying_price_based === true ? "text-purple-500 border-purple-500/30 bg-purple-500/5" : "text-blue-500 border-blue-500/30 bg-blue-500/5"}`}
                        data-testid="badge-price-basis"
                      >
                        {data.underlying_price_based === true
                          ? `Underlying${underlyingSymbol ? ` (${underlyingSymbol})` : ""} Price`
                          : instrumentType === "Options" || instrumentType === "LETF Option"
                            ? "Option Premium"
                            : "LETF Price"}
                      </Badge>
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

                  <div className="flex items-center justify-between" data-testid="detail-auto-track">
                    <span className="text-xs text-muted-foreground">Auto Tracking</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        autoTrackEnabled
                          ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5"
                          : "text-amber-500 border-amber-500/30 bg-amber-500/5"
                      }`}
                    >
                      {autoTrackEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between" data-testid="detail-created">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-[10px]">
                      {signal.createdAt ? formatDateTime(signal.createdAt, "full") : ""}
                    </span>
                  </div>
                </div>

                {(targets.length > 0 || (isCompleted || isStoppedOut)) && (
                  <>
                    <Separator />
                    <div data-testid="detail-trade-status">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-primary/70" />
                          <span className="text-[10px] font-medium text-primary/80 uppercase tracking-wider">Trade Status</span>
                        </div>
                        {targets.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {hitCount}/{targets.length} hit
                          </span>
                        )}
                      </div>
                      {isCompleted && (
                        <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 mb-2" data-testid="status-completed">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-500">All targets reached</span>
                        </div>
                      )}
                      {isStoppedOut && (
                        <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 mb-2" data-testid="status-stopped-out">
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                          <span className="text-xs font-medium text-red-500">Stop loss triggered</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {targets.length > 0 && (
                  <>
                    <Separator />
                    <div data-testid="detail-targets">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Crosshair className="h-3.5 w-3.5 text-emerald-500/70" />
                        <span className="text-[10px] font-medium text-emerald-500/80 uppercase tracking-wider">Targets</span>
                      </div>
                      <div className="space-y-1.5">
                        {targets.map((t, i) => (
                          <div
                            key={i}
                            className={`flex items-center justify-between rounded-md px-2 py-1.5 border ${
                              t.isHit
                                ? "border-emerald-500/30 bg-emerald-500/10"
                                : "border-border bg-muted/30"
                            }`}
                            data-testid={`detail-target-${t.key}`}
                          >
                            <div className="flex items-center gap-1.5">
                              {t.isHit
                                ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                : <Crosshair className="h-3 w-3 text-muted-foreground" />
                              }
                              <span className={`text-xs font-mono font-semibold ${t.isHit ? "text-emerald-500" : "text-foreground"}`}>
                                {t.key.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-xs font-medium ${t.isHit ? "text-emerald-400" : "text-foreground"}`}>
                                ${t.price}
                              </span>
                              {t.takeOffPercent && (
                                <span className="text-[10px] text-muted-foreground">({t.takeOffPercent}%)</span>
                              )}
                              {t.trailingStopPercent != null && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-purple-500 border-purple-500/30 bg-purple-500/5">
                                  {t.trailingStopPercent}% trail
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {targets.some(t => t.isHit && t.hitPrice) && (
                        <div className="mt-2 space-y-1">
                          {targets.filter(t => t.isHit && t.hitAt).map((t, i) => (
                            <p key={i} className="text-[10px] text-muted-foreground">
                              {t.key.toUpperCase()} hit at ${t.hitPrice?.toFixed(2)} — {t.hitAt ? formatDateTime(t.hitAt, "short") : ""}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {data.alert_mode === "ten_percent" && (
                  <>
                    <Separator />
                    <div data-testid="detail-milestone-tracking">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Milestone className="h-3.5 w-3.5 text-amber-500/70" />
                        <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wider">Milestone Tracking</span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-md px-2 py-1.5 border border-amber-500/30 bg-amber-500/10">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3 w-3 text-amber-500" />
                            <span className="text-xs font-semibold text-amber-500">Current Milestone</span>
                          </div>
                          <span className="font-mono text-sm font-bold text-amber-400" data-testid="text-current-milestone">
                            {data.last_milestone_alerted ? `+${data.last_milestone_alerted}%` : "—"}
                          </span>
                        </div>

                        {data.entry_instrument_price != null && (
                          <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
                            <span>Entry (instrument)</span>
                            <span className="font-mono font-medium text-foreground" data-testid="text-entry-instrument-price">
                              ${Number(data.entry_instrument_price).toFixed(2)}
                            </span>
                          </div>
                        )}

                        {data.current_instrument_price != null && (
                          <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
                            <span>Latest tracked price</span>
                            <span className="font-mono font-medium text-foreground" data-testid="text-current-instrument-price">
                              ${Number(data.current_instrument_price).toFixed(2)}
                            </span>
                          </div>
                        )}

                        {data.entry_instrument_price != null && data.current_instrument_price != null && (
                          <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
                            <span>Profit</span>
                            {(() => {
                              const entry = Number(data.entry_instrument_price);
                              const current = Number(data.current_instrument_price);
                              const pct = entry > 0 ? ((current - entry) / entry) * 100 : 0;
                              const isPositive = pct >= 0;
                              return (
                                <span className={`font-mono font-semibold ${isPositive ? "text-emerald-500" : "text-red-500"}`} data-testid="text-milestone-profit">
                                  {isPositive ? "+" : ""}{pct.toFixed(1)}%
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {data.milestone_trailing_stop_active && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <ShieldAlert className="h-3.5 w-3.5 text-purple-500/70" />
                            <span className="text-[10px] font-medium text-purple-500/80 uppercase tracking-wider">Trailing Stop</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-purple-500 border-purple-500/30 bg-purple-500/5">
                              ${(data.milestone_trailing_stop_amount != null
                                ? Number(data.milestone_trailing_stop_amount)
                                : data.entry_instrument_price != null && data.milestone_trailing_stop_percent
                                  ? Number(data.entry_instrument_price) * Number(data.milestone_trailing_stop_percent) / 100
                                  : 0
                              ).toFixed(2)} trail ({data.milestone_trailing_stop_percent}% of entry)
                            </Badge>
                          </div>
                          <div
                            className={`flex items-center justify-between rounded-md px-2 py-1.5 border ${
                              isStoppedOut
                                ? "border-red-500/30 bg-red-500/10"
                                : "border-purple-500/30 bg-purple-500/10"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              {isStoppedOut
                                ? <XCircle className="h-3 w-3 text-red-500" />
                                : <ShieldAlert className="h-3 w-3 text-purple-500" />
                              }
                              <span className={`text-xs font-semibold ${isStoppedOut ? "text-red-500" : "text-purple-400"}`}>
                                {isStoppedOut ? "Triggered" : "Active"}
                              </span>
                            </div>
                            <span className={`font-mono text-xs font-medium ${isStoppedOut ? "text-red-400" : "text-foreground"}`} data-testid="text-milestone-stop-level">
                              ${data.current_stop_loss != null ? Number(data.current_stop_loss).toFixed(2) : "—"}
                            </span>
                          </div>
                          {data.milestone_trailing_stop_high != null && !isStoppedOut && (
                            <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
                              <span>Highest price</span>
                              <span className="font-mono font-medium text-foreground" data-testid="text-milestone-high">
                                ${Number(data.milestone_trailing_stop_high).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {!data.milestone_trailing_stop_active && !isStoppedOut && (
                        <div className="mt-2 px-2">
                          <p className="text-[10px] text-muted-foreground italic">
                            Trailing stop activates at +50% milestone (trails 30% of entry price)
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {data.alert_mode !== "ten_percent" && (stopLoss !== undefined || data.trailing_stop_active || data.current_stop_loss != null) && (
                  <>
                    <Separator />
                    <div data-testid="detail-stop-loss">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ShieldAlert className="h-3.5 w-3.5 text-red-500/70" />
                        <span className="text-[10px] font-medium text-red-500/80 uppercase tracking-wider">
                          {data.trailing_stop_active ? "Trailing Stop" : "Stop Loss"}
                        </span>
                        {data.trailing_stop_active && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-purple-500 border-purple-500/30 bg-purple-500/5">
                            {data.trailing_stop_percent}% trail
                          </Badge>
                        )}
                      </div>
                      <div
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 border ${
                          isStoppedOut
                            ? "border-red-500/30 bg-red-500/10"
                            : data.trailing_stop_active
                              ? "border-purple-500/30 bg-purple-500/10"
                              : "border-border bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isStoppedOut
                            ? <XCircle className="h-3 w-3 text-red-500" />
                            : <ShieldAlert className="h-3 w-3 text-muted-foreground" />
                          }
                          <span className={`text-xs font-semibold ${isStoppedOut ? "text-red-500" : "text-foreground"}`}>
                            {isStoppedOut ? "Triggered" : data.trailing_stop_active ? "Trailing" : "Active"}
                          </span>
                        </div>
                        <span className={`font-mono text-xs font-medium ${isStoppedOut ? "text-red-400" : "text-foreground"}`}>
                          ${data.current_stop_loss ?? stopLoss}
                        </span>
                      </div>
                      {data.trailing_stop_active && data.trailing_stop_high != null && !isStoppedOut && (
                        <div className="flex items-center justify-between mt-1 px-2 text-[10px] text-muted-foreground">
                          <span>High watermark: ${data.trailing_stop_high}</span>
                        </div>
                      )}
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

            <SignalPayloadCard payload={rawPayload} isLoading={activityQuery.isLoading} />
          </div>
        </div>
      </DialogContent>
      <Dialog open={endTradeOpen} onOpenChange={setEndTradeOpen}>
        <DialogContent className="max-w-xl" data-testid="dialog-end-trade">
          <DialogHeader>
            <DialogTitle>End Trade</DialogTitle>
            <DialogDescription>
              Are you okay to end the trade?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Manage Your Trade Accordingly Message
            </p>
            <textarea
              value={endTradeMessage}
              onChange={(e) => setEndTradeMessage(e.target.value)}
              className="w-full rounded-md border bg-background p-2 text-sm min-h-[96px]"
              data-testid="textarea-end-trade-message"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndTradeOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black border-none"
              onClick={() => endTradeMutation.mutate()}
              disabled={endTradeMutation.isPending}
              data-testid="button-confirm-end-trade"
            >
              {endTradeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Confirm End Trade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
