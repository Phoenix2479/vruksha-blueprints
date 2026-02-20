import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInvoices, createInvoice, recordPayment, getRevenueStats } from '../api/billing';
import type { Invoice } from '@shared/types/models';

// Shared UI components
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Skeleton,
  Separator,
} from '@shared/components/ui';

import {
  Sidebar,
  PageHeader,
  StatsCard,
  StatusBadge,
  DialogButtons,
  EmptyState,
  ThemeToggle,
  type SidebarGroup,
} from '@shared/components/blocks';

// Icons
import {
  FileText,
  Plus,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Search,
  Eye,
  CreditCard,
  Loader2,
  X,
  Receipt,
  Clock,
  CheckCircle,
  BarChart3,
  Settings,
  Users,
  ChevronRight,
} from 'lucide-react';

// Tab types
type TabId = 'overview' | 'invoices' | 'payments' | 'customers' | 'reports' | 'settings';

// Sidebar configuration
const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Billing',
    items: [
      { id: 'overview', label: 'Overview', icon: BarChart3 },
      { id: 'invoices', label: 'Invoices', icon: FileText },
      { id: 'payments', label: 'Payments', icon: CreditCard },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'customers', label: 'Customers', icon: Users },
      { id: 'reports', label: 'Reports', icon: Receipt },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function BillingMainPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Invoice form state
  const [customerName, setCustomerName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 0 },
  ]);
  const [notes, setNotes] = useState('');

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');

  // Queries
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: () => getInvoices(statusFilter !== 'all' ? { status: statusFilter } : undefined),
  });

  const { data: stats = { total_revenue: 0, pending_amount: 0, overdue_amount: 0 } } = useQuery({
    queryKey: ['billing-stats'],
    queryFn: getRevenueStats,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-stats'] });
      setShowCreateModal(false);
      resetInvoiceForm();
    },
  });

  const paymentMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-stats'] });
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      resetPaymentForm();
    },
  });

  const resetInvoiceForm = () => {
    setCustomerName('');
    setDueDate('');
    setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
    setNotes('');
  };

  const resetPaymentForm = () => {
    setPaymentAmount(0);
    setPaymentMethod('cash');
    setPaymentRef('');
  };

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const updated = [...invoiceItems];
    (updated[index] as any)[field] = value;
    setInvoiceItems(updated);
  };

  const handleCreateInvoice = () => {
    if (!customerName || !dueDate || invoiceItems.length === 0) return;
    createMutation.mutate({
      customer_id: customerName,
      due_date: dueDate,
      items: invoiceItems.filter((item) => item.description),
      notes,
    });
  };

  const handleRecordPayment = () => {
    if (!selectedInvoice || paymentAmount <= 0) return;
    paymentMutation.mutate({
      invoice_id: selectedInvoice.id,
      amount: paymentAmount,
      payment_method: paymentMethod,
      reference: paymentRef,
    });
  };

  const openPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.total_amount - (invoice.amount_paid || 0));
    setShowPaymentModal(true);
  };

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) =>
      inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [invoices, searchQuery]);

  const invoiceTotal = useMemo(() => {
    return invoiceItems.reduce((sum, item) => {
      const subtotal = item.quantity * item.unit_price;
      const tax = subtotal * (item.tax_rate / 100);
      return sum + subtotal + tax;
    }, 0);
  }, [invoiceItems]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, 'active' | 'warning' | 'error' | 'inactive'> = {
      paid: 'active',
      pending: 'warning',
      overdue: 'error',
      draft: 'inactive',
    };
    return <StatusBadge status={statusMap[status] || 'inactive'} label={status} size="sm" />;
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewContent
            stats={stats}
            invoices={invoices}
            onViewInvoice={(inv) => openPaymentModal(inv)}
          />
        );
      case 'invoices':
        return (
          <InvoicesContent
            invoices={filteredInvoices}
            loading={loadingInvoices}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onCreateInvoice={() => setShowCreateModal(true)}
            onRecordPayment={openPaymentModal}
            getStatusBadge={getStatusBadge}
          />
        );
      case 'payments':
        return <PaymentsContent invoices={invoices} />;
      case 'customers':
        return <CustomersContent />;
      case 'reports':
        return <ReportsContent />;
      case 'settings':
        return <SettingsContent />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        groups={sidebarGroups}
        activeItem={activeTab}
        onItemClick={(id) => setActiveTab(id as TabId)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        header={
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Billing Engine</h1>
              <p className="text-xs text-muted-foreground">Invoice & Payments</p>
            </div>
          </div>
        }
        footer={
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pending</span>
              <Badge variant="secondary">${stats.pending_amount.toLocaleString()}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Overdue</span>
              <Badge variant="destructive">${stats.overdue_amount.toLocaleString()}</Badge>
            </div>
          </div>
        }
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          title={sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label || 'Billing'}
          description={getTabDescription(activeTab)}
          icon={sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.icon}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          sticky
          actions={<ThemeToggle />}
          primaryAction={
            activeTab === 'invoices' ? { label: 'New Invoice', onClick: () => setShowCreateModal(true), icon: Plus } :
            undefined
          }
        />

        <ScrollArea className="flex-1">
          <div className="p-6">
            {renderContent()}
          </div>
        </ScrollArea>
      </main>

      {/* Create Invoice Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Create Invoice
            </DialogTitle>
            <DialogDescription>Create a new invoice for a customer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button variant="outline" size="sm" onClick={addInvoiceItem}>
                  <Plus className="h-4 w-4 mr-1" />Add Item
                </Button>
              </div>

              {invoiceItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Tax %"
                      value={item.tax_rate}
                      onChange={(e) => updateInvoiceItem(index, 'tax_rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      onClick={() => removeInvoiceItem(index)}
                      disabled={invoiceItems.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
              />
            </div>

            <div className="p-3 bg-muted rounded-lg text-right">
              <span className="text-sm text-muted-foreground mr-2">Total:</span>
              <span className="text-xl font-bold">${invoiceTotal.toFixed(2)}</span>
            </div>
          </div>
          <DialogButtons
            onCancel={() => setShowCreateModal(false)}
            onConfirm={handleCreateInvoice}
            confirmText="Create Invoice"
            confirmDisabled={!customerName || !dueDate || createMutation.isPending}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Record Payment
            </DialogTitle>
            <DialogDescription>
              Invoice: {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Amount Due</p>
              <p className="text-2xl font-bold">
                ${((selectedInvoice?.total_amount || 0) - (selectedInvoice?.amount_paid || 0)).toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {['cash', 'card', 'bank'].map((method) => (
                  <Button
                    key={method}
                    variant={paymentMethod === method ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod(method)}
                    className="capitalize"
                  >
                    {method}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Transaction reference"
              />
            </div>
          </div>
          <DialogButtons
            onCancel={() => setShowPaymentModal(false)}
            onConfirm={handleRecordPayment}
            confirmText="Record Payment"
            confirmDisabled={paymentAmount <= 0 || paymentMutation.isPending}
            isLoading={paymentMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getTabDescription(tab: TabId): string {
  switch (tab) {
    case 'overview': return 'Financial dashboard and metrics';
    case 'invoices': return 'Manage customer invoices';
    case 'payments': return 'Payment transactions';
    case 'customers': return 'Customer accounts';
    case 'reports': return 'Financial reports';
    case 'settings': return 'Billing configuration';
    default: return '';
  }
}

// Overview Content
function OverviewContent({ stats, invoices, onViewInvoice }: {
  stats: any;
  invoices: Invoice[];
  onViewInvoice: (invoice: Invoice) => void;
}) {
  const recentInvoices = useMemo(() => {
    return [...invoices].sort((a, b) =>
      new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    ).slice(0, 5);
  }, [invoices]);

  const pendingInvoices = useMemo(() => {
    return invoices.filter(inv => inv.status === 'pending' || inv.status === 'overdue');
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Total Revenue"
          value={`$${stats.total_revenue.toLocaleString()}`}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
        <StatsCard
          title="Pending"
          value={`$${stats.pending_amount.toLocaleString()}`}
          icon={Clock}
          iconColor="text-yellow-600"
          iconBg="bg-yellow-100"
        />
        <StatsCard
          title="Overdue"
          value={`$${stats.overdue_amount.toLocaleString()}`}
          icon={AlertCircle}
          iconColor="text-red-600"
          iconBg="bg-red-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentInvoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No invoices yet</p>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => onViewInvoice(inv)}
                  >
                    <div>
                      <p className="font-medium">{inv.invoice_number}</p>
                      <p className="text-sm text-muted-foreground">{inv.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${inv.total_amount.toFixed(2)}</p>
                      <StatusBadge
                        status={inv.status === 'paid' ? 'active' : inv.status === 'overdue' ? 'error' : 'warning'}
                        label={inv.status}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingInvoices.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-muted-foreground">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvoices.slice(0, 5).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => onViewInvoice(inv)}
                  >
                    <div>
                      <p className="font-medium">{inv.invoice_number}</p>
                      <p className="text-sm text-muted-foreground">Due: {new Date(inv.due_date).toLocaleDateString()}</p>
                    </div>
                    <Badge variant={inv.status === 'overdue' ? 'destructive' : 'secondary'}>
                      ${inv.total_amount.toFixed(2)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Invoices Content
function InvoicesContent({
  invoices, loading, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  onCreateInvoice, onRecordPayment, getStatusBadge
}: {
  invoices: Invoice[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  onCreateInvoice: () => void;
  onRecordPayment: (inv: Invoice) => void;
  getStatusBadge: (status: string) => JSX.Element;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Invoices</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <div className="flex gap-1">
              {['all', 'pending', 'paid', 'overdue'].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description="Create your first invoice to get started"
            action={{ label: 'Create Invoice', onClick: onCreateInvoice }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{invoice.customer_name || 'N/A'}</TableCell>
                  <TableCell>{new Date(invoice.created_at || '').toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-semibold">${invoice.total_amount.toFixed(2)}</TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {invoice.status !== 'paid' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600"
                          onClick={() => onRecordPayment(invoice)}
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Payments Content
function PaymentsContent({ invoices }: { invoices: Invoice[] }) {
  const paidInvoices = invoices.filter(inv => inv.status === 'paid');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        {paidInvoices.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments yet"
            description="Payments will appear here once invoices are paid"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paidInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.customer_name}</TableCell>
                  <TableCell>{inv.updated_at ? new Date(inv.updated_at).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">
                    ${inv.total_amount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Customers Content
function CustomersContent() {
  return (
    <EmptyState
      icon={Users}
      title="Customer Management"
      description="Customer accounts and billing information coming soon"
    />
  );
}

// Reports Content
function ReportsContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Available Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            'Revenue Summary',
            'Outstanding Invoices',
            'Payment History',
            'Customer Statements',
            'Aging Report',
            'Tax Summary'
          ].map((report) => (
            <div key={report} className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-medium">{report}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Settings Content
function SettingsContent() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Configure invoice numbering, templates, and defaults.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Configure payment methods and terms.</p>
        </CardContent>
      </Card>
    </div>
  );
}
