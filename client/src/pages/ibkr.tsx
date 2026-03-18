import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Layers,
  History,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Wallet,
  ShieldCheck,
  Activity,
  Plug,
  Unplug,
  Loader2,
  Bug,
} from "lucide-react";
import type { IbkrOrder, IbkrPosition, Integration, ConnectedApp } from "@shared/schema";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/formatters";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type { ElementType } from "react";

const PAGE_SIZE = 10;

function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMouseLeave = useCallback(() => {
    state.current.isDown = false;
    if (ref.current) {
      ref.current.style.cursor = "grab";
      ref.current.style.userSelect = "";
    }
  }, []);

  const onMouseUp = useCallback(() => {
    state.current.isDown = false;
    if (ref.current) {
      ref.current.style.cursor = "grab";
      ref.current.style.userSelect = "";
    }
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!state.current.isDown || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - state.current.startX) * 1.5;
    ref.current.scrollLeft = state.current.scrollLeft - walk;
  }, []);

  return { ref, onMouseDown, onMouseLeave, onMouseUp, onMouseMove };
}

function Pagination({ currentPage, totalPages, onPageChange, totalItems, label }: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  label: string;
}) {
  if (totalPages <= 1) return null;
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalItems);
  return (
    <div className="flex items-center justify-between pt-3 px-1" data-testid={`pagination-${label}`}>
      <p className="text-xs text-muted-foreground">
        Showing {start}-{end} of {totalItems} {label}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          data-testid={`button-prev-${label}`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground px-2">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          data-testid={`button-next-${label}`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function formatExpiration(exp: string | null | undefined): string {
  if (!exp) return "";
  if (exp.length === 8) {
    return `${exp.slice(4, 6)}/${exp.slice(6, 8)}/${exp.slice(2, 4)}`;
  }
  return exp;
}

function SymbolDisplay({ symbol, secType, expiration, strike, right }: {
  symbol: string;
  secType: string;
  expiration?: string | null;
  strike?: number | null;
  right?: string | null;
}) {
  if (secType === "OPT" && (expiration || strike || right)) {
    const rightLabel = right === "C" || right === "CALL" ? "C" : right === "P" || right === "PUT" ? "P" : right;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-sm">{symbol}</span>
        <span className="text-[11px] text-muted-foreground font-mono">
          {formatExpiration(expiration)} {strike != null ? `$${strike}` : ""} {rightLabel || ""}
        </span>
      </div>
    );
  }
  return <span className="font-semibold text-sm">{symbol}</span>;
}

function OrderStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2; label: string }> = {
    filled: { variant: "default", icon: CheckCircle2, label: "Filled" },
    submitted: { variant: "outline", icon: Clock, label: "Submitted" },
    pending: { variant: "secondary", icon: AlertCircle, label: "Pending" },
    cancelled: { variant: "destructive", icon: XCircle, label: "Cancelled" },
    partial: { variant: "outline", icon: AlertCircle, label: "Partial" },
    rejected: { variant: "destructive", icon: XCircle, label: "Rejected" },
  };
  const config = variants[status] || variants.submitted;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="text-xs" data-testid={`badge-order-status-${status}`}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function SideBadge({ side }: { side: string }) {
  const isBuy = side === "buy";
  return (
    <Badge
      variant="outline"
      className={`text-xs font-semibold ${isBuy ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400" : "border-red-500/50 text-red-600 dark:text-red-400"}`}
    >
      {isBuy ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
      {side.toUpperCase()}
    </Badge>
  );
}

function ConnectionStatus({ integrations }: { integrations: Integration[] }) {
  const { toast } = useToast();

  const { data: statusMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/ibkr/status"],
    refetchInterval: 5000,
  });

  const connectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      await apiRequest("POST", `/api/ibkr/connect/${integrationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ibkr/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ibkr/account-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Connected", description: "IBKR connection established" });
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      await apiRequest("POST", `/api/ibkr/disconnect/${integrationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ibkr/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ibkr/account-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Disconnected", description: "IBKR connection closed" });
    },
    onError: (err: Error) => {
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" });
    },
  });

  if (integrations.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {integrations.map((integration) => {
        const cfg = integration.config as Record<string, any> | null;
        const connStatus = statusMap[integration.id] || "disconnected";
        const isConnected = connStatus === "connected";
        const isTransitioning = connStatus === "connecting" || connStatus === "disconnecting";
        const isBusy = isTransitioning
          || (connectMutation.isPending && connectMutation.variables === integration.id)
          || (disconnectMutation.isPending && disconnectMutation.variables === integration.id);
        const statusStyles: Record<string, { bg: string; icon: string; badge: string; label: string }> = {
          connected: { bg: "bg-emerald-500/10", icon: "text-emerald-500", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15", label: "Connected" },
          connecting: { bg: "bg-amber-500/10", icon: "text-amber-500", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15", label: "Connecting..." },
          disconnecting: { bg: "bg-amber-500/10", icon: "text-amber-500", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15", label: "Disconnecting..." },
          disconnected: { bg: "bg-muted", icon: "text-muted-foreground", badge: "", label: "Disconnected" },
        };
        const ss = statusStyles[connStatus] || statusStyles.disconnected;

        return (
          <Card key={integration.id} data-testid={`card-connection-${integration.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${ss.bg}`}>
                    {isTransitioning
                      ? <Loader2 className={`h-4 w-4 animate-spin ${ss.icon}`} />
                      : isConnected
                        ? <Plug className={`h-4 w-4 ${ss.icon}`} />
                        : <Unplug className={`h-4 w-4 ${ss.icon}`} />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" data-testid={`text-connection-name-${integration.id}`}>{integration.name}</p>
                    <div className="flex items-center gap-2">
                      {cfg?.accountId && (
                        <span className="text-xs text-muted-foreground font-mono">{cfg.accountId}</span>
                      )}
                      <Badge
                        variant={isConnected ? "default" : "secondary"}
                        className={`text-[10px] px-1.5 py-0 ${ss.badge}`}
                        data-testid={`badge-status-${integration.id}`}
                      >
                        {ss.label}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Button
                  variant={isConnected ? "outline" : "default"}
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  disabled={isBusy}
                  onClick={() => isConnected
                    ? disconnectMutation.mutate(integration.id)
                    : connectMutation.mutate(integration.id)
                  }
                  data-testid={`button-toggle-connection-${integration.id}`}
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isConnected ? (
                    <>
                      <Unplug className="h-3.5 w-3.5 mr-1.5" />
                      Disconnect
                    </>
                  ) : (
                    <>
                      <Plug className="h-3.5 w-3.5 mr-1.5" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface AccountSummary {
  accountId: string;
  netLiquidation: number | null;
  totalCashValue: number | null;
  buyingPower: number | null;
  grossPositionValue: number | null;
  availableFunds: number | null;
  excessLiquidity: number | null;
  settledCash: number | null;
  accruedCash: number | null;
  cushion: number | null;
  maintMarginReq: number | null;
  initMarginReq: number | null;
  unrealizedPnL: number | null;
  realizedPnL: number | null;
  dailyPnL: number | null;
  lastUpdated: string;
}

function PnlValue({ value, prefix }: { value: number | null; prefix?: string }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const isPositive = value >= 0;
  return (
    <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
      {prefix}{isPositive ? "+" : ""}{formatCurrency(value)}
    </span>
  );
}

function AccountOverview({ accountSummary }: { accountSummary: AccountSummary[] }) {
  if (accountSummary.length === 0) return null;

  return (
    <div className="space-y-3">
      {accountSummary.map((acct) => (
        <Card key={acct.accountId} data-testid={`card-account-overview-${acct.accountId}`}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-purple-500" />
                <CardTitle className="text-sm font-semibold">{acct.accountId}</CardTitle>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Updated {formatRelativeTime(acct.lastUpdated)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <MetricTile
                label="Net Liquidation"
                value={acct.netLiquidation != null ? formatCurrency(acct.netLiquidation) : "—"}
                icon={DollarSign}
                accent="text-blue-500"
                testId="metric-net-liq"
                accountId={acct.accountId}
              />
              <MetricTile
                label="Buying Power"
                value={acct.buyingPower != null ? formatCurrency(acct.buyingPower) : "—"}
                icon={ShieldCheck}
                accent="text-emerald-500"
                testId="metric-buying-power"
                accountId={acct.accountId}
              />
              <MetricTile
                label="Daily P&L"
                value={<PnlValue value={acct.dailyPnL} />}
                icon={Activity}
                accent="text-amber-500"
                testId="metric-daily-pnl"
                accountId={acct.accountId}
              />
              <MetricTile
                label="Unrealized P&L"
                value={<PnlValue value={acct.unrealizedPnL} />}
                icon={TrendingUp}
                accent="text-cyan-500"
                testId="metric-unrealized-pnl"
                accountId={acct.accountId}
              />
              <MetricTile
                label="Realized P&L"
                value={<PnlValue value={acct.realizedPnL} />}
                icon={BarChart3}
                accent="text-purple-500"
                testId="metric-realized-pnl"
                accountId={acct.accountId}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
              <MetricTile
                label="Cash Balance"
                value={acct.totalCashValue != null ? formatCurrency(acct.totalCashValue) : "—"}
                icon={Wallet}
                accent="text-green-500"
                testId="metric-cash"
                accountId={acct.accountId}
                small
              />
              <MetricTile
                label="Gross Position Value"
                value={acct.grossPositionValue != null ? formatCurrency(acct.grossPositionValue) : "—"}
                icon={Layers}
                accent="text-indigo-500"
                testId="metric-gross-pos"
                accountId={acct.accountId}
                small
              />
              <MetricTile
                label="Available Funds"
                value={acct.availableFunds != null ? formatCurrency(acct.availableFunds) : "—"}
                icon={DollarSign}
                accent="text-teal-500"
                testId="metric-avail-funds"
                accountId={acct.accountId}
                small
              />
              <MetricTile
                label="Excess Liquidity"
                value={acct.excessLiquidity != null ? formatCurrency(acct.excessLiquidity) : "—"}
                icon={ShieldCheck}
                accent="text-sky-500"
                testId="metric-excess-liq"
                accountId={acct.accountId}
                small
              />
              <MetricTile
                label="Margin Cushion"
                value={acct.cushion != null ? `${(acct.cushion * 100).toFixed(1)}%` : "—"}
                icon={ShieldCheck}
                accent="text-orange-500"
                testId="metric-cushion"
                accountId={acct.accountId}
                small
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MetricTile({ label, value, icon: Icon, accent, testId, small, accountId }: {
  label: string;
  value: React.ReactNode;
  icon: ElementType;
  accent: string;
  testId: string;
  small?: boolean;
  accountId?: string;
}) {
  const fullTestId = accountId ? `${testId}-${accountId}` : testId;
  return (
    <div className={`rounded-lg border bg-card p-3 ${small ? "py-2" : ""}`} data-testid={fullTestId}>
      <div className="flex items-center justify-between mb-1">
        <p className={`font-medium text-muted-foreground uppercase tracking-wider ${small ? "text-[10px]" : "text-[11px]"}`}>{label}</p>
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
      </div>
      <p className={`font-bold ${small ? "text-sm" : "text-lg"}`}>{value}</p>
    </div>
  );
}

function SummaryCards({ orders, positions }: { orders: IbkrOrder[]; positions: IbkrPosition[] }) {
  const pendingOrders = orders.filter(o => o.status === "pending" || o.status === "submitted");
  const optionPositions = positions.filter(p => p.secType === "OPT");
  const stockPositions = positions.filter(p => p.secType !== "OPT");

  const cards: { title: string; value: string; icon: ElementType; accent: string }[] = [
    { title: "Open Positions", value: positions.length.toString(), icon: Layers, accent: "text-blue-500" },
    { title: "Stock Positions", value: stockPositions.length.toString(), icon: BarChart3, accent: "text-purple-500" },
    { title: "Option Positions", value: optionPositions.length.toString(), icon: TrendingUp, accent: "text-emerald-500" },
    { title: "Pending Orders", value: pendingOrders.length.toString(), icon: Clock, accent: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.title} data-testid={`card-summary-${card.title.toLowerCase().replace(/[^a-z]/g, "-")}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.title}</p>
              <card.icon className={`h-4 w-4 ${card.accent}`} />
            </div>
            <p className="text-xl font-bold">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrdersTable({ orders, page, onPageChange }: { orders: IbkrOrder[]; page: number; onPageChange: (p: number) => void }) {
  const drag = useDragScroll();

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No orders found"
        description="Orders will appear here when trades are executed through IBKR"
      />
    );
  }

  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  const clampedPage = Math.min(page, totalPages);
  const paged = orders.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <div>
      <div
        ref={drag.ref}
        className="rounded-lg border overflow-x-auto cursor-grab"
        onMouseDown={drag.onMouseDown}
        onMouseLeave={drag.onMouseLeave}
        onMouseUp={drag.onMouseUp}
        onMouseMove={drag.onMouseMove}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-medium">Symbol</TableHead>
              <TableHead className="text-xs font-medium">App</TableHead>
              <TableHead className="text-xs font-medium">Side</TableHead>
              <TableHead className="text-xs font-medium">Type</TableHead>
              <TableHead className="text-xs font-medium text-right">Qty</TableHead>
              <TableHead className="text-xs font-medium text-right">Filled</TableHead>
              <TableHead className="text-xs font-medium text-right">Mkt Price</TableHead>
              <TableHead className="text-xs font-medium">Status</TableHead>
              <TableHead className="text-xs font-medium">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.flatMap((order) => {
              const rows = [
                <TableRow key={order.id} data-testid={`row-order-${order.id}`} className={order.status === "rejected" && order.rejectReason ? "border-b-0" : ""}>
                  <TableCell><SymbolDisplay symbol={order.symbol} secType={order.secType} expiration={order.expiration} strike={order.strike} right={order.right} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground" data-testid={`text-app-${order.id}`}>{order.sourceAppName || "—"}</TableCell>
                  <TableCell><SideBadge side={order.side} /></TableCell>
                  <TableCell className="text-xs capitalize">{order.orderType.replace("_", " ")}</TableCell>
                  <TableCell className="text-right text-sm">{formatNumber(order.quantity)}</TableCell>
                  <TableCell className="text-right text-sm">{formatNumber(order.filledQuantity)}</TableCell>
                  <TableCell className="text-right text-sm font-mono" data-testid={`text-mkt-price-${order.id}`}>{order.lastPrice ? formatCurrency(order.lastPrice) : "—"}</TableCell>
                  <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(order.submittedAt)}
                  </TableCell>
                </TableRow>,
              ];
              if (order.status === "rejected" && order.rejectReason) {
                rows.push(
                  <TableRow key={`${order.id}-reason`} className="hover:bg-transparent" data-testid={`row-reject-reason-${order.id}`}>
                    <TableCell colSpan={9} className="pt-0 pb-3 pl-6">
                      <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-3 py-1.5">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span data-testid={`text-reject-reason-${order.id}`}>{order.rejectReason}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              return rows;
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination currentPage={clampedPage} totalPages={totalPages} onPageChange={onPageChange} totalItems={orders.length} label="orders" />
    </div>
  );
}

function RejectionDiagnostics({ orders }: { orders: IbkrOrder[] }) {
  const rejected = orders.filter(o => o.status === "rejected");
  const withReason = rejected.filter(o => o.rejectReason);
  const withoutReason = rejected.filter(o => !o.rejectReason);

  const reasonCounts: Record<string, number> = {};
  for (const o of withReason) {
    const reason = o.rejectReason!;
    const codeMatch = reason.match(/\[(\d{3,5})\]/);
    let category: string;
    if (codeMatch) {
      const code = codeMatch[1];
      const afterCode = reason.slice(reason.indexOf(codeMatch[0]) + codeMatch[0].length).trim();
      const label = afterCode.split(":")[0].trim();
      category = label ? `[${code}] ${label}` : `[${code}]`;
    } else {
      category = reason.length > 80 ? reason.slice(0, 80) + "..." : reason;
    }
    reasonCounts[category] = (reasonCounts[category] || 0) + 1;
  }
  const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);

  const recentRejected = rejected
    .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime())
    .slice(0, 10);

  const filled = orders.filter(o => o.status === "filled").length;
  const total = orders.length;
  const rejectRate = total > 0 ? ((rejected.length / total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4" data-testid="section-rejection-diagnostics">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Orders</div>
            <div className="text-2xl font-bold" data-testid="text-total-orders">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Filled</div>
            <div className="text-2xl font-bold text-emerald-600" data-testid="text-filled-orders">{filled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Rejected</div>
            <div className="text-2xl font-bold text-red-600" data-testid="text-rejected-orders">{rejected.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Rejection Rate</div>
            <div className="text-2xl font-bold text-red-600" data-testid="text-reject-rate">{rejectRate}%</div>
          </CardContent>
        </Card>
      </div>

      {sortedReasons.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rejection Reasons</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {sortedReasons.map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between gap-4 text-sm" data-testid={`row-reason-category-${reason}`}>
                  <span className="text-red-600 dark:text-red-400 font-mono text-xs">{reason}</span>
                  <Badge variant="outline" className="shrink-0">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {withoutReason.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span data-testid="text-no-reason-count">{withoutReason.length} rejected order{withoutReason.length === 1 ? "" : "s"} from before reason tracking was added (reason not captured)</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Rejections</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentRejected.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No rejections"
              description="No rejected orders found"
            />
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-medium">Symbol</TableHead>
                    <TableHead className="text-xs font-medium">Side</TableHead>
                    <TableHead className="text-xs font-medium">Type</TableHead>
                    <TableHead className="text-xs font-medium">Time</TableHead>
                    <TableHead className="text-xs font-medium">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRejected.map((order) => (
                    <TableRow key={order.id} data-testid={`row-diag-${order.id}`}>
                      <TableCell>
                        <SymbolDisplay symbol={order.symbol} secType={order.secType} expiration={order.expiration} strike={order.strike} right={order.right} />
                      </TableCell>
                      <TableCell><SideBadge side={order.side} /></TableCell>
                      <TableCell className="text-xs">{order.secType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {order.submittedAt ? new Date(order.submittedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-red-600 dark:text-red-400" data-testid={`text-diag-reason-${order.id}`}>
                          {order.rejectReason || "Reason not captured (pre-tracking)"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PositionsTable({ positions, page, onPageChange }: { positions: IbkrPosition[]; page: number; onPageChange: (p: number) => void }) {
  const drag = useDragScroll();

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No open positions"
        description="Active positions from IBKR accounts will appear here"
      />
    );
  }

  const totalPages = Math.ceil(positions.length / PAGE_SIZE);
  const clampedPage = Math.min(page, totalPages);
  const paged = positions.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <div>
      <div
        ref={drag.ref}
        className="rounded-lg border overflow-x-auto cursor-grab"
        onMouseDown={drag.onMouseDown}
        onMouseLeave={drag.onMouseLeave}
        onMouseUp={drag.onMouseUp}
        onMouseMove={drag.onMouseMove}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-medium">Symbol</TableHead>
              <TableHead className="text-xs font-medium">Type</TableHead>
              <TableHead className="text-xs font-medium text-right">Qty</TableHead>
              <TableHead className="text-xs font-medium text-right">Avg Cost</TableHead>
              <TableHead className="text-xs font-medium text-right">Mkt Price</TableHead>
              <TableHead className="text-xs font-medium text-right">Mkt Value</TableHead>
              <TableHead className="text-xs font-medium text-right">Unrealized P&L</TableHead>
              <TableHead className="text-xs font-medium text-right">Realized P&L</TableHead>
              <TableHead className="text-xs font-medium">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((pos) => {
              const unrealizedPnl = pos.unrealizedPnl ?? null;
              const realizedPnl = pos.realizedPnl ?? null;
              return (
                <TableRow key={pos.id} data-testid={`row-position-${pos.id}`}>
                  <TableCell><SymbolDisplay symbol={pos.symbol} secType={pos.secType} expiration={pos.expiration} strike={pos.strike} right={pos.right} /></TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {pos.secType === "OPT" ? "Option" : pos.secType === "STK" ? "Stock" : pos.secType}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right text-sm font-medium ${pos.quantity >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {pos.quantity >= 0 ? "+" : ""}{formatNumber(pos.quantity)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{formatCurrency(pos.avgCost)}</TableCell>
                  <TableCell className="text-right text-sm font-mono" data-testid={`text-mkt-price-${pos.id}`}>
                    {pos.marketPrice != null ? formatCurrency(pos.marketPrice) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono" data-testid={`text-mkt-value-${pos.id}`}>
                    {pos.marketValue != null ? formatCurrency(pos.marketValue) : "—"}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-mono font-medium ${unrealizedPnl != null ? (unrealizedPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : ""}`} data-testid={`text-unrealized-pnl-${pos.id}`}>
                    {unrealizedPnl != null ? `${unrealizedPnl >= 0 ? "+" : ""}${formatCurrency(unrealizedPnl)}` : "—"}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-mono font-medium ${realizedPnl != null ? (realizedPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : ""}`} data-testid={`text-realized-pnl-${pos.id}`}>
                    {realizedPnl != null ? `${realizedPnl >= 0 ? "+" : ""}${formatCurrency(realizedPnl)}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(pos.lastUpdated)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination currentPage={clampedPage} totalPages={totalPages} onPageChange={onPageChange} totalItems={positions.length} label="positions" />
    </div>
  );
}

export default function IbkrPage() {
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [ordersAppFilter, setOrdersAppFilter] = useState<string>("all");
  const [positionsAppFilter, setPositionsAppFilter] = useState<string>("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("orders");
  const [ordersPage, setOrdersPage] = useState(1);
  const [positionsPage, setPositionsPage] = useState(1);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<IbkrOrder[]>({
    queryKey: ["/api/ibkr/orders"],
    refetchInterval: 5000,
  });

  const { data: positions = [], isLoading: positionsLoading } = useQuery<IbkrPosition[]>({
    queryKey: ["/api/ibkr/positions"],
    refetchInterval: 5000,
  });

  const { data: accountSummary = [] } = useQuery<AccountSummary[]>({
    queryKey: ["/api/ibkr/account-summary"],
    refetchInterval: 10000,
  });

  const { data: ibkrIntegrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
    select: (data: Integration[]) => data.filter(i => i.type === "ibkr"),
  });

  const { data: connectedApps = [] } = useQuery<ConnectedApp[]>({
    queryKey: ["/api/connected-apps"],
  });

  const effectiveAccount = ibkrIntegrations.length === 1
    ? ibkrIntegrations[0].id
    : selectedAccount;

  const selectedIntegration = effectiveAccount !== "all"
    ? ibkrIntegrations.find(i => i.id === effectiveAccount)
    : null;
  const selectedAccountId = selectedIntegration
    ? (selectedIntegration.config as Record<string, any> | null)?.accountId
    : null;

  const accountOrders = effectiveAccount !== "all"
    ? orders.filter(o => o.integrationId === effectiveAccount)
    : orders;

  const accountPositions = effectiveAccount !== "all"
    ? positions.filter(p => p.integrationId === effectiveAccount)
    : positions;

  const filteredAccountSummary = selectedAccountId
    ? accountSummary.filter(a => a.accountId === selectedAccountId)
    : accountSummary;

  const orderSourceApps = Array.from(new Set(
    accountOrders.map(o => o.sourceAppName).filter(Boolean)
  )) as string[];

  const positionSourceApps = Array.from(new Set(
    accountPositions.map(p => p.sourceAppName).filter(Boolean)
  )) as string[];

  const allSourceApps = Array.from(new Set([...orderSourceApps, ...positionSourceApps]));

  const filteredOrders = accountOrders
    .filter(o => {
      if (ordersAppFilter !== "all" && o.sourceAppName !== ordersAppFilter) return false;
      if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());

  const filteredPositions = accountPositions.filter(p => {
    if (positionsAppFilter !== "all" && p.sourceAppName !== positionsAppFilter) return false;
    return true;
  });

  const isLoading = ordersLoading || positionsLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="page-ibkr">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="page-ibkr">
      <PageHeader
        icon={Landmark}
        title="IBKR"
        description="Orders and positions, synchronized in real time with IBKR"
        accent="text-purple-500"
        testId="heading-ibkr"
        actions={
          ibkrIntegrations.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={selectedAccount} onValueChange={(v) => { setSelectedAccount(v); setOrdersAppFilter("all"); setPositionsAppFilter("all"); setOrdersPage(1); setPositionsPage(1); }}>
                <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm" data-testid="select-account-filter">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {ibkrIntegrations.map(acct => {
                    const cfg = acct.config as Record<string, any> | null;
                    return (
                      <SelectItem key={acct.id} value={acct.id} data-testid={`select-account-${acct.id}`}>
                        {acct.name}{cfg?.accountId ? ` (${cfg.accountId})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : undefined
        }
      />

      <ConnectionStatus integrations={ibkrIntegrations} />

      <AccountOverview accountSummary={filteredAccountSummary} />

      <SummaryCards orders={accountOrders} positions={accountPositions} />

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setOrderStatusFilter("all"); setOrdersAppFilter("all"); setPositionsAppFilter("all"); setOrdersPage(1); setPositionsPage(1); }} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList data-testid="tabs-ibkr">
            <TabsTrigger value="orders" data-testid="tab-orders">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Orders ({filteredOrders.length})
            </TabsTrigger>
            <TabsTrigger value="positions" data-testid="tab-positions">
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              Positions ({filteredPositions.length})
            </TabsTrigger>
            <TabsTrigger value="diagnostics" data-testid="tab-diagnostics">
              <Bug className="mr-1.5 h-3.5 w-3.5" />
              Diagnostics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base">Orders</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {orderSourceApps.length > 0 && (
                    <Select value={ordersAppFilter} onValueChange={(v) => { setOrdersAppFilter(v); setOrdersPage(1); }}>
                      <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs" data-testid="select-orders-app-filter">
                        <SelectValue placeholder="All Apps" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Apps</SelectItem>
                        {orderSourceApps.map(app => (
                          <SelectItem key={app} value={app}>{app}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={orderStatusFilter} onValueChange={(v) => { setOrderStatusFilter(v); setOrdersPage(1); }}>
                    <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs" data-testid="select-order-status-filter">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <OrdersTable orders={filteredOrders} page={ordersPage} onPageChange={setOrdersPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base">Open Positions</CardTitle>
                {positionSourceApps.length > 0 && (
                  <Select value={positionsAppFilter} onValueChange={(v) => { setPositionsAppFilter(v); setPositionsPage(1); }}>
                    <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs" data-testid="select-positions-app-filter">
                      <SelectValue placeholder="All Apps" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Apps</SelectItem>
                      {positionSourceApps.map(app => (
                        <SelectItem key={app} value={app}>{app}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <PositionsTable positions={filteredPositions} page={positionsPage} onPageChange={setPositionsPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-4">
          <RejectionDiagnostics orders={accountOrders} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
