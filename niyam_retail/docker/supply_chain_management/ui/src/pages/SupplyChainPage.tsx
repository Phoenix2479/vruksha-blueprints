import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shipmentApi, type Shipment, type SupplyChainStats } from '../api/supplyChainApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ScrollArea, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Skeleton } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import { Truck, Plus, Eye, Search, Package, Clock, CheckCircle, AlertTriangle, MapPin, ArrowRight } from 'lucide-react';

const CURRENCY = 'INR';

export default function SupplyChainPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isShipmentDialogOpen, setIsShipmentDialogOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { data: stats } = useQuery<SupplyChainStats>({ queryKey: ['supply-stats'], queryFn: shipmentApi.getStats });
  const { data: shipments = [], isLoading } = useQuery({ queryKey: ['shipments', filterStatus], queryFn: () => shipmentApi.list({ status: filterStatus !== 'all' ? filterStatus as Shipment['status'] : undefined }) });

  const createMutation = useMutation({ mutationFn: shipmentApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); setIsShipmentDialogOpen(false); } });
  const updateStatusMutation = useMutation({ mutationFn: ({ id, status }: { id: number; status: Shipment['status'] }) => shipmentApi.updateStatus(id, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipments'] }) });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const filtered = shipments.filter(s => s.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) || s.destination.toLowerCase().includes(searchTerm.toLowerCase()));
  const delayedShipments = shipments.filter(s => s.status === 'delayed');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Truck className="h-7 w-7 text-cyan-600" />
            <div><h1 className="text-xl font-bold">Supply Chain</h1><p className="text-sm text-muted-foreground">Shipments, tracking & logistics</p></div>
          </div>
          <Button onClick={() => setIsShipmentDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Shipment</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="shipments">All Shipments</TabsTrigger>
            <TabsTrigger value="delayed">Delayed ({delayedShipments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard title="Total Shipments" value={`${stats?.totalShipments || 0}`} icon={Package} iconColor="text-cyan-600" iconBgColor="bg-cyan-100" />
                <StatsCard title="In Transit" value={`${stats?.inTransit || 0}`} icon={Truck} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
                <StatsCard title="On-Time Rate" value={`${((stats?.onTimeRate || 0) * 100).toFixed(0)}%`} icon={CheckCircle} iconColor="text-green-600" iconBgColor="bg-green-100" />
                <StatsCard title="Avg Delivery" value={`${(stats?.avgDeliveryDays || 0).toFixed(1)} days`} icon={Clock} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
              </div>

              {delayedShipments.length > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-amber-800"><AlertTriangle className="h-5 w-5" /> Delayed Shipments</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {delayedShipments.slice(0, 5).map(s => (
                        <div key={s.id} className="flex items-center justify-between p-2 bg-white rounded">
                          <div><p className="font-medium">{s.trackingNumber}</p><p className="text-xs text-muted-foreground">{s.origin} → {s.destination}</p></div>
                          <Badge variant="outline">{s.carrier}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle className="text-base">Recent Shipments</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {shipments.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                        <div className="flex items-center gap-3">
                          <ShipmentTypeIcon type={s.type} />
                          <div><p className="font-medium">{s.trackingNumber}</p><p className="text-xs text-muted-foreground">{s.origin} → {s.destination}</p></div>
                        </div>
                        <ShipmentStatusBadge status={s.status} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="shipments" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" /></div>
                <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="in_transit">In Transit</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="delayed">Delayed</SelectItem></SelectContent></Select>
                <Button onClick={() => setIsShipmentDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Shipment</Button>
              </div>
              <Card>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader><TableRow><TableHead>Tracking #</TableHead><TableHead>Type</TableHead><TableHead>Route</TableHead><TableHead>Carrier</TableHead><TableHead>Est. Delivery</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Status</TableHead><TableHead className="w-[80px]">View</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {isLoading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell></TableRow>) : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No shipments found</TableCell></TableRow> : filtered.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.trackingNumber}</TableCell>
                          <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                          <TableCell><div className="flex items-center gap-1 text-sm"><MapPin className="h-3 w-3" />{s.origin}<ArrowRight className="h-3 w-3" />{s.destination}</div></TableCell>
                          <TableCell>{s.carrier}</TableCell>
                          <TableCell>{new Date(s.estimatedDelivery).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">{formatPrice(s.totalValue)}</TableCell>
                          <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                          <TableCell><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedShipment(s)}><Eye className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="delayed" className="mt-6">
            <Card>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader><TableRow><TableHead>Tracking #</TableHead><TableHead>Route</TableHead><TableHead>Carrier</TableHead><TableHead>Est. Delivery</TableHead><TableHead>Items</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {delayedShipments.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No delayed shipments</TableCell></TableRow> : delayedShipments.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.trackingNumber}</TableCell>
                        <TableCell>{s.origin} → {s.destination}</TableCell>
                        <TableCell>{s.carrier}</TableCell>
                        <TableCell className="text-red-600">{new Date(s.estimatedDelivery).toLocaleDateString()}</TableCell>
                        <TableCell>{s.items.length} items</TableCell>
                        <TableCell className="text-right">{formatPrice(s.totalValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <ShipmentFormDialog open={isShipmentDialogOpen} onOpenChange={setIsShipmentDialogOpen} onSubmit={data => createMutation.mutate(data)} isLoading={createMutation.isPending} />
      {selectedShipment && <ShipmentDetailDialog shipment={selectedShipment} onClose={() => setSelectedShipment(null)} onUpdateStatus={(status) => updateStatusMutation.mutate({ id: selectedShipment.id, status })} />}
    </div>
  );
}

function ShipmentTypeIcon({ type }: { type: Shipment['type'] }) {
  const colors = { inbound: 'text-green-600', outbound: 'text-blue-600', transfer: 'text-purple-600' };
  return <Truck className={`h-5 w-5 ${colors[type]}`} />;
}

function ShipmentStatusBadge({ status }: { status: Shipment['status'] }) {
  const map: Record<Shipment['status'], { status: 'active' | 'inactive' | 'warning' }> = { pending: { status: 'warning' }, in_transit: { status: 'warning' }, delivered: { status: 'active' }, delayed: { status: 'inactive' }, cancelled: { status: 'inactive' } };
  return <StatusBadge {...map[status]} label={status.replace('_', ' ')} size="sm" />;
}

function ShipmentFormDialog({ open, onOpenChange, onSubmit, isLoading }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: Parameters<typeof shipmentApi.create>[0]) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({ type: 'inbound' as Shipment['type'], origin: '', destination: '', carrier: '', estimatedDelivery: '', items: [] as Shipment['items'] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><DialogHeader><DialogTitle>New Shipment</DialogTitle><DialogDescription>Create a new shipment</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Type</Label><Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v as Shipment['type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inbound">Inbound</SelectItem><SelectItem value="outbound">Outbound</SelectItem><SelectItem value="transfer">Transfer</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Carrier *</Label><Input value={formData.carrier} onChange={e => setFormData({ ...formData, carrier: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Origin *</Label><Input value={formData.origin} onChange={e => setFormData({ ...formData, origin: e.target.value })} /></div>
            <div className="space-y-2"><Label>Destination *</Label><Input value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Est. Delivery *</Label><Input type="date" value={formData.estimatedDelivery} onChange={e => setFormData({ ...formData, estimatedDelivery: e.target.value })} /></div>
        </div>
        <DialogButtons onCancel={() => onOpenChange(false)} onConfirm={() => onSubmit(formData)} confirmText={isLoading ? 'Creating...' : 'Create Shipment'} confirmLoading={isLoading} confirmDisabled={!formData.origin || !formData.destination || !formData.carrier || !formData.estimatedDelivery} />
      </DialogContent>
    </Dialog>
  );
}

function ShipmentDetailDialog({ shipment, onClose, onUpdateStatus }: { shipment: Shipment; onClose: () => void; onUpdateStatus: (status: Shipment['status']) => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>Shipment {shipment.trackingNumber}</DialogTitle><DialogDescription>{shipment.type} • {shipment.carrier}</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between"><span>Status</span><ShipmentStatusBadge status={shipment.status} /></div>
          <div className="flex items-center justify-between"><span>Route</span><span>{shipment.origin} → {shipment.destination}</span></div>
          <div className="flex items-center justify-between"><span>Est. Delivery</span><span>{new Date(shipment.estimatedDelivery).toLocaleDateString()}</span></div>
          {shipment.actualDelivery && <div className="flex items-center justify-between"><span>Actual Delivery</span><span>{new Date(shipment.actualDelivery).toLocaleDateString()}</span></div>}
          <div className="flex items-center justify-between"><span>Items</span><span>{shipment.items.length} items</span></div>
          <div className="flex items-center justify-between"><span>Total Value</span><span className="font-semibold">{formatCurrency(shipment.totalValue, CURRENCY)}</span></div>
          {shipment.status !== 'delivered' && shipment.status !== 'cancelled' && (
            <div className="space-y-2"><Label>Update Status</Label>
              <Select onValueChange={v => onUpdateStatus(v as Shipment['status'])}><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger><SelectContent><SelectItem value="in_transit">In Transit</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="delayed">Delayed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
            </div>
          )}
        </div>
        <DialogButtons onCancel={onClose} cancelText="Close" />
      </DialogContent>
    </Dialog>
  );
}
