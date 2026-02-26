import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  TrendingDown,
  BarChart3,
  Layers,
  History,
  Filter,
} from "lucide-react";
import type { IbkrOrder, IbkrPosition, Integration, ConnectedApp } from "@shared/schema";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/formatters";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type { ElementType } from "react";

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

function PnlValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  const isPositive = value >= 0;
  return (
    <span className={`font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {isPositive ? "+" : ""}{formatCurrency(value)}
    </span>
  );
}

function SummaryCards({ orders, positions }: { orders: IbkrOrder[]; positions: IbkrPosition[] }) {
  const filledOrders = orders.filter(o => o.status === "filled");
  const pendingOrders = orders.filter(o => o.status === "pending" || o.status === "submitted");
  const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

  const cards: { title: string; value: string; icon: ElementType; accent: string }[] = [
    { title: "Open Positions", value: positions.length.toString(), icon: Layers, accent: "text-blue-500" },
    { title: "Market Value", value: formatCurrency(totalMarketValue), icon: BarChart3, accent: "text-purple-500" },
    { title: "Unrealized P&L", value: formatCurrency(totalUnrealizedPnl), icon: totalUnrealizedPnl >= 0 ? TrendingUp : TrendingDown, accent: totalUnrealizedPnl >= 0 ? "text-emerald-500" : "text-red-500" },
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

function OrdersTable({ orders, showSource }: { orders: IbkrOrder[]; showSource: boolean }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No orders found"
        description="Orders will appear here when trades are executed through IBKR"
      />
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-medium">Order ID</TableHead>
            <TableHead className="text-xs font-medium">Symbol</TableHead>
            <TableHead className="text-xs font-medium">Side</TableHead>
            <TableHead className="text-xs font-medium">Type</TableHead>
            <TableHead className="text-xs font-medium text-right">Qty</TableHead>
            <TableHead className="text-xs font-medium text-right">Filled</TableHead>
            <TableHead className="text-xs font-medium text-right">Price</TableHead>
            <TableHead className="text-xs font-medium text-right">Avg Fill</TableHead>
            <TableHead className="text-xs font-medium">Status</TableHead>
            {showSource && <TableHead className="text-xs font-medium">Source</TableHead>}
            <TableHead className="text-xs font-medium">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
              <TableCell className="font-mono text-xs">{order.orderId}</TableCell>
              <TableCell className="font-semibold text-sm">{order.symbol}</TableCell>
              <TableCell><SideBadge side={order.side} /></TableCell>
              <TableCell className="text-xs capitalize">{order.orderType.replace("_", " ")}</TableCell>
              <TableCell className="text-right text-sm">{formatNumber(order.quantity)}</TableCell>
              <TableCell className="text-right text-sm">{formatNumber(order.filledQuantity)}</TableCell>
              <TableCell className="text-right text-sm font-mono">
                {order.limitPrice ? formatCurrency(order.limitPrice) : order.stopPrice ? formatCurrency(order.stopPrice) : "MKT"}
              </TableCell>
              <TableCell className="text-right text-sm font-mono">{order.avgFillPrice ? formatCurrency(order.avgFillPrice) : "-"}</TableCell>
              <TableCell><OrderStatusBadge status={order.status} /></TableCell>
              {showSource && (
                <TableCell>
                  <Badge variant="outline" className="text-xs">{order.sourceAppName || "Manual"}</Badge>
                </TableCell>
              )}
              <TableCell className="text-xs text-muted-foreground">
                {formatRelativeTime(order.submittedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PositionsTable({ positions, showSource }: { positions: IbkrPosition[]; showSource: boolean }) {
  if (positions.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No open positions"
        description="Active positions from IBKR accounts will appear here"
      />
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-medium">Symbol</TableHead>
            <TableHead className="text-xs font-medium text-right">Quantity</TableHead>
            <TableHead className="text-xs font-medium text-right">Avg Cost</TableHead>
            <TableHead className="text-xs font-medium text-right">Market Price</TableHead>
            <TableHead className="text-xs font-medium text-right">Market Value</TableHead>
            <TableHead className="text-xs font-medium text-right">Unrealized P&L</TableHead>
            <TableHead className="text-xs font-medium text-right">Realized P&L</TableHead>
            {showSource && <TableHead className="text-xs font-medium">Source</TableHead>}
            <TableHead className="text-xs font-medium">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos) => {
            const pnlPct = pos.avgCost && pos.marketPrice
              ? ((pos.marketPrice - pos.avgCost) / pos.avgCost * 100)
              : null;
            return (
              <TableRow key={pos.id} data-testid={`row-position-${pos.id}`}>
                <TableCell className="font-semibold text-sm">{pos.symbol}</TableCell>
                <TableCell className="text-right text-sm">{formatNumber(pos.quantity)}</TableCell>
                <TableCell className="text-right text-sm font-mono">{formatCurrency(pos.avgCost)}</TableCell>
                <TableCell className="text-right text-sm font-mono">{formatCurrency(pos.marketPrice)}</TableCell>
                <TableCell className="text-right text-sm font-mono">{formatCurrency(pos.marketValue)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <PnlValue value={pos.unrealizedPnl} />
                    {pnlPct != null && (
                      <span className={`text-xs ${pnlPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right"><PnlValue value={pos.realizedPnl} /></TableCell>
                {showSource && (
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{pos.sourceAppName || "Manual"}</Badge>
                  </TableCell>
                )}
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelativeTime(pos.lastUpdated)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function IbkrPage() {
  const [appFilter, setAppFilter] = useState<string>("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("orders");

  const { data: orders = [], isLoading: ordersLoading } = useQuery<IbkrOrder[]>({
    queryKey: ["/api/ibkr/orders"],
  });

  const { data: positions = [], isLoading: positionsLoading } = useQuery<IbkrPosition[]>({
    queryKey: ["/api/ibkr/positions"],
  });

  const { data: ibkrIntegrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
    select: (data: Integration[]) => data.filter(i => i.type === "ibkr"),
  });

  const { data: connectedApps = [] } = useQuery<ConnectedApp[]>({
    queryKey: ["/api/connected-apps"],
  });

  const sourceApps = Array.from(new Set(
    [...orders.map(o => o.sourceAppName), ...positions.map(p => p.sourceAppName)]
      .filter(Boolean)
  )) as string[];

  const filteredOrders = orders.filter(o => {
    if (appFilter !== "all" && o.sourceAppName !== appFilter) return false;
    if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) return false;
    return true;
  });

  const filteredPositions = positions.filter(p => {
    if (appFilter !== "all" && p.sourceAppName !== appFilter) return false;
    return true;
  });

  const activeOrders = filteredOrders.filter(o => o.status === "submitted" || o.status === "pending");
  const filledOrders = filteredOrders.filter(o => o.status === "filled");
  const historicalOrders = filteredOrders.filter(o => o.status === "cancelled" || o.status === "rejected");

  const isLoading = ordersLoading || positionsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-ibkr">
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
    <div className="p-6 space-y-6" data-testid="page-ibkr">
      <PageHeader
        icon={Landmark}
        title="IBKR"
        description="Orders and positions, synchronized in real time with IBKR"
        accent="text-purple-500"
        testId="heading-ibkr"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>Filter by:</span>
            </div>
            <Select value={appFilter} onValueChange={setAppFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm" data-testid="select-app-filter">
                <SelectValue placeholder="All Apps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Apps</SelectItem>
                {sourceApps.map(app => (
                  <SelectItem key={app} value={app}>{app}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <SummaryCards orders={filteredOrders} positions={filteredPositions} />

      {ibkrIntegrations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ibkrIntegrations.map(acct => {
            const config = acct.config as Record<string, any> | null;
            return (
              <Card key={acct.id} className="flex-1 min-w-[200px]" data-testid={`card-ibkr-account-${acct.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">{acct.name}</span>
                    </div>
                    <Badge variant={acct.enabled ? "default" : "secondary"} className="text-xs">
                      {acct.enabled ? "Active" : "Offline"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Account: {config?.accountId}</span>
                    <span className="capitalize">{config?.accountType}</span>
                    <span>{config?.host}:{config?.port}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setOrderStatusFilter("all"); }} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList data-testid="tabs-ibkr">
            <TabsTrigger value="orders" data-testid="tab-orders">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Active Orders ({activeOrders.length})
            </TabsTrigger>
            <TabsTrigger value="positions" data-testid="tab-positions">
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              Positions ({filteredPositions.length})
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="mr-1.5 h-3.5 w-3.5" />
              History ({filledOrders.length + historicalOrders.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Active Orders</CardTitle>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-order-status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <OrdersTable orders={activeOrders} showSource={appFilter === "all"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Open Positions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PositionsTable positions={filteredPositions} showSource={appFilter === "all"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Order History</CardTitle>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-history-status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="filled">Filled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <OrdersTable orders={[...filledOrders, ...historicalOrders]} showSource={appFilter === "all"} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
