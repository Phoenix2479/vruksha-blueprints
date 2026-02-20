import { useState } from 'react';
import { Users, FileText, CreditCard, BarChart3, Plus, RefreshCw } from 'lucide-react';
import { useVendors, useBills, usePayments, useAgingReport, useCreateVendor, useCreateBill, useCreatePayment } from '@/hooks/useAP';
import type { Vendor, Bill } from '@/types';

type TabType = 'vendors' | 'bills' | 'payments' | 'aging';

export function AccountsPayablePage() {
  const [activeTab, setActiveTab] = useState<TabType>('bills');
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [vendorFilter, setVendorFilter] = useState('');

  const { data: vendorsData, isLoading: vendorsLoading, refetch: refetchVendors } = useVendors();
  const { data: billsData, isLoading: billsLoading, refetch: refetchBills } = useBills({ vendor_id: vendorFilter || undefined });
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments({});
  const { data: agingData, isLoading: agingLoading } = useAgingReport();
  const createVendor = useCreateVendor();
  const createBill = useCreateBill();

  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt);
  const statusColors: Record<string, string> = { DRAFT: 'bg-slate-500/20 text-slate-400', PENDING: 'bg-yellow-500/20 text-yellow-400', PARTIAL: 'bg-blue-500/20 text-blue-400', PAID: 'bg-green-500/20 text-green-400', OVERDUE: 'bg-red-500/20 text-red-400' };

  const tabs = [
    { id: 'bills', label: 'Bills', icon: FileText },
    { id: 'vendors', label: 'Vendors', icon: Users },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'aging', label: 'AP Aging', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold text-white">Accounts Payable</h1><p className="text-slate-400 mt-1">Manage vendors, bills, and payments</p></div>
          <div className="flex gap-2">
            <button onClick={() => setShowVendorModal(true)} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Vendor</button>
            <button onClick={() => setShowBillModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Bill</button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card"><p className="text-sm text-slate-400 mb-1">Total Vendors</p><p className="text-2xl font-semibold text-white">{vendorsData?.data?.length || 0}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Open Bills</p><p className="text-2xl font-semibold text-yellow-400">{billsData?.data?.filter(b => b.status !== 'PAID').length || 0}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Total Outstanding</p><p className="text-2xl font-semibold text-red-400">{formatCurrency(billsData?.data?.reduce((sum, b) => sum + b.balance_due, 0) || 0)}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Overdue</p><p className="text-2xl font-semibold text-red-400">{billsData?.data?.filter(b => b.status === 'OVERDUE').length || 0}</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Bills Tab */}
        {activeTab === 'bills' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Bills</h2>
              <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="input-field w-48">
                <option value="">All Vendors</option>
                {vendorsData?.data?.map((v: any) => <option key={v.id} value={v.id}>{v.name || v.vendor_name}</option>)}
              </select>
            </div>
            {billsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Bill #</th><th className="text-left py-3 px-4 text-slate-400">Vendor</th><th className="text-left py-3 px-4 text-slate-400">Date</th><th className="text-left py-3 px-4 text-slate-400">Due Date</th><th className="text-right py-3 px-4 text-slate-400">Amount</th><th className="text-right py-3 px-4 text-slate-400">Balance</th><th className="text-center py-3 px-4 text-slate-400">Status</th></tr></thead>
                <tbody>
                  {billsData?.data?.map((bill) => (
                    <tr key={bill.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{bill.bill_number}</td>
                      <td className="py-3 px-4 text-white">{bill.vendor_name}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(bill.bill_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(bill.due_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-white">{formatCurrency(bill.total_amount)}</td>
                      <td className="py-3 px-4 text-right text-red-400">{formatCurrency(bill.balance_due)}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${statusColors[bill.status]}`}>{bill.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Vendors Tab */}
        {activeTab === 'vendors' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Vendors</h2>
            {vendorsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Code</th><th className="text-left py-3 px-4 text-slate-400">Name</th><th className="text-left py-3 px-4 text-slate-400">GSTIN</th><th className="text-left py-3 px-4 text-slate-400">Contact</th><th className="text-right py-3 px-4 text-slate-400">Balance</th><th className="text-center py-3 px-4 text-slate-400">Status</th></tr></thead>
                <tbody>
                  {vendorsData?.data?.map((vendor) => (
                    <tr key={vendor.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{vendor.vendor_code}</td>
                      <td className="py-3 px-4 text-white">{vendor.vendor_name}</td>
                      <td className="py-3 px-4 text-slate-400">{vendor.gstin || '-'}</td>
                      <td className="py-3 px-4 text-slate-300">{vendor.contact_person || vendor.email || '-'}</td>
                      <td className="py-3 px-4 text-right text-red-400">{formatCurrency(vendor.current_balance)}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${vendor.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{vendor.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Payments</h2>
            {paymentsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Payment #</th><th className="text-left py-3 px-4 text-slate-400">Vendor</th><th className="text-left py-3 px-4 text-slate-400">Date</th><th className="text-left py-3 px-4 text-slate-400">Method</th><th className="text-left py-3 px-4 text-slate-400">Reference</th><th className="text-right py-3 px-4 text-slate-400">Amount</th></tr></thead>
                <tbody>
                  {paymentsData?.data?.map((payment) => (
                    <tr key={payment.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{payment.payment_number}</td>
                      <td className="py-3 px-4 text-white">{payment.vendor_name}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(payment.payment_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-slate-400">{payment.payment_method}</td>
                      <td className="py-3 px-4 text-slate-400">{payment.reference_number || '-'}</td>
                      <td className="py-3 px-4 text-right text-green-400">{formatCurrency(payment.amount)}</td>
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
            <h2 className="text-lg font-semibold text-white mb-4">AP Aging Report</h2>
            {agingLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Vendor</th><th className="text-right py-3 px-4 text-slate-400">Current</th><th className="text-right py-3 px-4 text-slate-400">1-30 Days</th><th className="text-right py-3 px-4 text-slate-400">31-60 Days</th><th className="text-right py-3 px-4 text-slate-400">61-90 Days</th><th className="text-right py-3 px-4 text-slate-400">Over 90</th><th className="text-right py-3 px-4 text-slate-400">Total</th></tr></thead>
                <tbody>
                  {agingData?.data?.map((row) => (
                    <tr key={row.vendor_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-white">{row.vendor_name}</td>
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
