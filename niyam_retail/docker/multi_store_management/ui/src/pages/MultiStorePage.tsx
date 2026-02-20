import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeApi, type Store, type StoreStats, type StorePerformance } from '../api/multiStoreApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Skeleton } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import { Building2, Plus, Edit2, Trash2, MapPin, Phone, User, TrendingUp, DollarSign, Search, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CURRENCY = 'INR';

export default function MultiStorePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isStoreDialogOpen, setIsStoreDialogOpen] = useState(false);
  const [_selectedStore, setSelectedStore] = useState<Store | null>(null);
  void _selectedStore; // Used for future edit functionality
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stats } = useQuery<StoreStats>({ queryKey: ['store-stats'], queryFn: storeApi.getStats });
  const { data: stores = [], isLoading } = useQuery({ queryKey: ['stores'], queryFn: () => storeApi.list() });
  const { data: performance = [] } = useQuery<StorePerformance[]>({ queryKey: ['store-performance'], queryFn: storeApi.getPerformance });

  const createMutation = useMutation({ mutationFn: storeApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stores'] }); setIsStoreDialogOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: storeApi.delete, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stores'] }) });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const filtered = stores.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.city.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-violet-600" />
            <div><h1 className="text-xl font-bold">Multi-Store Management</h1><p className="text-sm text-muted-foreground">Locations, performance & operations</p></div>
          </div>
          <Button onClick={() => setIsStoreDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Store</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="stores">All Stores</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard title="Total Stores" value={`${stats?.totalStores || 0}`} icon={Building2} iconColor="text-violet-600" iconBgColor="bg-violet-100" subtitle={`${stats?.activeStores || 0} active`} />
                <StatsCard title="Total Revenue" value={formatPrice(stats?.totalRevenue || 0)} icon={DollarSign} iconColor="text-green-600" iconBgColor="bg-green-100" />
                <StatsCard title="Avg Daily Revenue" value={formatPrice(stats?.avgDailyRevenue || 0)} icon={TrendingUp} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
                <StatsCard title="Top Store" value={stats?.topPerformingStore || '-'} icon={BarChart3} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
              </div>

              {performance.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Revenue by Store</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performance.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="storeName" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip formatter={(value) => formatPrice(Number(value) || 0)} />
                          <Bar dataKey="revenue" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="stores" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search stores..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" /></div>
                <Button onClick={() => setIsStoreDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Store</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32 w-full" /></CardContent></Card>) : filtered.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No stores found</CardContent></Card> : filtered.map(s => (
                  <Card key={s.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div><h3 className="font-medium">{s.name}</h3><p className="text-xs text-muted-foreground">{s.storeCode}</p></div>
                        <StoreStatusBadge status={s.status} />
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3 w-3" />{s.city}, {s.state}</div>
                        {s.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3 w-3" />{s.phone}</div>}
                        {s.manager && <div className="flex items-center gap-2 text-muted-foreground"><User className="h-3 w-3" />{s.manager}</div>}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedStore(s)}><Edit2 className="h-3 w-3 mr-1" /> Edit</Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(s.id); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="mt-6">
            <Card>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader><TableRow><TableHead>Store</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Avg Order</TableHead><TableHead className="text-right">Inventory</TableHead><TableHead className="text-right">Staff</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {performance.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No performance data</TableCell></TableRow> : performance.map(p => (
                      <TableRow key={p.storeId}>
                        <TableCell className="font-medium">{p.storeName}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(p.revenue)}</TableCell>
                        <TableCell className="text-right">{p.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatPrice(p.avgOrderValue)}</TableCell>
                        <TableCell className="text-right">{formatPrice(p.inventoryValue)}</TableCell>
                        <TableCell className="text-right">{p.staffCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <StoreFormDialog open={isStoreDialogOpen} onOpenChange={setIsStoreDialogOpen} onSubmit={data => createMutation.mutate(data)} isLoading={createMutation.isPending} />
    </div>
  );
}

function StoreStatusBadge({ status }: { status: Store['status'] }) {
  const map: Record<Store['status'], { status: 'active' | 'inactive' | 'warning' }> = { active: { status: 'active' }, inactive: { status: 'inactive' }, maintenance: { status: 'warning' }, coming_soon: { status: 'warning' } };
  return <StatusBadge {...map[status]} label={status.replace('_', ' ')} size="sm" />;
}

function StoreFormDialog({ open, onOpenChange, onSubmit, isLoading }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: Parameters<typeof storeApi.create>[0]) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({ name: '', type: 'retail' as Store['type'], address: '', city: '', state: '', postalCode: '', country: 'India', phone: '', email: '', manager: '' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add New Store</DialogTitle><DialogDescription>Register a new store location</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Store Name *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Type</Label><Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v as Store['type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="retail">Retail</SelectItem><SelectItem value="warehouse">Warehouse</SelectItem><SelectItem value="outlet">Outlet</SelectItem><SelectItem value="franchise">Franchise</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>Address *</Label><Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>City *</Label><Input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} /></div>
            <div className="space-y-2"><Label>State *</Label><Input value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} /></div>
            <div className="space-y-2"><Label>Postal Code *</Label><Input value={formData.postalCode} onChange={e => setFormData({ ...formData, postalCode: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Phone</Label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Manager</Label><Input value={formData.manager} onChange={e => setFormData({ ...formData, manager: e.target.value })} /></div>
          </div>
        </div>
        <DialogButtons onCancel={() => onOpenChange(false)} onConfirm={() => onSubmit(formData)} confirmText={isLoading ? 'Adding...' : 'Add Store'} confirmLoading={isLoading} confirmDisabled={!formData.name || !formData.address || !formData.city || !formData.state} />
      </DialogContent>
    </Dialog>
  );
}
