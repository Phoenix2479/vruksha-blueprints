import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { CreditCard, DollarSign, Clock, CheckCircle, RefreshCw, Settings, Search, RotateCcw, Banknote, Wallet } from "lucide-react";
import { getMethods, getGateways, getPayments, getSettlements, getStats, initiateRefund, type PaymentMethod, type Gateway, type Payment, type Settlement, type PaymentStats } from "../api";

type TabType = "transactions" | "settlements" | "gateways";

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("transactions");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<PaymentStats>({ queryKey: ["payment-stats"], queryFn: getStats });
  const { data: methods = [] } = useQuery<PaymentMethod[]>({ queryKey: ["payment-methods"], queryFn: getMethods });
  const { data: gateways = [] } = useQuery<Gateway[]>({ queryKey: ["gateways"], queryFn: getGateways });
  const { data: payments = [] } = useQuery<Payment[]>({ queryKey: ["payments", statusFilter], queryFn: () => getPayments({ status: statusFilter || undefined, limit: 100 }) });
  const { data: settlements = [] } = useQuery<Settlement[]>({ queryKey: ["settlements"], queryFn: getSettlements });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "transactions", label: "Transactions", count: payments.filter(p => p.status === "pending").length },
    { id: "settlements", label: "Settlements" },
    { id: "gateways", label: "Payment Gateways" },
  ];

  const filteredPayments = payments.filter(p =>
    p.payment_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.guest_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const methodIcons: Record<string, typeof CreditCard> = { card: CreditCard, cash: Banknote, upi: Wallet, wallet: Wallet };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-gray-900">Payment Gateway</h1><p className="text-gray-500">Online payments & settlements</p></div>
          <Button variant="outline"><Settings className="h-4 w-4 mr-2" /> Configure</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Today" value={stats?.transactions_today || 0} icon={CreditCard} />
          <StatsCard title="Today Amount" value={`$${(stats?.amount_today || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Month" value={stats?.transactions_month || 0} icon={CheckCircle} />
          <StatsCard title="Month Amount" value={`$${(stats?.amount_month || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Pending" value={stats?.pending_payments || 0} icon={Clock} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && tab.count > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "transactions" && (
          <>
            <div className="flex gap-4">
              <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search by ref or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" /></div>
              <select className="border rounded-md px-3 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => {
                    const Icon = methodIcons[payment.method] || CreditCard;
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-sm">{payment.payment_ref}</TableCell>
                        <TableCell className="font-semibold">${payment.amount.toLocaleString()} {payment.currency}</TableCell>
                        <TableCell><span className="flex items-center gap-1 capitalize"><Icon className="h-4 w-4" />{payment.method}</span></TableCell>
                        <TableCell className="text-sm">{payment.guest_email || '-'}</TableCell>
                        <TableCell><StatusBadge status={payment.status} /></TableCell>
                        <TableCell className="text-sm text-gray-500">{new Date(payment.created_at).toLocaleString()}</TableCell>
                        <TableCell>{payment.status === 'completed' && <Button size="sm" variant="ghost" onClick={() => setRefundPayment(payment)}><RotateCcw className="h-4 w-4" /></Button>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </>
        )}

        {activeTab === "settlements" && (
          <Card>
            <CardHeader><CardTitle>Settlement Report (Last 30 Days)</CardTitle></CardHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Transactions</TableHead><TableHead>Gross</TableHead><TableHead>Refunds</TableHead><TableHead>Net</TableHead></TableRow></TableHeader>
              <TableBody>
                {settlements.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{new Date(s.date).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{s.method}</TableCell>
                    <TableCell>{s.transactions}</TableCell>
                    <TableCell>${s.gross_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-red-600">${s.refunds.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">${s.net_amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {activeTab === "gateways" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gateways.map((gw) => (
              <Card key={gw.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{gw.gateway_name}</CardTitle>
                    <div className="flex gap-2">
                      {gw.is_default && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span>}
                      <StatusBadge status={gw.is_active ? "active" : "inactive"} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-3 capitalize">{gw.gateway_type}</p>
                  <div className="flex flex-wrap gap-1">
                    {gw.supported_methods.map((m) => {
                      const Icon = methodIcons[m] || CreditCard;
                      return <span key={m} className="flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded capitalize"><Icon className="h-3 w-3" />{m}</span>;
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card className="border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50">
              <CardContent className="text-center py-8">
                <CreditCard className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-500">Add Payment Gateway</p>
              </CardContent>
            </Card>
          </div>
        )}

        <RefundDialog payment={refundPayment} onClose={() => setRefundPayment(null)} />
      </div>
    </div>
  );
}

function RefundDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const refund = useMutation({
    mutationFn: () => initiateRefund(payment!.id, amount ? parseFloat(amount) : undefined, reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payments"] }); onClose(); },
  });

  if (!payment) return null;

  return (
    <Dialog open={!!payment} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Process Refund</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Reference</span><span className="font-mono">{payment.payment_ref}</span></div>
            <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">Original Amount</span><span className="font-semibold">${payment.amount}</span></div>
          </div>
          <div><Label>Refund Amount (leave empty for full refund)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(payment.amount)} max={payment.amount} /></div>
          <div><Label>Reason</Label><textarea className="w-full border rounded-md px-3 py-2 min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for refund..." /></div>
          <DialogButtons onCancel={onClose} onConfirm={() => refund.mutate()} confirmText="Process Refund" loading={refund.isPending} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
