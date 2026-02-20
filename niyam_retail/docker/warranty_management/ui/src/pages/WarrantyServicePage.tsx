import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { claimsApi, policiesApi, registrationsApi, type WarrantyClaim, type WarrantyStats } from '../api/warrantyApi';
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  ScrollArea, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Skeleton,
} from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import {
  Shield, Plus, Edit2, Trash2, Clock, CheckCircle, AlertTriangle,
  FileText, Search, Calendar, Wrench,
} from 'lucide-react';

export default function WarrantyServicePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isClaimDialogOpen, setIsClaimDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<WarrantyClaim | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stats } = useQuery<WarrantyStats>({ queryKey: ['warranty-stats'], queryFn: claimsApi.getStats });
  const { data: claims = [], isLoading: loadingClaims } = useQuery({ queryKey: ['warranty-claims'], queryFn: () => claimsApi.list() });
  const { data: policies = [] } = useQuery({ queryKey: ['warranty-policies'], queryFn: policiesApi.list });
  const { data: registrations = [] } = useQuery({ queryKey: ['warranty-registrations'], queryFn: () => registrationsApi.list() });

  const createClaimMutation = useMutation({
    mutationFn: claimsApi.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warranty-claims'] }); setIsClaimDialogOpen(false); },
  });
  const updateClaimMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof claimsApi.update>[1] }) => claimsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warranty-claims'] }); setSelectedClaim(null); },
  });
  const deleteClaimMutation = useMutation({
    mutationFn: claimsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warranty-claims'] }),
  });

  const filteredClaims = claims.filter(c =>
    c.claimNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-green-600" />
            <div>
              <h1 className="text-xl font-bold">Warranty Service</h1>
              <p className="text-sm text-muted-foreground">Claims, policies & registrations</p>
            </div>
          </div>
          <Button onClick={() => setIsClaimDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Claim
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard title="Total Claims" value={`${stats?.totalClaims || 0}`} icon={FileText} iconColor="text-blue-600" iconBgColor="bg-blue-100" />
                <StatsCard title="Pending" value={`${stats?.pendingClaims || 0}`} icon={Clock} iconColor="text-amber-600" iconBgColor="bg-amber-100" subtitle={`${stats?.inProgressClaims || 0} in progress`} />
                <StatsCard title="Approval Rate" value={`${((stats?.approvalRate || 0) * 100).toFixed(0)}%`} icon={CheckCircle} iconColor="text-green-600" iconBgColor="bg-green-100" />
                <StatsCard title="Avg Resolution" value={`${(stats?.avgResolutionDays || 0).toFixed(1)} days`} icon={Wrench} iconColor="text-purple-600" iconBgColor="bg-purple-100" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">Recent Claims</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {claims.slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                          <div>
                            <p className="font-medium">{c.claimNumber}</p>
                            <p className="text-xs text-muted-foreground">{c.customerName} - {c.productName}</p>
                          </div>
                          <ClaimStatusBadge status={c.status} />
                        </div>
                      ))}
                      {claims.length === 0 && <p className="text-center text-muted-foreground py-4">No claims yet</p>}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Expiring Warranties</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <AlertTriangle className="h-10 w-10 mx-auto mb-2 text-amber-500" />
                      <p className="text-2xl font-bold">{stats?.expiringThisMonth || 0}</p>
                      <p className="text-sm text-muted-foreground">warranties expiring this month</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="claims" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search claims..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <Button onClick={() => setIsClaimDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Claim</Button>
              </div>

              <Card>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Issue</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingClaims ? (
                        Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-12 w-full" /></TableCell></TableRow>)
                      ) : filteredClaims.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No claims found</TableCell></TableRow>
                      ) : (
                        filteredClaims.map(c => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.claimNumber}</TableCell>
                            <TableCell>{c.customerName}</TableCell>
                            <TableCell>{c.productName}</TableCell>
                            <TableCell><Badge variant="outline">{c.issueType.replace('_', ' ')}</Badge></TableCell>
                            <TableCell><PriorityBadge priority={c.priority} /></TableCell>
                            <TableCell><ClaimStatusBadge status={c.status} /></TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedClaim(c)}><Edit2 className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Delete?')) deleteClaimMutation.mutate(c.id); }}><Trash2 className="h-4 w-4" /></Button>
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

          <TabsContent value="policies" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {policies.map(p => (
                <Card key={p.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{p.name}</h3>
                        <Badge variant="outline" className="mt-1">{p.coverageType}</Badge>
                      </div>
                      <Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{p.description}</p>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      <span>{p.durationMonths} months</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {policies.length === 0 && (
                <Card className="col-span-3"><CardContent className="py-8 text-center text-muted-foreground">No policies configured</CardContent></Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="registrations" className="mt-6">
            <Card>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Serial #</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No registrations yet</TableCell></TableRow>
                    ) : (
                      registrations.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.customerName}</TableCell>
                          <TableCell>{r.productName}</TableCell>
                          <TableCell><code className="bg-muted px-2 py-0.5 rounded text-sm">{r.serialNumber}</code></TableCell>
                          <TableCell>{r.warrantyPolicyName}</TableCell>
                          <TableCell>{new Date(r.warrantyEndDate).toLocaleDateString()}</TableCell>
                          <TableCell><StatusBadge status={r.status === 'active' ? 'active' : 'inactive'} label={r.status} size="sm" /></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <ClaimFormDialog
        open={isClaimDialogOpen}
        onOpenChange={setIsClaimDialogOpen}
        onSubmit={data => createClaimMutation.mutate(data)}
        isLoading={createClaimMutation.isPending}
      />

      {selectedClaim && (
        <ClaimUpdateDialog
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onUpdate={data => updateClaimMutation.mutate({ id: selectedClaim.id, data })}
          isLoading={updateClaimMutation.isPending}
        />
      )}
    </div>
  );
}

function ClaimStatusBadge({ status }: { status: WarrantyClaim['status'] }) {
  const map: Record<WarrantyClaim['status'], { status: 'active' | 'inactive' | 'warning' }> = {
    pending: { status: 'warning' }, in_review: { status: 'warning' }, approved: { status: 'active' },
    rejected: { status: 'inactive' }, in_repair: { status: 'warning' }, completed: { status: 'active' }, closed: { status: 'inactive' },
  };
  return <StatusBadge {...map[status]} label={status.replace('_', ' ')} size="sm" />;
}

function PriorityBadge({ priority }: { priority: WarrantyClaim['priority'] }) {
  const colors: Record<WarrantyClaim['priority'], string> = {
    low: 'bg-gray-100 text-gray-800', medium: 'bg-blue-100 text-blue-800',
    high: 'bg-amber-100 text-amber-800', urgent: 'bg-red-100 text-red-800',
  };
  return <Badge className={colors[priority]}>{priority}</Badge>;
}

function ClaimFormDialog({ open, onOpenChange, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: Parameters<typeof claimsApi.create>[0]) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    customerId: '', productId: '', serialNumber: '', purchaseDate: '',
    issueType: 'defect' as WarrantyClaim['issueType'], issueDescription: '', priority: 'medium' as WarrantyClaim['priority'],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Warranty Claim</DialogTitle>
          <DialogDescription>Submit a warranty claim for a product</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Customer ID *</Label><Input value={formData.customerId} onChange={e => setFormData({ ...formData, customerId: e.target.value })} /></div>
            <div className="space-y-2"><Label>Product ID *</Label><Input value={formData.productId} onChange={e => setFormData({ ...formData, productId: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Serial Number</Label><Input value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} /></div>
            <div className="space-y-2"><Label>Purchase Date *</Label><Input type="date" value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Issue Type *</Label>
              <Select value={formData.issueType} onValueChange={v => setFormData({ ...formData, issueType: v as WarrantyClaim['issueType'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="defect">Defect</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="malfunction">Malfunction</SelectItem>
                  <SelectItem value="missing_parts">Missing Parts</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v as WarrantyClaim['priority'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Issue Description *</Label>
            <textarea className="w-full min-h-[80px] p-3 border rounded-md resize-none" value={formData.issueDescription} onChange={e => setFormData({ ...formData, issueDescription: e.target.value })} />
          </div>
        </div>
        <DialogButtons onCancel={() => onOpenChange(false)} onConfirm={() => onSubmit(formData)} confirmText={isLoading ? 'Submitting...' : 'Submit Claim'} confirmLoading={isLoading} confirmDisabled={!formData.customerId || !formData.productId || !formData.purchaseDate || !formData.issueDescription} />
      </DialogContent>
    </Dialog>
  );
}

function ClaimUpdateDialog({ claim, onClose, onUpdate, isLoading }: {
  claim: WarrantyClaim; onClose: () => void;
  onUpdate: (data: Parameters<typeof claimsApi.update>[1]) => void; isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    status: claim.status, priority: claim.priority, resolution: claim.resolution || '' as WarrantyClaim['resolution'] | '',
    resolutionNotes: claim.resolutionNotes || '', assignedTo: claim.assignedTo || '',
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Claim {claim.claimNumber}</DialogTitle>
          <DialogDescription>{claim.customerName} - {claim.productName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as WarrantyClaim['status'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="in_repair">In Repair</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={formData.resolution || ''} onValueChange={v => setFormData({ ...formData, resolution: v as WarrantyClaim['resolution'] })}>
                <SelectTrigger><SelectValue placeholder="Select resolution" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="replace">Replace</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Assigned To</Label><Input value={formData.assignedTo} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Resolution Notes</Label>
            <textarea className="w-full min-h-[80px] p-3 border rounded-md resize-none" value={formData.resolutionNotes} onChange={e => setFormData({ ...formData, resolutionNotes: e.target.value })} />
          </div>
        </div>
        <DialogButtons onCancel={onClose} onConfirm={() => onUpdate({ status: formData.status, priority: formData.priority, resolution: formData.resolution || undefined, resolutionNotes: formData.resolutionNotes, assignedTo: formData.assignedTo })} confirmText={isLoading ? 'Updating...' : 'Update Claim'} confirmLoading={isLoading} />
      </DialogContent>
    </Dialog>
  );
}
