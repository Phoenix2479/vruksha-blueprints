import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi, aiActionsApi, privacyApi, auditApi, journeyApi } from '../api/crm360Api';
import type { CustomerProfile } from '../types/crm360';
import { formatCurrency } from '@shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger, Switch, Label } from '@shared/components/ui';
import { DialogButtons } from '@shared/components/blocks';
import { spacing } from '@shared/styles/spacing';
import { Users, Search, Eye, Crown, AlertTriangle, DollarSign, Bot, Shield, Activity, CheckCircle, XCircle, Play, FileText, Download, Trash2, ChevronRight, Plus } from 'lucide-react';

const CURRENCY = 'INR';

interface Customer360PageProps {
  embedded?: boolean;
  activeSection?: 'customers' | 'ai_actions' | 'privacy' | 'audit';
}

export default function Customer360Page({ embedded = false, activeSection }: Customer360PageProps) {
  const [activeTab, setActiveTab] = useState(activeSection || 'customers');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSegment, setFilterSegment] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [showJourney, setShowJourney] = useState<string | null>(null);

  const { data: stats } = useQuery({ queryKey: ['customer-stats'], queryFn: customerApi.getStats });
  const { data: customers = [], isLoading } = useQuery({ queryKey: ['customers', filterSegment, searchTerm], queryFn: () => customerApi.list({ segment: filterSegment !== 'all' ? filterSegment : undefined, search: searchTerm || undefined }) });

  const formatPrice = (n: number) => formatCurrency(n, CURRENCY);

  // If embedded and showing specific section, render just that section
  if (embedded && activeSection && activeSection !== 'customers') {
    return (
      <div className="space-y-6">
        {activeSection === 'ai_actions' && <AIActionsTab />}
        {activeSection === 'privacy' && <PrivacyTab customers={customers} />}
        {activeSection === 'audit' && <AuditTrailTab />}
      </div>
    );
  }

  // Customers view (embedded or standalone)
  const customersContent = (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" /></div>
        <Select value={filterSegment} onValueChange={setFilterSegment}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Segment" /></SelectTrigger><SelectContent><SelectItem value="all">All Segments</SelectItem><SelectItem value="vip">VIP</SelectItem><SelectItem value="loyal">Loyal</SelectItem><SelectItem value="regular">Regular</SelectItem><SelectItem value="new">New</SelectItem><SelectItem value="at_risk">At Risk</SelectItem></SelectContent></Select>
        <Button className="ml-auto"><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Segment</TableHead><TableHead className="text-right">LTV</TableHead><TableHead className="text-right">Orders</TableHead><TableHead>Last Order</TableHead><TableHead className="w-[150px]">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell></TableRow>) : customers.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-gray-500">No customers found</TableCell></TableRow> : customers.map(c => (
              <TableRow key={c.id}>
                <TableCell><div><p className="font-medium">{c.name}</p><p className="text-xs text-gray-500">{c.email}</p></div></TableCell>
                <TableCell><SegmentBadge segment={c.segment} /></TableCell>
                <TableCell className="text-right font-semibold">{formatPrice(c.lifetimeValue)}</TableCell>
                <TableCell className="text-right">{c.totalOrders}</TableCell>
                <TableCell>{c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : '-'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedCustomer(c)} title="View"><Eye className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowJourney(c.id)} title="Journey"><Activity className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {selectedCustomer && <CustomerDetailDialog customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />}
      {showJourney && <JourneyDialog customerId={showJourney} onClose={() => setShowJourney(null)} />}
    </div>
  );

  // If embedded, just return customers content
  if (embedded) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 rounded-lg"><Users className="h-5 w-5 text-rose-600" /></div>
              <div><p className="text-sm text-muted-foreground">Total Customers</p><p className="text-2xl font-bold">{stats?.totalCustomers || 0}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><Crown className="h-5 w-5 text-amber-600" /></div>
              <div><p className="text-sm text-muted-foreground">VIP</p><p className="text-2xl font-bold">{stats?.vip || 0}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div><p className="text-sm text-muted-foreground">At Risk</p><p className="text-2xl font-bold">{stats?.atRisk || 0}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">Avg LTV</p><p className="text-2xl font-bold">{formatPrice(stats?.avgLifetimeValue || 0)}</p></div>
            </div>
          </Card>
        </div>
        {customersContent}
      </div>
    );
  }

  // Standalone mode with full layout
  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-lg">
              <Users className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Customer 360</h1>
              <p className="text-sm text-muted-foreground">AI-Powered CRM with Privacy Controls</p>
            </div>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
        <div className={`grid grid-cols-1 md:grid-cols-4 ${spacing.cardGap}`}>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 rounded-lg"><Users className="h-5 w-5 text-rose-600" /></div>
              <div><p className="text-sm text-muted-foreground">Total Customers</p><p className="text-2xl font-bold">{stats?.totalCustomers || 0}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><Crown className="h-5 w-5 text-amber-600" /></div>
              <div><p className="text-sm text-muted-foreground">VIP</p><p className="text-2xl font-bold">{stats?.vip || 0}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div><p className="text-sm text-muted-foreground">At Risk</p><p className="text-2xl font-bold">{stats?.atRisk || 0}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">Avg LTV</p><p className="text-2xl font-bold">{formatPrice(stats?.avgLifetimeValue || 0)}</p></div>
            </div>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="customers" className="gap-2"><Users className="h-4 w-4" />Customers</TabsTrigger>
            <TabsTrigger value="ai_actions" className="gap-2"><Bot className="h-4 w-4" />AI Actions</TabsTrigger>
            <TabsTrigger value="privacy" className="gap-2"><Shield className="h-4 w-4" />Privacy</TabsTrigger>
            <TabsTrigger value="audit" className="gap-2"><FileText className="h-4 w-4" />Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="customers" className="mt-6">
            {customersContent}
          </TabsContent>

          <TabsContent value="ai_actions" className="mt-6">
            <AIActionsTab />
          </TabsContent>

          <TabsContent value="privacy" className="mt-6">
            <PrivacyTab customers={customers} />
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <AuditTrailTab />
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}

function AIActionsTab() {
  const [actionFilter, setActionFilter] = useState('pending');
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-actions', actionFilter],
    queryFn: () => aiActionsApi.list(actionFilter)
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => aiActionsApi.approve(id, status),
    onSuccess: () => { refetch(); }
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => aiActionsApi.execute(id),
    onSuccess: () => { refetch(); }
  });

  const actions = data?.actions || [];
  const summary = data?.summary || { pending: 0, approved: 0, rejected: 0, executed: 0 };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> AI-Powered Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Review and approve AI-recommended actions. All actions are transparent with reasoning provided.</p>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-amber-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-amber-600">{summary.pending}</p>
              <p className="text-xs text-amber-700">Pending</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600">{summary.approved}</p>
              <p className="text-xs text-green-700">Approved</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-600">{summary.rejected}</p>
              <p className="text-xs text-red-700">Rejected</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.executed}</p>
              <p className="text-xs text-blue-700">Executed</p>
            </div>
          </div>
          
          <div className="flex gap-2 mb-4">
            {['pending', 'approved', 'rejected', 'all'].map(s => (
              <Button key={s} variant={actionFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setActionFilter(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</Button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No {actionFilter} actions</div>
          ) : (
            <div className="space-y-3">
              {actions.map((action: any) => (
                <Card key={action.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={action.status === 'pending' ? 'outline' : action.status === 'approved' ? 'default' : 'destructive'}>
                          {action.status}
                        </Badge>
                        <span className="font-medium">{action.action_type.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground">Confidence: {(action.confidence_score * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{action.reasoning || 'AI-recommended action based on customer behavior analysis'}</p>
                      <p className="text-xs text-muted-foreground">Target: {action.target_type} | Created: {new Date(action.created_at).toLocaleString()}</p>
                    </div>
                    {action.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-green-600" onClick={() => approveMutation.mutate({ id: action.id, status: 'approved' })}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => approveMutation.mutate({ id: action.id, status: 'rejected' })}>
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                    {action.status === 'approved' && !action.executed_at && (
                      <Button size="sm" onClick={() => executeMutation.mutate(action.id)}>
                        <Play className="h-4 w-4 mr-1" /> Execute
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PrivacyTab({ customers }: { customers: CustomerProfile[] }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  const { data: consentData, refetch } = useQuery({
    queryKey: ['consent', selectedCustomerId],
    queryFn: () => privacyApi.getConsent(selectedCustomerId),
    enabled: !!selectedCustomerId
  });

  const updateConsentMutation = useMutation({
    mutationFn: ({ type, granted }: { type: string; granted: boolean }) => 
      privacyApi.updateConsent(selectedCustomerId, type, granted),
    onSuccess: () => refetch()
  });

  const exportMutation = useMutation({
    mutationFn: () => privacyApi.exportData(selectedCustomerId)
  });

  const consents = consentData?.consents || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Privacy & Consent Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">GDPR-compliant consent tracking, data export, and deletion requests.</p>
          
          <div className="mb-6">
            <Label>Select Customer</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-full max-w-md mt-1">
                <SelectValue placeholder="Choose a customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.slice(0, 20).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCustomerId && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">Consent Preferences</h3>
                <div className="space-y-3">
                  {['marketing_email', 'sms', 'data_processing', 'third_party_sharing', 'analytics'].map(type => {
                    const consent = consents.find((c: any) => c.type === type);
                    return (
                      <div key={type} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium">{type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                          {consent?.granted_at && <p className="text-xs text-muted-foreground">Last updated: {new Date(consent.granted_at).toLocaleDateString()}</p>}
                        </div>
                        <Switch 
                          checked={consent?.granted || false} 
                          onCheckedChange={(checked) => updateConsentMutation.mutate({ type, granted: checked })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
                  <Download className="h-4 w-4 mr-2" />
                  {exportMutation.isPending ? 'Exporting...' : 'Export Customer Data'}
                </Button>
                <Button variant="outline" className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" /> Request Deletion
                </Button>
              </div>

              {exportMutation.data && (
                <Card className="p-4 bg-green-50">
                  <p className="text-sm text-green-800">Data export generated successfully. Contains {exportMutation.data.transactions?.length || 0} transactions.</p>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTrailTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-trail'],
    queryFn: () => auditApi.getTrail()
  });

  const entries = data?.entries || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Audit Trail</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">Complete history of data access and modifications for compliance.</p>
        
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No audit entries yet</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant="outline">{entry.event_type.replace(/_/g, ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.entity_type} <span className="text-muted-foreground text-xs">{entry.entity_id?.slice(0, 8)}...</span>
                  </TableCell>
                  <TableCell className="text-sm">{entry.user_id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function JourneyDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['journey', customerId],
    queryFn: () => journeyApi.get(customerId)
  });

  const stages = ['prospect', 'new', 'activated', 'active', 'loyal', 'at_risk', 'churned'];
  const currentStageIndex = stages.indexOf(data?.current_stage || 'new');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Customer Journey</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-8"><Skeleton className="h-32 w-full" /></div>
        ) : (
          <div className="space-y-6 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">Lifecycle Stage</p>
              <div className="flex items-center gap-1">
                {stages.map((stage, i) => (
                  <div key={stage} className="flex items-center">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      i === currentStageIndex ? 'bg-primary text-primary-foreground' :
                      i < currentStageIndex ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
                    }`}>
                      {stage.replace('_', ' ')}
                    </div>
                    {i < stages.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-3">Journey Timeline</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(data?.timeline || []).map((event: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{event.event}</p>
                      <p className="text-xs text-muted-foreground">{event.channel} | {new Date(event.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {data?.recommendations && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Recommended Actions</p>
                <div className="flex flex-wrap gap-2">
                  {data.recommendations.map((rec: string, i: number) => (
                    <Badge key={i} variant="outline">{rec}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        <DialogButtons onCancel={onClose} cancelText="Close" />
      </DialogContent>
    </Dialog>
  );
}

function SegmentBadge({ segment }: { segment: CustomerProfile['segment'] }) {
  const colors = { vip: 'bg-amber-100 text-amber-800', loyal: 'bg-blue-100 text-blue-800', regular: 'bg-gray-100 text-gray-800', new: 'bg-green-100 text-green-800', at_risk: 'bg-red-100 text-red-800' };
  return <Badge className={colors[segment]}>{segment.replace('_', ' ')}</Badge>;
}

function CustomerDetailDialog({ customer, onClose }: { customer: CustomerProfile; onClose: () => void }) {
  const { data: activity = [] } = useQuery({ queryKey: ['customer-activity', customer.id], queryFn: () => customerApi.getActivity(customer.id) });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{customer.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Segment</span><SegmentBadge segment={customer.segment} /></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Lifetime Value</span><span className="font-bold">{formatCurrency(customer.lifetimeValue, CURRENCY)}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Orders</span><span>{customer.totalOrders}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Avg Order</span><span>{formatCurrency(customer.avgOrderValue, CURRENCY)}</span></div>
          {activity.length > 0 && (<div className="space-y-2"><p className="font-medium">Recent Activity</p><div className="space-y-1">{activity.slice(0, 5).map(a => (
            <div key={a.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"><span>{a.title || a.description}</span><span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span></div>
          ))}</div></div>)}
        </div>
        <DialogButtons onCancel={onClose} cancelText="Close" />
      </DialogContent>
    </Dialog>
  );
}
