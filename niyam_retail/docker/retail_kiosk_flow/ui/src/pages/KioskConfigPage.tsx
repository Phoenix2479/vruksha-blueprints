import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kioskApi, type Kiosk, type KioskStats } from '../api/kioskApi';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import { Monitor, Plus, Edit2, Trash2, MapPin, Wifi, WifiOff, RefreshCw, Settings, Search, Power } from 'lucide-react';

export default function KioskConfigPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isKioskDialogOpen, setIsKioskDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { data: stats } = useQuery<KioskStats>({ queryKey: ['kiosk-stats'], queryFn: kioskApi.getStats });
  const { data: kiosks = [], isLoading } = useQuery({ queryKey: ['kiosks', filterStatus], queryFn: () => kioskApi.list({ status: filterStatus !== 'all' ? filterStatus as Kiosk['status'] : undefined }) });

  const createMutation = useMutation({ mutationFn: kioskApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kiosks'] }); setIsKioskDialogOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: kioskApi.delete, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }) });
  const restartMutation = useMutation({ mutationFn: kioskApi.restart, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }) });

  const filtered = kiosks.filter(k => k.name.toLowerCase().includes(searchTerm.toLowerCase()) || k.location.toLowerCase().includes(searchTerm.toLowerCase()));
  const offlineKiosks = kiosks.filter(k => k.status === 'offline');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Monitor className="h-7 w-7 text-indigo-600" />
            <div><h1 className="text-xl font-bold">Kiosk Configuration</h1><p className="text-sm text-muted-foreground">Manage self-service terminals</p></div>
          </div>
          <Button onClick={() => setIsKioskDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Kiosk</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="kiosks">All Kiosks</TabsTrigger>
            <TabsTrigger value="offline">Offline ({offlineKiosks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard title="Total Kiosks" value={`${stats?.totalKiosks || 0}`} icon={Monitor} iconColor="text-indigo-600" iconBgColor="bg-indigo-100" />
                <StatsCard title="Online" value={`${stats?.online || 0}`} icon={Wifi} iconColor="text-green-600" iconBgColor="bg-green-100" />
                <StatsCard title="Offline" value={`${stats?.offline || 0}`} icon={WifiOff} iconColor="text-red-600" iconBgColor="bg-red-100" />
                <StatsCard title="Maintenance" value={`${stats?.maintenance || 0}`} icon={Settings} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
              </div>
              {offlineKiosks.length > 0 && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader className="pb-2"><CardTitle className="text-base text-red-800 flex items-center gap-2"><WifiOff className="h-5 w-5" /> Offline Kiosks</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {offlineKiosks.slice(0, 5).map(k => (
                        <div key={k.id} className="flex items-center justify-between p-2 bg-white rounded">
                          <div><p className="font-medium">{k.name}</p><p className="text-xs text-muted-foreground">{k.location}</p></div>
                          <Button variant="outline" size="sm" onClick={() => restartMutation.mutate(k.id)}><RefreshCw className="h-3 w-3 mr-1" /> Restart</Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="kiosks" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" /></div>
                <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem></SelectContent></Select>
                <Button onClick={() => setIsKioskDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Kiosk</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32 w-full" /></CardContent></Card>) : filtered.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No kiosks found</CardContent></Card> : filtered.map(k => (
                  <Card key={k.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div><h3 className="font-medium">{k.name}</h3><p className="text-xs text-muted-foreground">{k.kioskCode}</p></div>
                        <KioskStatusBadge status={k.status} />
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3 w-3" />{k.location}</div>
                        {k.storeName && <div className="flex items-center gap-2 text-muted-foreground"><Monitor className="h-3 w-3" />{k.storeName}</div>}
                        {k.lastHeartbeat && <div className="text-xs text-muted-foreground">Last seen: {new Date(k.lastHeartbeat).toLocaleString()}</div>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {k.features.payment && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Payment</span>}
                        {k.features.scanner && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Scanner</span>}
                        {k.features.printer && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Printer</span>}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => restartMutation.mutate(k.id)}><Power className="h-3 w-3 mr-1" /> Restart</Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(k.id); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="offline" className="mt-6">
            <Card>
              <ScrollArea className="h-[400px]">
                <div className="p-4 space-y-3">
                  {offlineKiosks.length === 0 ? <p className="text-center text-muted-foreground py-8">All kiosks are online</p> : offlineKiosks.map(k => (
                    <div key={k.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <div><p className="font-medium">{k.name}</p><p className="text-sm text-muted-foreground">{k.location} • {k.kioskCode}</p></div>
                      <Button variant="outline" onClick={() => restartMutation.mutate(k.id)}><RefreshCw className="h-4 w-4 mr-1" /> Restart</Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <KioskFormDialog open={isKioskDialogOpen} onOpenChange={setIsKioskDialogOpen} onSubmit={data => createMutation.mutate(data)} isLoading={createMutation.isPending} />
    </div>
  );
}

function KioskStatusBadge({ status }: { status: Kiosk['status'] }) {
  const map: Record<Kiosk['status'], { status: 'active' | 'inactive' | 'warning' }> = { online: { status: 'active' }, offline: { status: 'inactive' }, maintenance: { status: 'warning' } };
  return <StatusBadge {...map[status]} label={status} size="sm" />;
}

function KioskFormDialog({ open, onOpenChange, onSubmit, isLoading }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: Parameters<typeof kioskApi.create>[0]) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({ name: '', location: '', type: 'self_checkout' as Kiosk['type'], storeId: 1, features: { payment: true, scanner: true, printer: true, camera: false } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><DialogHeader><DialogTitle>Add Kiosk</DialogTitle><DialogDescription>Register a new kiosk terminal</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Type</Label><Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v as Kiosk['type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="self_checkout">Self Checkout</SelectItem><SelectItem value="product_info">Product Info</SelectItem><SelectItem value="order_pickup">Order Pickup</SelectItem><SelectItem value="returns">Returns</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>Location *</Label><Input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} /></div>
          <div className="space-y-3">
            <Label>Features</Label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.features.payment} onChange={e => setFormData({ ...formData, features: { ...formData.features, payment: e.target.checked } })} className="h-4 w-4 rounded border-gray-300" /><span className="text-sm">Payment</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.features.scanner} onChange={e => setFormData({ ...formData, features: { ...formData.features, scanner: e.target.checked } })} className="h-4 w-4 rounded border-gray-300" /><span className="text-sm">Scanner</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.features.printer} onChange={e => setFormData({ ...formData, features: { ...formData.features, printer: e.target.checked } })} className="h-4 w-4 rounded border-gray-300" /><span className="text-sm">Printer</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.features.camera} onChange={e => setFormData({ ...formData, features: { ...formData.features, camera: e.target.checked } })} className="h-4 w-4 rounded border-gray-300" /><span className="text-sm">Camera</span></label>
            </div>
          </div>
        </div>
        <DialogButtons onCancel={() => onOpenChange(false)} onConfirm={() => onSubmit(formData)} confirmText={isLoading ? 'Adding...' : 'Add Kiosk'} confirmLoading={isLoading} confirmDisabled={!formData.name || !formData.location} />
      </DialogContent>
    </Dialog>
  );
}
