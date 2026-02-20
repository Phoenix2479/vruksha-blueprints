import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { curbsideApi, type CurbsideOrder, type CurbsideStats } from '../api/curbsideApi';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Badge } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import { Car, Clock, Bell, CheckCircle, Search, Package, Phone, MapPin } from 'lucide-react';

export default function CurbsidePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedOrder, setSelectedOrder] = useState<CurbsideOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stats } = useQuery<CurbsideStats>({ queryKey: ['curbside-stats'], queryFn: curbsideApi.getStats });
  const { data: orders = [], isLoading } = useQuery({ queryKey: ['curbside-orders'], queryFn: () => curbsideApi.list() });

  const updateStatusMutation = useMutation({ mutationFn: ({ id, status, spot }: { id: number; status: CurbsideOrder['status']; spot?: string }) => curbsideApi.updateStatus(id, status, spot), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['curbside-orders'] }) });
  const notifyMutation = useMutation({ mutationFn: curbsideApi.notifyCustomer, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['curbside-orders'] }) });

  const pending = orders.filter(o => o.status === 'pending' || o.status === 'preparing');
  const ready = orders.filter(o => o.status === 'ready' || o.status === 'notified');
  const filtered = orders.filter(o => o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) || o.customerName.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Car className="h-7 w-7 text-orange-600" />
            <div><h1 className="text-xl font-bold">Curbside Pickup</h1><p className="text-sm text-muted-foreground">Manage pickup orders</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Orders" value={`${stats?.totalOrders || 0}`} icon={Package} iconColor="text-orange-600" iconBgColor="bg-orange-100" />
          <StatsCard title="Pending" value={`${stats?.pending || 0}`} icon={Clock} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
          <StatsCard title="Ready" value={`${stats?.ready || 0}`} icon={CheckCircle} iconColor="text-green-600" iconBgColor="bg-green-100" />
          <StatsCard title="Avg Wait" value={`${(stats?.avgWaitMinutes || 0).toFixed(0)} min`} icon={Clock} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="queue">Queue ({pending.length})</TabsTrigger>
            <TabsTrigger value="ready">Ready ({ready.length})</TabsTrigger>
            <TabsTrigger value="all">All Orders</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32 w-full" /></CardContent></Card>) : pending.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No pending orders</CardContent></Card> : pending.map(o => <OrderCard key={o.id} order={o} onStatusChange={(s, spot) => updateStatusMutation.mutate({ id: o.id, status: s, spot })} />)}
            </div>
          </TabsContent>

          <TabsContent value="ready" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ready.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No orders ready</CardContent></Card> : ready.map(o => (
                <Card key={o.id} className="border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div><h3 className="font-medium">{o.orderNumber}</h3><p className="text-sm text-muted-foreground">{o.customerName}</p></div>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    {o.parkingSpot && <div className="mt-2 flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-green-600" /> Spot {o.parkingSpot}</div>}
                    {o.vehicleInfo && <div className="mt-1 text-xs text-muted-foreground">{o.vehicleInfo.color} {o.vehicleInfo.make} {o.vehicleInfo.model}</div>}
                    <div className="mt-4 flex gap-2">
                      {o.status === 'ready' && <Button size="sm" className="flex-1" onClick={() => notifyMutation.mutate(o.id)}><Bell className="h-3 w-3 mr-1" /> Notify</Button>}
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => updateStatusMutation.mutate({ id: o.id, status: 'picked_up' })}><CheckCircle className="h-3 w-3 mr-1" /> Picked Up</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            <div className="space-y-4">
              <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" /></div>
              <Card><ScrollArea className="h-[400px]"><div className="p-4 space-y-2">
                {filtered.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                    <div><p className="font-medium">{o.orderNumber}</p><p className="text-sm text-muted-foreground">{o.customerName} • {o.items.length} items</p></div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                ))}
              </div></ScrollArea></Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function OrderCard({ order, onStatusChange }: { order: CurbsideOrder; onStatusChange: (status: CurbsideOrder['status'], spot?: string) => void }) {
  const [spot, setSpot] = useState('');
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div><h3 className="font-medium">{order.orderNumber}</h3><p className="text-sm text-muted-foreground">{order.customerName}</p></div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3 w-3" />{order.customerPhone}</div>
        <div className="mt-2 text-sm">{order.items.length} items</div>
        <div className="mt-4 space-y-2">
          {order.status === 'pending' && <Button size="sm" className="w-full" onClick={() => onStatusChange('preparing')}>Start Preparing</Button>}
          {order.status === 'preparing' && (
            <>
              <Input placeholder="Parking spot #" value={spot} onChange={e => setSpot(e.target.value)} className="text-sm" />
              <Button size="sm" className="w-full" onClick={() => onStatusChange('ready', spot)} disabled={!spot}>Mark Ready</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderStatusBadge({ status }: { status: CurbsideOrder['status'] }) {
  const map: Record<CurbsideOrder['status'], { status: 'active' | 'inactive' | 'warning' }> = { pending: { status: 'warning' }, preparing: { status: 'warning' }, ready: { status: 'active' }, notified: { status: 'active' }, picked_up: { status: 'inactive' }, cancelled: { status: 'inactive' } };
  return <StatusBadge {...map[status]} label={status.replace('_', ' ')} size="sm" />;
}
