import { useState } from 'react';
import { Users, FileText, CreditCard, BarChart3, Plus, RefreshCw } from 'lucide-react';
import { useCustomers, useInvoices, useReceipts, useAgingReport } from '@/hooks/useAR';

type TabType = 'customers' | 'invoices' | 'receipts' | 'aging';

export function AccountsReceivablePage() {
  const [activeTab, setActiveTab] = useState<TabType>('invoices');
  const [customerFilter, setCustomerFilter] = useState('');

  const { data: customersData, isLoading: customersLoading } = useCustomers();
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({ customer_id: customerFilter || undefined });
  const { data: receiptsData, isLoading: receiptsLoading } = useReceipts({});
  const { data: agingData, isLoading: agingLoading } = useAgingReport();

  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt);
  const statusColors: Record<string, string> = { DRAFT: 'bg-slate-500/20 text-slate-400', SENT: 'bg-blue-500/20 text-blue-400', PARTIAL: 'bg-yellow-500/20 text-yellow-400', PAID: 'bg-green-500/20 text-green-400', OVERDUE: 'bg-red-500/20 text-red-400', CANCELLED: 'bg-red-500/20 text-red-400' };

  const tabs = [
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'receipts', label: 'Receipts', icon: CreditCard },
    { id: 'aging', label: 'AR Aging', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold text-white">Accounts Receivable</h1><p className="text-slate-400 mt-1">Manage customers, invoices, and receipts</p></div>
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Customer</button>
            <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Invoice</button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card"><p className="text-sm text-slate-400 mb-1">Total Customers</p><p className="text-2xl font-semibold text-white">{customersData?.data?.length || 0}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Open Invoices</p><p className="text-2xl font-semibold text-blue-400">{invoicesData?.data?.filter(i => !['PAID', 'CANCELLED'].includes(i.status)).length || 0}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Total Receivables</p><p className="text-2xl font-semibold text-green-400">{formatCurrency(invoicesData?.data?.reduce((sum, i) => sum + i.balance_due, 0) || 0)}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Overdue</p><p className="text-2xl font-semibold text-red-400">{invoicesData?.data?.filter(i => i.status === 'OVERDUE').length || 0}</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Invoices</h2>
              <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="input-field w-48">
                <option value="">All Customers</option>
                {customersData?.data?.map((c) => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
              </select>
            </div>
            {invoicesLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Invoice #</th><th className="text-left py-3 px-4 text-slate-400">Customer</th><th className="text-left py-3 px-4 text-slate-400">Date</th><th className="text-left py-3 px-4 text-slate-400">Due Date</th><th className="text-right py-3 px-4 text-slate-400">Amount</th><th className="text-right py-3 px-4 text-slate-400">Balance</th><th className="text-center py-3 px-4 text-slate-400">Status</th></tr></thead>
                <tbody>
                  {invoicesData?.data?.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{inv.invoice_number}</td>
                      <td className="py-3 px-4 text-white">{inv.customer_name}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(inv.due_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-white">{formatCurrency(inv.total_amount)}</td>
                      <td className="py-3 px-4 text-right text-green-400">{formatCurrency(inv.balance_due)}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${statusColors[inv.status]}`}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Customers</h2>
            {customersLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Code</th><th className="text-left py-3 px-4 text-slate-400">Name</th><th className="text-left py-3 px-4 text-slate-400">GSTIN</th><th className="text-left py-3 px-4 text-slate-400">Contact</th><th className="text-right py-3 px-4 text-slate-400">Balance</th><th className="text-center py-3 px-4 text-slate-400">Status</th></tr></thead>
                <tbody>
                  {customersData?.data?.map((cust) => (
                    <tr key={cust.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{cust.customer_code}</td>
                      <td className="py-3 px-4 text-white">{cust.customer_name}</td>
                      <td className="py-3 px-4 text-slate-400">{cust.gstin || '-'}</td>
                      <td className="py-3 px-4 text-slate-300">{cust.contact_person || cust.email || '-'}</td>
                      <td className="py-3 px-4 text-right text-green-400">{formatCurrency(cust.current_balance)}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${cust.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cust.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Receipts Tab */}
        {activeTab === 'receipts' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Receipts</h2>
            {receiptsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Receipt #</th><th className="text-left py-3 px-4 text-slate-400">Customer</th><th className="text-left py-3 px-4 text-slate-400">Date</th><th className="text-left py-3 px-4 text-slate-400">Method</th><th className="text-left py-3 px-4 text-slate-400">Reference</th><th className="text-right py-3 px-4 text-slate-400">Amount</th></tr></thead>
                <tbody>
                  {receiptsData?.data?.map((rec) => (
                    <tr key={rec.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{rec.receipt_number}</td>
                      <td className="py-3 px-4 text-white">{rec.customer_name}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(rec.receipt_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-slate-400">{rec.payment_method}</td>
                      <td className="py-3 px-4 text-slate-400">{rec.reference_number || '-'}</td>
                      <td className="py-3 px-4 text-right text-green-400">{formatCurrency(rec.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Aging Tab */}
        {activeTab === 'aging' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">AR Aging Report</h2>
            {agingLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Customer</th><th className="text-right py-3 px-4 text-slate-400">Current</th><th className="text-right py-3 px-4 text-slate-400">1-30 Days</th><th className="text-right py-3 px-4 text-slate-400">31-60 Days</th><th className="text-right py-3 px-4 text-slate-400">61-90 Days</th><th className="text-right py-3 px-4 text-slate-400">Over 90</th><th className="text-right py-3 px-4 text-slate-400">Total</th></tr></thead>
                <tbody>
                  {agingData?.data?.map((row) => (
                    <tr key={row.customer_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-white">{row.customer_name}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(row.current)}</td>
                      <td className="py-3 px-4 text-right text-yellow-400">{formatCurrency(row.days_1_30)}</td>
                      <td className="py-3 px-4 text-right text-orange-400">{formatCurrency(row.days_31_60)}</td>
                      <td className="py-3 px-4 text-right text-red-400">{formatCurrency(row.days_61_90)}</td>
                      <td className="py-3 px-4 text-right text-red-500">{formatCurrency(row.over_90)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-white">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
