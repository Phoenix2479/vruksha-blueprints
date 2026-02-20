import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
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
  Separator,
} from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { spacing } from "@shared/styles/spacing";
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
} from "lucide-react";
import { getInvoices, createInvoice, recordPayment, getRevenueStats } from "../api/billing";
import type { Invoice } from "@shared/types/models";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Invoice form state
  const [customerName, setCustomerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceItems, setInvoiceItems] = useState([
    { description: "", quantity: 1, unit_price: 0, tax_rate: 0 },
  ]);
  const [notes, setNotes] = useState("");

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");

  // Fetch invoices
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () => getInvoices(statusFilter !== "all" ? { status: statusFilter } : undefined),
  });

  // Fetch stats
  const { data: stats = { total_revenue: 0, pending_amount: 0, overdue_amount: 0 } } = useQuery({
    queryKey: ["billing-stats"],
    queryFn: () => getRevenueStats(),
  });

  // Create invoice mutation
  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setShowCreateModal(false);
      resetInvoiceForm();
    },
  });

  // Record payment mutation
  const paymentMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      resetPaymentForm();
    },
  });

  const resetInvoiceForm = () => {
    setCustomerName("");
    setDueDate("");
    setInvoiceItems([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
    setNotes("");
  };

  const resetPaymentForm = () => {
    setPaymentAmount(0);
    setPaymentMethod("cash");
    setPaymentRef("");
  };

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
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
  const filteredInvoices = invoices.filter((inv) =>
    inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, "active" | "warning" | "error" | "inactive"> = {
      paid: "active",
      pending: "warning",
      overdue: "error",
      draft: "inactive",
    };
    return <StatusBadge status={statusMap[status] || "inactive"} label={status} />;
  };

  const invoiceTotal = invoiceItems.reduce((sum, item) => {
    const subtotal = item.quantity * item.unit_price;
    const tax = subtotal * (item.tax_rate / 100);
    return sum + subtotal + tax;
  }, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Billing & Invoices</h1>
              <p className="text-sm text-muted-foreground">Manage invoices and track payments</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
        {/* Stats Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-3 ${spacing.cardGap}`}>
          <StatsCard
            title="Total Revenue"
            value={`$${stats.total_revenue.toLocaleString()}`}
            icon={<TrendingUp className="h-5 w-5" />}
            iconColor="text-green-600"
            iconBg="bg-green-100"
          />
          <StatsCard
            title="Pending"
            value={`$${stats.pending_amount.toLocaleString()}`}
            icon={<DollarSign className="h-5 w-5" />}
            iconColor="text-yellow-600"
            iconBg="bg-yellow-100"
          />
          <StatsCard
            title="Overdue"
            value={`$${stats.overdue_amount.toLocaleString()}`}
            icon={<AlertCircle className="h-5 w-5" />}
            iconColor="text-red-600"
            iconBg="bg-red-100"
          />
        </div>

        {/* Invoices Table */}
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
                  {["all", "pending", "paid", "overdue"].map((status) => (
                    <Button
                      key={status}
                      variant={statusFilter === status ? "default" : "outline"}
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
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No invoices found</p>
              </div>
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
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.customer_name || "N/A"}</TableCell>
                      <TableCell>{new Date(invoice.created_at || "").toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ${invoice.total_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {invoice.status !== "paid" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600"
                              onClick={() => openPaymentModal(invoice)}
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
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {invoiceItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateInvoiceItem(index, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateInvoiceItem(index, "quantity", parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateInvoiceItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Tax %"
                      value={item.tax_rate}
                      onChange={(e) => updateInvoiceItem(index, "tax_rate", parseFloat(e.target.value) || 0)}
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
                {["cash", "card", "bank"].map((method) => (
                  <Button
                    key={method}
                    variant={paymentMethod === method ? "default" : "outline"}
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
