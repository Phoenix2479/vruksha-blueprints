import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesAnalyticsApi, type SalesMetrics, type SalesTrend, type TopProduct, type TopCategory } from '../api/salesAnalyticsApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, ScrollArea, Progress } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard } from '../../../../shared/components/blocks';
import { TrendingUp, DollarSign, ShoppingCart, Package, Users, RotateCcw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const CURRENCY = 'INR';
const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export default function SalesAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');

  const { data: metrics, isLoading: metricsLoading } = useQuery<SalesMetrics>({ queryKey: ['sales-metrics', period], queryFn: () => salesAnalyticsApi.getMetrics(period) });
  const { data: trends = [] } = useQuery<SalesTrend[]>({ queryKey: ['sales-trends', period], queryFn: () => salesAnalyticsApi.getTrends(period as 'day' | 'week' | 'month') });
  const { data: topProducts = [] } = useQuery<TopProduct[]>({ queryKey: ['top-products'], queryFn: () => salesAnalyticsApi.getTopProducts(10) });
  const { data: topCategories = [] } = useQuery<TopCategory[]>({ queryKey: ['top-categories'], queryFn: salesAnalyticsApi.getTopCategories });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-emerald-600" />
            <div><h1 className="text-xl font-bold">Sales Analytics</h1><p className="text-sm text-muted-foreground">Revenue, trends & insights</p></div>
          </div>
          <Select value={period} onValueChange={v => setPeriod(v as typeof period)}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="year">This Year</SelectItem></SelectContent></Select>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metricsLoading ? Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-20 w-full" /></CardContent></Card>) : <>
            <StatsCard title="Revenue" value={formatPrice(metrics?.totalRevenue || 0)} icon={DollarSign} iconColor="text-emerald-600" iconBgColor="bg-emerald-100" />
            <StatsCard title="Orders" value={`${metrics?.totalOrders || 0}`} icon={ShoppingCart} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
            <StatsCard title="Avg Order" value={formatPrice(metrics?.avgOrderValue || 0)} icon={TrendingUp} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
            <StatsCard title="Units Sold" value={`${metrics?.totalUnits || 0}`} icon={Package} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
            <StatsCard title="New Customers" value={`${metrics?.newCustomers || 0}`} icon={Users} iconColor="text-pink-600" iconBgColor="bg-pink-100" />
            <StatsCard title="Return Rate" value={`${((metrics?.returnRate || 0) * 100).toFixed(1)}%`} icon={RotateCcw} iconColor="text-red-600" iconBgColor="bg-red-100" />
          </>}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Top Products</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
                <CardContent><div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(value) => formatPrice(Number(value) || 0)} />
                      <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Orders Trend</CardTitle></CardHeader>
                <CardContent><div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="orders" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <Card><ScrollArea className="h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Units Sold</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {topProducts.length === 0 ? <TableRow><TableCell colSpan={3} className="h-32 text-center text-muted-foreground">No data</TableCell></TableRow> : topProducts.map((p, i) => (
                    <TableRow key={p.productId}>
                      <TableCell><div className="flex items-center gap-3"><span className="text-sm font-medium text-muted-foreground">#{i + 1}</span><span className="font-medium">{p.productName}</span></div></TableCell>
                      <TableCell className="text-right">{p.unitsSold.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{formatPrice(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea></Card>
          </TabsContent>

          <TabsContent value="categories" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Revenue by Category</CardTitle></CardHeader>
                <CardContent><div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={topCategories} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="revenue" nameKey="category" label={({ category }) => category}>
                      {topCategories.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie><Tooltip formatter={(value) => formatPrice(Number(value) || 0)} /></PieChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
                <CardContent><div className="space-y-4">
                  {topCategories.map((c, i) => (
                    <div key={c.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm"><span>{c.category}</span><span className="font-medium">{formatPrice(c.revenue)}</span></div>
                      <Progress value={c.percentage} className="h-2" style={{ backgroundColor: `${COLORS[i % COLORS.length]}20` }} />
                    </div>
                  ))}
                </div></CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
