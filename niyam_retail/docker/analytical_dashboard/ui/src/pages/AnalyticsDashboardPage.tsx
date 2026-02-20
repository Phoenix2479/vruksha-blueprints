import { useQuery } from '@tanstack/react-query';
import { dashboardApi, type DashboardMetrics } from '../api/dashboardApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '../../../../shared/components/ui';
import { StatsCard } from '../../../../shared/components/blocks';
import { LayoutDashboard, DollarSign, ShoppingCart, Users, Package, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const CURRENCY = 'INR';

export default function AnalyticsDashboardPage() {
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({ queryKey: ['dashboard-metrics'], queryFn: dashboardApi.getMetrics, refetchInterval: 30000 });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const calcChange = (today: number, yesterday: number) => yesterday === 0 ? 0 : ((today - yesterday) / yesterday) * 100;
  const revenueChange = calcChange(metrics?.revenue.today || 0, metrics?.revenue.yesterday || 0);
  const ordersChange = calcChange(metrics?.orders.today || 0, metrics?.orders.yesterday || 0);
  const trendData = (metrics?.revenue.weekTrend || []).map((v, i) => ({ day: `D${i + 1}`, revenue: v }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-7 w-7 text-slate-700" />
            <div><h1 className="text-xl font-bold">Analytics Dashboard</h1><p className="text-sm text-muted-foreground">Real-time business overview</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {isLoading ? <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Today's Revenue</p><p className="text-2xl font-bold">{formatPrice(metrics?.revenue.today || 0)}</p></div>
                    <div className={`flex items-center gap-1 text-sm ${revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {revenueChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{Math.abs(revenueChange).toFixed(1)}%
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">vs yesterday: {formatPrice(metrics?.revenue.yesterday || 0)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Today's Orders</p><p className="text-2xl font-bold">{metrics?.orders.today || 0}</p></div>
                    <div className={`flex items-center gap-1 text-sm ${ordersChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {ordersChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{Math.abs(ordersChange).toFixed(1)}%
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Avg: {formatPrice(metrics?.orders.avgValue || 0)}</p>
                </CardContent>
              </Card>
              <StatsCard title="Active Customers" value={`${metrics?.customers.active || 0}`} icon={Users} iconColor="text-purple-600" iconBgColor="bg-purple-100" subtitle={`${metrics?.customers.new || 0} new today`} />
              <Card className={`${(metrics?.inventory.outOfStock || 0) > 0 ? 'border-red-200 bg-red-50' : ''}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Inventory Alerts</p><p className="text-2xl font-bold">{(metrics?.inventory.lowStock || 0) + (metrics?.inventory.outOfStock || 0)}</p></div>
                    <AlertTriangle className={`h-6 w-6 ${(metrics?.inventory.outOfStock || 0) > 0 ? 'text-red-600' : 'text-amber-600'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{metrics?.inventory.lowStock} low, {metrics?.inventory.outOfStock} out</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">7-Day Revenue Trend</CardTitle></CardHeader>
                <CardContent><div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <XAxis dataKey="day" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(value) => formatPrice(Number(value) || 0)} />
                      <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Customer Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded"><span>New</span><span className="font-bold text-green-600">{metrics?.customers.new || 0}</span></div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded"><span>Returning</span><span className="font-bold text-blue-600">{metrics?.customers.returning || 0}</span></div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded"><span>Active</span><span className="font-bold text-purple-600">{metrics?.customers.active || 0}</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
