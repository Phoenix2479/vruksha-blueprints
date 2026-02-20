
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
} from "../../../../shared/components/ui";
import { StatsCard, StatusBadge } from "../../../../shared/components/blocks";
import {
  LayoutDashboard,
  DollarSign,
  Users,
  Package,
  FileText,
  AlertCircle,
  ShoppingCart,
  TrendingUp,
  Activity,
  Clock,
  Loader2,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { getDashboardStats, getSalesData, getRecentActivity, checkServicesHealth } from "../api/dashboard";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export default function DashboardPage() {
  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
    refetchInterval: 30000,
  });

  // Fetch sales data
  const { data: salesData = [], isLoading: loadingSales } = useQuery({
    queryKey: ["sales-data"],
    queryFn: () => getSalesData(7),
    refetchInterval: 60000,
  });

  // Fetch recent activity
  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: getRecentActivity,
    refetchInterval: 30000,
  });

  // Fetch service health
  const { data: health = { pos: false, billing: false, inventory: false } } = useQuery({
    queryKey: ["services-health"],
    queryFn: checkServicesHealth,
    refetchInterval: 60000,
  });

  const allServicesUp = health.pos && health.billing && health.inventory;

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "sale":
        return <ShoppingCart className="h-4 w-4 text-green-600" />;
      case "invoice":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "payment":
        return <CreditCard className="h-4 w-4 text-purple-600" />;
      case "alert":
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-7 w-7 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold">Retail Dashboard</h1>
              <p className="text-sm text-muted-foreground">Real-time overview of your operations</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge
              status={allServicesUp ? "active" : "warning"}
              label={allServicesUp ? "All Systems Online" : "Some Services Offline"}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Today's Sales"
            value={`$${(stats?.today_sales || 0).toLocaleString()}`}
            subtitle="Total revenue"
            icon={<DollarSign className="h-5 w-5" />}
            iconColor="text-green-600"
            iconBg="bg-green-100"
            trend={{ value: 12, isPositive: true }}
          />
          <StatsCard
            title="Active Sessions"
            value={stats?.active_sessions || 0}
            subtitle="Open registers"
            icon={<Users className="h-5 w-5" />}
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
          />
          <StatsCard
            title="Low Stock Items"
            value={stats?.low_stock_items || 0}
            subtitle="Need attention"
            icon={<Package className="h-5 w-5" />}
            iconColor="text-orange-600"
            iconBg="bg-orange-100"
            trend={stats?.low_stock_items && stats.low_stock_items > 0 ? { value: stats.low_stock_items, isPositive: false } : undefined}
          />
          <StatsCard
            title="Pending Invoices"
            value={stats?.pending_invoices || 0}
            subtitle={`${stats?.overdue_invoices || 0} overdue`}
            icon={<FileText className="h-5 w-5" />}
            iconColor="text-purple-600"
            iconBg="bg-purple-100"
          />
        </div>

        {/* Charts & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Sales Overview (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSales ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value) => [`$${Number(value).toLocaleString()}`, "Sales"]}
                      />
                      <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64">
                {loadingActivities ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : activities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-1 p-4">
                    {activities.map((activity, index) => (
                      <div key={activity.id}>
                        <div className="flex items-start gap-3 py-2">
                          <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{activity.title}</p>
                            <p className="text-xs text-muted-foreground">{activity.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {formatTime(activity.timestamp)}
                              </span>
                              {activity.amount && (
                                <span className="text-xs font-medium text-green-600">
                                  ${activity.amount.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {index < activities.length - 1 && <Separator />}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* System Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className={`w-3 h-3 rounded-full ${health.pos ? "bg-green-500" : "bg-red-500"}`} />
                <div>
                  <p className="text-sm font-medium">Point of Sale</p>
                  <p className="text-xs text-muted-foreground">Port 8815</p>
                </div>
                <StatusBadge
                  status={health.pos ? "active" : "error"}
                  label={health.pos ? "Online" : "Offline"}
                  size="sm"
                  className="ml-auto"
                />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className={`w-3 h-3 rounded-full ${health.billing ? "bg-green-500" : "bg-red-500"}`} />
                <div>
                  <p className="text-sm font-medium">Billing Engine</p>
                  <p className="text-xs text-muted-foreground">Port 8812</p>
                </div>
                <StatusBadge
                  status={health.billing ? "active" : "error"}
                  label={health.billing ? "Online" : "Offline"}
                  size="sm"
                  className="ml-auto"
                />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className={`w-3 h-3 rounded-full ${health.inventory ? "bg-green-500" : "bg-red-500"}`} />
                <div>
                  <p className="text-sm font-medium">Inventory</p>
                  <p className="text-xs text-muted-foreground">Port 8811</p>
                </div>
                <StatusBadge
                  status={health.inventory ? "active" : "error"}
                  label={health.inventory ? "Online" : "Offline"}
                  size="sm"
                  className="ml-auto"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
