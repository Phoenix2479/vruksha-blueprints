import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { networthApi, type NetworthSummary, type NetworthTrend, type AssetBreakdown } from '../api/networthApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Progress } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard } from '../../../../shared/components/blocks';
import { Wallet, TrendingUp, TrendingDown, DollarSign, Package, CreditCard, Building2, PiggyBank } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CURRENCY = 'INR';
const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export default function NetworthPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const { data: summary, isLoading } = useQuery<NetworthSummary>({ queryKey: ['networth-summary'], queryFn: networthApi.getSummary });
  const { data: trends = [] } = useQuery<NetworthTrend[]>({ queryKey: ['networth-trends', period], queryFn: () => networthApi.getTrends(period) });
  const { data: breakdown = [] } = useQuery<AssetBreakdown[]>({ queryKey: ['asset-breakdown'], queryFn: networthApi.getAssetBreakdown });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const netWorthColor = (summary?.netWorth || 0) >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Wallet className="h-7 w-7 text-teal-600" />
            <div><h1 className="text-xl font-bold">Net Worth</h1><p className="text-sm text-muted-foreground">Assets, liabilities & financial health</p></div>
          </div>
          <Select value={period} onValueChange={v => setPeriod(v as typeof period)}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Monthly</SelectItem><SelectItem value="quarter">Quarterly</SelectItem><SelectItem value="year">Yearly</SelectItem></SelectContent></Select>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {isLoading ? <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-gradient-to-br from-teal-50 to-white border-teal-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3"><Wallet className="h-8 w-8 text-teal-600" /><div><p className="text-sm text-muted-foreground">Net Worth</p><p className={`text-3xl font-bold ${netWorthColor}`}>{formatPrice(summary?.netWorth || 0)}</p></div></div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-green-600" /><div><p className="text-sm text-muted-foreground">Total Assets</p><p className="text-3xl font-bold text-green-600">{formatPrice(summary?.totalAssets || 0)}</p></div></div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3"><TrendingDown className="h-8 w-8 text-red-600" /><div><p className="text-sm text-muted-foreground">Total Liabilities</p><p className="text-3xl font-bold text-red-600">{formatPrice(summary?.totalLiabilities || 0)}</p></div></div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatsCard title="Cash" value={formatPrice(summary?.cashOnHand || 0)} icon={DollarSign} iconColor="text-green-600" iconBgColor="bg-green-100" />
          <StatsCard title="Inventory" value={formatPrice(summary?.inventory || 0)} icon={Package} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
          <StatsCard title="Receivables" value={formatPrice(summary?.receivables || 0)} icon={CreditCard} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
          <StatsCard title="Payables" value={formatPrice(summary?.payables || 0)} icon={CreditCard} iconColor="text-red-600" iconBgColor="bg-red-100" />
          <StatsCard title="Fixed Assets" value={formatPrice(summary?.fixedAssets || 0)} icon={Building2} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
          <StatsCard title="Investments" value={formatPrice(summary?.investments || 0)} icon={PiggyBank} iconColor="text-pink-600" iconBgColor="bg-pink-100" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Trend</TabsTrigger>
            <TabsTrigger value="breakdown">Asset Breakdown</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Net Worth Trend</CardTitle></CardHeader>
              <CardContent><div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(value) => formatPrice(Number(value) || 0)} />
                    <Area type="monotone" dataKey="assets" stackId="1" stroke="#10b981" fill="#10b98133" name="Assets" />
                    <Area type="monotone" dataKey="liabilities" stackId="2" stroke="#ef4444" fill="#ef444433" name="Liabilities" />
                    <Area type="monotone" dataKey="netWorth" stroke="#0891b2" fill="#0891b233" name="Net Worth" />
                  </AreaChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="breakdown" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Asset Distribution</CardTitle></CardHeader>
                <CardContent><div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={breakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="category" label={({ category }) => category}>
                      {breakdown.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie><Tooltip formatter={(value) => formatPrice(Number(value) || 0)} /></PieChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Breakdown</CardTitle></CardHeader>
                <CardContent><div className="space-y-4">
                  {breakdown.map((b, i) => (
                    <div key={b.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm"><span>{b.category}</span><span className="font-medium">{formatPrice(b.value)}</span></div>
                      <Progress value={b.percentage} className="h-2" style={{ backgroundColor: `${COLORS[i % COLORS.length]}20` }} />
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
