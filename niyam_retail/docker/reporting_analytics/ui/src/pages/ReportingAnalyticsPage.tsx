import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportingApi, type DashboardStats, type TopProduct } from "../api/reportingApi";
import { Card, CardContent, CardHeader, CardTitle, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui";
import { StatsCard } from "@shared/components/blocks";
import { spacing } from "@shared/styles/spacing";
import { BarChart3, TrendingUp, DollarSign, ShoppingCart, Calendar, Download, Loader2, FileText, PieChart } from "lucide-react";

export default function ReportingAnalyticsPage() {
  const [dateRange, setDateRange] = useState("7d");

  const dateParams = useMemo(() => {
    const to = new Date();
    const from = new Date();
    if (dateRange === "7d") from.setDate(from.getDate() - 7);
    else if (dateRange === "30d") from.setDate(from.getDate() - 30);
    else if (dateRange === "90d") from.setDate(from.getDate() - 90);
    return { from, to };
  }, [dateRange]);

  const { data: dashboard } = useQuery<DashboardStats>({
    queryKey: ["reporting-dashboard"],
    queryFn: reportingApi.getDashboard,
  });

  const { data: salesReport, isLoading } = useQuery({
    queryKey: ["sales-report", dateRange],
    queryFn: () => reportingApi.getSalesReport(dateParams.from, dateParams.to, "day"),
  });

  const { data: topProducts = [] } = useQuery<TopProduct[]>({
    queryKey: ["top-products", dateRange],
    queryFn: () => reportingApi.getTopProducts(dateParams.from, dateParams.to, 10),
  });

  const salesData = salesReport?.data || [];
  const totalSales = salesData.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = salesData.reduce((sum, d) => sum + d.transactions, 0);
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const maxSalesDay = salesData.length > 0 ? salesData.reduce((max, d) => d.revenue > max.revenue ? d : max, salesData[0]) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-cyan-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Reporting & Analytics</h1>
              <p className="text-sm text-muted-foreground">Sales insights and performance metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />Export</Button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
        <div className={`grid grid-cols-1 md:grid-cols-4 ${spacing.cardGap}`}>
          <StatsCard title="Today's Sales" value={`$${(dashboard?.todaySales.total || 0).toLocaleString()}`} subtitle={`${dashboard?.todaySales.count || 0} transactions`} icon={<DollarSign className="h-5 w-5" />} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="Period Revenue" value={`$${totalSales.toLocaleString()}`} icon={<ShoppingCart className="h-5 w-5" />} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <StatsCard title="Avg. Order Value" value={`$${avgOrderValue.toFixed(2)}`} icon={<TrendingUp className="h-5 w-5" />} iconColor="text-purple-600" iconBg="bg-purple-100" />
          <StatsCard title="Best Day" value={maxSalesDay?.period || "N/A"} subtitle={maxSalesDay ? `$${maxSalesDay.revenue.toLocaleString()}` : ""} icon={<Calendar className="h-5 w-5" />} iconColor="text-orange-600" iconBg="bg-orange-100" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" />Daily Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : salesData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No sales data for this period</div>
              ) : (
                <div className="space-y-3">
                  {salesData.slice(0, 7).map((day) => (
                    <div key={day.period} className="flex items-center gap-3">
                      <span className="w-24 text-sm font-medium truncate">{day.period}</span>
                      <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min((day.revenue / (totalSales / salesData.length * 2)) * 100, 100)}%` }} />
                      </div>
                      <span className="w-24 text-right text-sm font-medium">${day.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><PieChart className="h-5 w-5" />Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No product sales data</div>
              ) : (
                <div className="space-y-4">
                  {topProducts.slice(0, 5).map((product, i) => (
                    <div key={product.sku} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">{i + 1}</span>
                        <span className="font-medium">{product.name || product.sku}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${product.revenue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{product.quantitySold} units</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />Available Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {["Sales Summary", "Inventory Report", "Customer Analytics", "Tax Report", "Profit & Loss", "Staff Performance"].map((report) => (
                <div key={report} className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{report}</span>
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
