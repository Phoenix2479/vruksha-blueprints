import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi, type Asset, type AssetStats } from '../api/assetApi';
import { formatCurrency } from '@/lib/utils';
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  ScrollArea, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Skeleton,
} from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '@/components/blocks';
import {
  Package, Plus, Edit2, Trash2, MapPin, Wrench, DollarSign,
  Search, AlertTriangle, CheckCircle,
} from 'lucide-react';

const CURRENCY = 'INR';

export default function AssetTrackerPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAssetDialogOpen, setIsAssetDialogOpen] = useState(false);
  const [_selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  void _selectedAsset; // Used for future edit functionality
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { data: stats } = useQuery<AssetStats>({ queryKey: ['asset-stats'], queryFn: assetApi.getStats });
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets', filterCategory, filterStatus],
    queryFn: () => assetApi.list({
      category: filterCategory !== 'all' ? filterCategory as Asset['category'] : undefined,
      status: filterStatus !== 'all' ? filterStatus as Asset['status'] : undefined,
    }),
  });

  const createMutation = useMutation({
    mutationFn: assetApi.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setIsAssetDialogOpen(false); },
  });
  const deleteMutation = useMutation({
    mutationFn: assetApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.assetTag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const maintenanceDue = assets.filter(a => a.nextMaintenanceDate && new Date(a.nextMaintenanceDate) <= new Date());

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-orange-600" />
            <div>
              <h1 className="text-xl font-bold">Asset Tracker</h1>
              <p className="text-sm text-muted-foreground">Equipment, inventory & maintenance</p>
            </div>
          </div>
          <Button onClick={() => setIsAssetDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Asset</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="assets">All Assets</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard title="Total Assets" value={`${stats?.totalAssets || 0}`} icon={Package} iconColor="text-orange-600" iconBgColor="bg-orange-100" />
                <StatsCard title="Available" value={`${stats?.availableAssets || 0}`} icon={CheckCircle} iconColor="text-green-600" iconBgColor="bg-green-100" subtitle={`${stats?.inUseAssets || 0} in use`} />
                <StatsCard title="Maintenance Due" value={`${stats?.maintenanceDue || 0}`} icon={Wrench} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
                <StatsCard title="Total Value" value={formatPrice(stats?.totalValue || 0)} icon={DollarSign} iconColor="text-blue-600" iconBgColor="bg-blue-100" subtitle={`${formatPrice(stats?.depreciatedValue || 0)} current`} />
              </div>

              {maintenanceDue.length > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                      <AlertTriangle className="h-5 w-5" /> Maintenance Due
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {maintenanceDue.slice(0, 5).map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 bg-white rounded">
                          <div>
                            <p className="font-medium">{a.name}</p>
                            <p className="text-xs text-muted-foreground">{a.assetTag} • {a.location}</p>
                          </div>
                          <Badge variant="outline">{new Date(a.nextMaintenanceDate!).toLocaleDateString()}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="assets" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search assets..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="furniture">Furniture</SelectItem>
                    <SelectItem value="electronics">Electronics</SelectItem>
                    <SelectItem value="vehicle">Vehicle</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_use">In Use</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => setIsAssetDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Asset</Button>
              </div>

              <Card>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-12 w-full" /></TableCell></TableRow>)
                      ) : filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No assets found</TableCell></TableRow>
                      ) : (
                        filtered.map(a => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <div><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.assetTag}</p></div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{a.category}</Badge></TableCell>
                            <TableCell><div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{a.location}</div></TableCell>
                            <TableCell>{a.assignedToName || '-'}</TableCell>
                            <TableCell className="text-right">{formatPrice(a.currentValue)}</TableCell>
                            <TableCell><AssetStatusBadge status={a.status} /></TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedAsset(a)}><Edit2 className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="maintenance" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Maintenance Schedule</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {assets.filter(a => a.nextMaintenanceDate).sort((a, b) => new Date(a.nextMaintenanceDate!).getTime() - new Date(b.nextMaintenanceDate!).getTime()).map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <div className="flex items-center gap-3">
                        <Wrench className={`h-5 w-5 ${new Date(a.nextMaintenanceDate!) <= new Date() ? 'text-red-500' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.assetTag} • {a.location}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${new Date(a.nextMaintenanceDate!) <= new Date() ? 'text-red-600' : ''}`}>
                          {new Date(a.nextMaintenanceDate!).toLocaleDateString()}
                        </p>
                        {a.lastMaintenanceDate && <p className="text-xs text-muted-foreground">Last: {new Date(a.lastMaintenanceDate).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  ))}
                  {assets.filter(a => a.nextMaintenanceDate).length === 0 && <p className="text-center text-muted-foreground py-8">No maintenance scheduled</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AssetFormDialog open={isAssetDialogOpen} onOpenChange={setIsAssetDialogOpen} onSubmit={data => createMutation.mutate(data)} isLoading={createMutation.isPending} />
    </div>
  );
}

function AssetStatusBadge({ status }: { status: Asset['status'] }) {
  const map: Record<Asset['status'], { status: 'active' | 'inactive' | 'warning' }> = {
    available: { status: 'active' }, in_use: { status: 'warning' },
    maintenance: { status: 'warning' }, retired: { status: 'inactive' }, lost: { status: 'inactive' },
  };
  return <StatusBadge {...map[status]} label={status.replace('_', ' ')} size="sm" />;
}

function AssetFormDialog({ open, onOpenChange, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: Parameters<typeof assetApi.create>[0]) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '', category: 'equipment' as Asset['category'], location: '',
    purchaseDate: '', purchasePrice: 0, serialNumber: '', manufacturer: '', model: '',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Asset</DialogTitle>
          <DialogDescription>Register a new asset in the system</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v as Asset['category'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="furniture">Furniture</SelectItem>
                  <SelectItem value="electronics">Electronics</SelectItem>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="software">Software</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Location *</Label><Input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} /></div>
            <div className="space-y-2"><Label>Serial Number</Label><Input value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Purchase Date *</Label><Input type="date" value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Purchase Price *</Label><Input type="number" value={formData.purchasePrice || ''} onChange={e => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Manufacturer</Label><Input value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} /></div>
            <div className="space-y-2"><Label>Model</Label><Input value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} /></div>
          </div>
        </div>
        <DialogButtons onCancel={() => onOpenChange(false)} onConfirm={() => onSubmit(formData)} confirmText={isLoading ? 'Adding...' : 'Add Asset'} confirmLoading={isLoading} confirmDisabled={!formData.name || !formData.location || !formData.purchaseDate} />
      </DialogContent>
    </Dialog>
  );
}
