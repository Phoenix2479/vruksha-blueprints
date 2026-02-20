import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, Button } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { ChefHat, Clock, Flame, CheckCircle, AlertTriangle, Timer, Utensils, Loader2, RefreshCw, Bell } from "lucide-react";
import { getKDSDisplay, getKDSStats, startOrder, markOrderReady, markOrderServed, getReadyOrders, type KitchenOrder } from "../api";

export default function KitchenOpsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "new" | "cooking" | "ready">("all");
  const [showExpo, setShowExpo] = useState(false);

  // Queries
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["kds-orders"],
    queryFn: getKDSDisplay,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const { data: readyOrders = [] } = useQuery({
    queryKey: ["ready-orders"],
    queryFn: getReadyOrders,
    refetchInterval: 5000,
    enabled: showExpo,
  });

  const { data: stats } = useQuery({
    queryKey: ["kds-stats"],
    queryFn: getKDSStats,
    refetchInterval: 10000,
  });

  // Mutations
  const startMutation = useMutation({
    mutationFn: startOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kds-orders"] });
      queryClient.invalidateQueries({ queryKey: ["kds-stats"] });
    },
  });

  const readyMutation = useMutation({
    mutationFn: markOrderReady,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kds-orders"] });
      queryClient.invalidateQueries({ queryKey: ["ready-orders"] });
      queryClient.invalidateQueries({ queryKey: ["kds-stats"] });
    },
  });

  const servedMutation = useMutation({
    mutationFn: markOrderServed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ready-orders"] });
      queryClient.invalidateQueries({ queryKey: ["kds-stats"] });
    },
  });

  // Filter orders
  const filteredOrders = filter === "all" 
    ? orders 
    : orders.filter(o => {
        if (filter === "new") return o.status === "kitchen_ready";
        if (filter === "cooking") return o.status === "cooking";
        if (filter === "ready") return o.status === "ready";
        return true;
      });

  const newOrders = orders.filter(o => o.status === "kitchen_ready").length;
  const cookingOrders = orders.filter(o => o.status === "cooking").length;
  const readyCount = stats?.ready_for_pickup ?? 0;
  const urgentOrders = orders.filter(o => o.priority === "urgent" || o.is_overdue).length;

  const getStatusStyle = (status: string): "warning" | "info" | "active" | "neutral" => {
    const styles: Record<string, "warning" | "info" | "active" | "neutral"> = {
      kitchen_ready: "warning",
      cooking: "info",
      ready: "active",
      served: "neutral",
    };
    return styles[status] || "neutral";
  };

  const getTimeSince = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    return `${mins}m`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <ChefHat className="h-7 w-7 text-red-600" />
            <div>
              <h1 className="text-xl font-bold">Kitchen Display</h1>
              <p className="text-sm text-muted-foreground">Order Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showExpo ? "default" : "outline"}
              size="sm"
              onClick={() => setShowExpo(!showExpo)}
            >
              <Bell className="h-4 w-4 mr-1" />
              Expo ({readyCount})
            </Button>
            <div className="border-l mx-2 h-6" />
            {(["all", "new", "cooking", "ready"] as const).map(f => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="New Orders"
            value={stats?.in_queue ?? newOrders}
            icon={AlertTriangle}
            iconColor="text-yellow-600"
            iconBg="bg-yellow-100"
          />
          <StatsCard
            title="Cooking"
            value={stats?.cooking ?? cookingOrders}
            icon={Flame}
            iconColor="text-orange-600"
            iconBg="bg-orange-100"
          />
          <StatsCard
            title="Ready for Pickup"
            value={stats?.ready_for_pickup ?? readyCount}
            icon={CheckCircle}
            iconColor="text-green-600"
            iconBg="bg-green-100"
          />
          <StatsCard
            title="Avg Prep Time"
            value={`${stats?.avg_prep_time_minutes ?? 0}m`}
            icon={Timer}
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
            subtitle={`${stats?.served_last_hour ?? 0} served/hr`}
          />
        </div>

        {/* Expo View (Ready Orders) */}
        {showExpo && (
          <Card className="border-green-500 border-2">
            <CardHeader className="pb-2 bg-green-50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-green-700">Ready for Pickup</h2>
                <span className="text-sm text-green-600">{readyOrders.length} orders</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {readyOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No orders ready for pickup</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {readyOrders.map(order => (
                    <Card key={order.id} className="p-3 bg-green-50 border-green-200 min-w-[150px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold">#{order.order_number}</span>
                        <span className="text-sm text-muted-foreground">
                          {order.table_number ? `T${order.table_number}` : order.room_number ? `R${order.room_number}` : ''}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => servedMutation.mutate(order.id)}
                        disabled={servedMutation.isPending}
                      >
                        Served
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Orders Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No orders in queue</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map(order => (
              <Card
                key={order.id}
                className={`
                  ${order.priority === "urgent" || order.is_overdue ? "border-red-500 border-2 animate-pulse" : ""}
                  ${order.status === "cooking" ? "border-orange-400" : ""}
                `}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">#{order.order_number}</span>
                      {(order.priority === "urgent" || order.is_overdue) && (
                        <StatusBadge status="error" label="URGENT" size="sm" />
                      )}
                    </div>
                    <StatusBadge
                      status={getStatusStyle(order.status)}
                      label={order.status.replace("_", " ")}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Utensils className="h-4 w-4" />
                      {order.source || (order.table_number ? `Table ${order.table_number}` : order.room_number ? `Room ${order.room_number}` : 'N/A')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {order.wait_time_minutes ? `${order.wait_time_minutes}m` : getTimeSince(order.created_at)} ago
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-start">
                        <div>
                          <span className="font-medium">
                            {item.quantity}× {item.name}
                          </span>
                          {item.notes && (
                            <p className="text-xs text-amber-600 italic">{item.notes}</p>
                          )}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              +{item.modifiers.map(m => m.name).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {order.status === "kitchen_ready" && (
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => startMutation.mutate(order.id)}
                        disabled={startMutation.isPending}
                      >
                        {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start"}
                      </Button>
                    )}
                    {order.status === "cooking" && (
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => readyMutation.mutate(order.id)}
                        disabled={readyMutation.isPending}
                      >
                        {readyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ready"}
                      </Button>
                    )}
                    {order.status === "ready" && (
                      <Button
                        className="flex-1"
                        size="sm"
                        variant="outline"
                        onClick={() => servedMutation.mutate(order.id)}
                        disabled={servedMutation.isPending}
                      >
                        Served
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
