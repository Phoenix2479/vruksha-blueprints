import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketplaceApi, type MarketplaceChannel, type MarketplaceOrder, type MarketplaceStats } from '../api/marketplaceApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, ScrollArea, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge } from '../../../../shared/components/blocks';
import { Store, RefreshCw, Link2, Unlink, DollarSign, Package, ShoppingCart, Clock } from 'lucide-react';

const CURRENCY = 'INR';

export default function MarketplaceBridgePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('channels');

  const { data: stats } = useQuery<MarketplaceStats>({ queryKey: ['marketplace-stats'], queryFn: marketplaceApi.getStats });
  const { data: channels = [], isLoading: channelsLoading } = useQuery({ queryKey: ['marketplace-channels'], queryFn: marketplaceApi.listChannels });
  const { data: orders = [], isLoading: ordersLoading } = useQuery({ queryKey: ['marketplace-orders'], queryFn: () => marketplaceApi.listOrders() });

  const syncMutation = useMutation({ mutationFn: marketplaceApi.syncChannel, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketplace-channels'] }) });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const pendingOrders = orders.filter(o => o.status === 'pending');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Store className="h-7 w-7 text-cyan-600" />
            <div><h1 className="text-xl font-bold">Marketplace Bridge</h1><p className="text-sm text-muted-foreground">Multi-channel selling</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Channels" value={`${stats?.connected || 0}/${stats?.totalChannels || 0}`} icon={Link2} iconColor="text-cyan-600" iconBgColor="bg-cyan-100" subtitle="connected" />
          <StatsCard title="Total Revenue" value={formatPrice(stats?.totalRevenue || 0)} icon={DollarSign} iconColor="text-green-600" iconBgColor="bg-green-100" />
          <StatsCard title="Pending Orders" value={`${stats?.pendingOrders || 0}`} icon={Clock} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
          <StatsCard title="Total Products" value={`${channels.reduce((s, c) => s + c.totalProducts, 0)}`} icon={Package} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingOrders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {channelsLoading ? Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32 w-full" /></CardContent></Card>) : channels.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No channels connected</CardContent></Card> : channels.map(c => (
                <Card key={c.id} className={c.status === 'error' ? 'border-red-200' : ''}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div><h3 className="font-medium">{c.name}</h3><Badge variant="outline">{c.type}</Badge></div>
                      <ChannelStatusBadge status={c.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Products:</span> <span className="font-medium">{c.totalProducts}</span></div>
                      <div><span className="text-muted-foreground">Orders:</span> <span className="font-medium">{c.totalOrders}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Revenue:</span> <span className="font-semibold">{formatPrice(c.revenue)}</span></div>
                    </div>
                    {c.lastSync && <p className="mt-2 text-xs text-muted-foreground">Last sync: {new Date(c.lastSync).toLocaleString()}</p>}
                    <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => syncMutation.mutate(c.id)} disabled={syncMutation.isPending}><RefreshCw className={`h-3 w-3 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> Sync</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="orders" className="mt-6">
            <Card><ScrollArea className="h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>Order ID</TableHead><TableHead>Channel</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ordersLoading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell></TableRow>) : orders.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No orders</TableCell></TableRow> : orders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.externalOrderId}</TableCell>
                      <TableCell><Badge variant="outline">{o.channelName}</Badge></TableCell>
                      <TableCell>{o.customerName}</TableCell>
                      <TableCell className="text-right font-semibold">{formatPrice(o.total)}</TableCell>
                      <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                      <TableCell>{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea></Card>
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            <Card><ScrollArea className="h-[400px]"><div className="p-4 space-y-2">
              {pendingOrders.length === 0 ? <p className="text-center text-muted-foreground py-8">No pending orders</p> : pendingOrders.map(o => (
                <div key={o.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                  <div><p className="font-medium">{o.externalOrderId}</p><p className="text-sm text-muted-foreground">{o.channelName} • {o.customerName}</p></div>
                  <span className="font-semibold">{formatPrice(o.total)}</span>
                </div>
              ))}
            </div></ScrollArea></Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ChannelStatusBadge({ status }: { status: MarketplaceChannel['status'] }) {
  const map: Record<MarketplaceChannel['status'], { status: 'active' | 'inactive' | 'warning' }> = { connected: { status: 'active' }, disconnected: { status: 'inactive' }, error: { status: 'warning' } };
  return <StatusBadge {...map[status]} label={status} size="sm" />;
}

function OrderStatusBadge({ status }: { status: MarketplaceOrder['status'] }) {
  const map: Record<MarketplaceOrder['status'], { status: 'active' | 'inactive' | 'warning' }> = { pending: { status: 'warning' }, processing: { status: 'warning' }, shipped: { status: 'warning' }, delivered: { status: 'active' }, cancelled: { status: 'inactive' } };
  return <StatusBadge {...map[status]} label={status} size="sm" />;
}
