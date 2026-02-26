import { useEffect, useRef, useMemo } from "react";
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

function buildTradingViewSymbol(params: {
  symbol: string;
  instrumentType?: string;
  strike?: string;
  expiration?: string;
  optionType?: string;
}): string {
  if (params.instrumentType === "Options" && params.strike && params.expiration) {
    const exp = params.expiration.replace(/-/g, "");
    const right = params.optionType?.toUpperCase().startsWith("P") ? "P" : "C";
    const strike = parseFloat(params.strike).toFixed(0);
    return `OPRA:${params.symbol.toUpperCase()}${exp}${right}${strike}`;
  }
  return params.symbol.toUpperCase();
}

function TradingViewChart({ symbol, instrumentType, strike, expiration, optionType }: {
  symbol: string;
  instrumentType?: string;
  strike?: string;
  expiration?: string;
  optionType?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const tvSymbol = useMemo(
    () => buildTradingViewSymbol({ symbol, instrumentType, strike, expiration, optionType }),
    [symbol, instrumentType, strike, expiration, optionType],
  );

  const isOption = instrumentType === "Options";
  const chartLabel = isOption && strike && expiration
    ? `${symbol} $${strike} ${expiration}`
    : symbol;

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
      symbol: tvSymbol,
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
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [tvSymbol]);

  return (
    <div data-testid="trading-chart-wrapper">
      <div className="flex items-center gap-2 mb-2">
        {isOption ? <CandlestickChart className="h-4 w-4 text-blue-500" /> : <BarChart3 className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium" data-testid="text-chart-label">
          {isOption ? "Option Contract" : "Trade Chart"}
        </span>
        <span className="text-xs text-muted-foreground font-mono" data-testid="text-chart-symbol">— {chartLabel}</span>
      </div>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height: 400 }} data-testid="trading-chart" />
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
                <TradingViewChart
                  symbol={ticker}
                  instrumentType={instrumentType}
                  strike={strike}
                  expiration={expiration}
                  optionType={data.option_type}
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
