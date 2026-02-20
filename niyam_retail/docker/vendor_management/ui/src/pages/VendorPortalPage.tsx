import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorPortalApi, type Vendor, type VendorStats } from '../api/vendorPortalApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Skeleton, Badge } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import { Truck, Plus, Search, Star, DollarSign, ShoppingCart, Eye, Phone, Mail } from 'lucide-react';

const CURRENCY = 'INR';

export default function VendorPortalPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stats } = useQuery<VendorStats>({ queryKey: ['vendor-stats'], queryFn: vendorPortalApi.getStats });
  const { data: vendors = [], isLoading } = useQuery({ queryKey: ['vendors'], queryFn: () => vendorPortalApi.list() });

  const createMutation = useMutation({ mutationFn: vendorPortalApi.create, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vendors'] }); setIsVendorDialogOpen(false); } });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);
  const filtered = vendors.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.code.toLowerCase().includes(searchTerm.toLowerCase()));
  const topRated = [...vendors].sort((a, b) => b.rating - a.rating).slice(0, 10);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Truck className="h-7 w-7 text-indigo-600" />
            <div><h1 className="text-xl font-bold">Vendor Portal</h1><p className="text-sm text-muted-foreground">Supplier management</p></div>
          </div>
          <Button onClick={() => setIsVendorDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Vendor</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Vendors" value={`${stats?.totalVendors || 0}`} icon={Truck} iconColor="text-indigo-600" iconBgColor="bg-indigo-100" />
          <StatsCard title="Active" value={`${stats?.active || 0}`} icon={Truck} iconColor="text-green-600" iconBgColor="bg-green-100" />
          <StatsCard title="Avg Rating" value={`${(stats?.avgRating || 0).toFixed(1)}/5`} icon={Star} iconColor="text-amber-600" iconBgColor="bg-amber-100" />
          <StatsCard title="Pending Payments" value={formatPrice(stats?.pendingPayments || 0)} icon={DollarSign} iconColor="text-red-600" iconBgColor="bg-red-100" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Vendors</TabsTrigger>
            <TabsTrigger value="top">Top Rated</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" /></div>
                <Button onClick={() => setIsVendorDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Vendor</Button>
              </div>
              <Card><ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-center">Rating</TableHead><TableHead>Terms</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {isLoading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-12 w-full" /></TableCell></TableRow>) : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No vendors found</TableCell></TableRow> : filtered.map(v => (
                      <TableRow key={v.id}>
                        <TableCell><div><p className="font-medium">{v.name}</p><p className="text-xs text-muted-foreground">{v.email}</p></div></TableCell>
                        <TableCell><Badge variant="outline">{v.code}</Badge></TableCell>
                        <TableCell><VendorStatusBadge status={v.status} /></TableCell>
                        <TableCell className="text-right">{v.totalOrders}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(v.totalValue)}</TableCell>
                        <TableCell className="text-center"><div className="flex items-center justify-center gap-1"><Star className="h-4 w-4 text-amber-500 fill-amber-500" />{v.rating.toFixed(1)}</div></TableCell>
                        <TableCell>{v.paymentTerms}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea></Card>
            </div>
          </TabsContent>

          <TabsContent value="top" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRated.length === 0 ? <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No vendors</CardContent></Card> : topRated.map((v, i) => (
                <Card key={v.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div><span className="text-lg font-bold text-muted-foreground">#{i + 1}</span><h3 className="font-medium">{v.name}</h3><p className="text-xs text-muted-foreground">{v.code}</p></div>
                      <div className="flex items-center gap-1 text-amber-500"><Star className="h-5 w-5 fill-amber-500" /><span className="font-bold">{v.rating.toFixed(1)}</span></div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Orders:</span> <span className="font-medium">{v.totalOrders}</span></div>
                      <div><span className="text-muted-foreground">Value:</span> <span className="font-semibold">{formatPrice(v.totalValue)}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <VendorFormDialog open={isVendorDialogOpen} onOpenChange={setIsVendorDialogOpen} onSubmit={data => createMutation.mutate(data)} isLoading={createMutation.isPending} />
    </div>
  );
}

function VendorStatusBadge({ status }: { status: Vendor['status'] }) {
  const map: Record<Vendor['status'], { status: 'active' | 'inactive' | 'warning' }> = { active: { status: 'active' }, inactive: { status: 'inactive' }, pending: { status: 'warning' } };
  return <StatusBadge {...map[status]} label={status} size="sm" />;
}

function VendorFormDialog({ open, onOpenChange, onSubmit, isLoading }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: Parameters<typeof vendorPortalApi.create>[0]) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', paymentTerms: 'Net 30' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><DialogHeader><DialogTitle>Add Vendor</DialogTitle><DialogDescription>Register a new supplier</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Vendor Name *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Payment Terms</Label><Select value={formData.paymentTerms} onValueChange={v => setFormData({ ...formData, paymentTerms: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Net 15">Net 15</SelectItem><SelectItem value="Net 30">Net 30</SelectItem><SelectItem value="Net 45">Net 45</SelectItem><SelectItem value="Net 60">Net 60</SelectItem></SelectContent></Select></div>
        </div>
        <DialogButtons onCancel={() => onOpenChange(false)} onConfirm={() => onSubmit(formData)} confirmText={isLoading ? 'Adding...' : 'Add Vendor'} confirmLoading={isLoading} confirmDisabled={!formData.name || !formData.email} />
      </DialogContent>
    </Dialog>
  );
}
