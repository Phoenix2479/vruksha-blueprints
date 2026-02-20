import React, { useState, useEffect } from 'react';
import { FileText, Plus, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import { Button, TenantSwitcher } from '@shared/components/index.ts';
import { InvoiceList } from '../components/InvoiceList';
import { InvoiceForm } from '../components/InvoiceForm';
import { PaymentForm } from '../components/PaymentForm';
import { getInvoices, createInvoice, recordPayment, getRevenueStats } from '../api/billing';
import { handleAPIError } from '@shared/utils/api.ts';
import type { Invoice } from '@shared/types/models.ts';
import { formatCurrency } from '@shared/utils/formatting.ts';
import { hasAnyRole } from '@shared/utils/auth.ts';

export const Billing: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_revenue: 0,
    pending_amount: 0,
    overdue_amount: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invoicesData, statsData] = await Promise.all([
        getInvoices(),
        getRevenueStats(),
      ]);
      setInvoices(invoicesData);
      setStats(statsData || { total_revenue: 0, pending_amount: 0, overdue_amount: 0 });
    } catch (error) {
      console.error('Error loading billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async (data: any) => {
    try {
      await createInvoice(data);
      setShowCreateForm(false);
      loadData();
    } catch (error) {
      alert(handleAPIError(error));
    }
  };

  const handleRecordPayment = async (data: any) => {
    try {
      await recordPayment(data);
      setShowPaymentForm(false);
      setSelectedInvoice(null);
      loadData();
    } catch (error) {
      alert('Failed to record payment');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary-500" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Billing & Invoices</h1>
                <p className="text-sm text-gray-600">Manage invoices and track payments</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TenantSwitcher />
              {hasAnyRole(['accountant','manager','admin']) && (
                <Button variant="primary" onClick={() => setShowCreateForm(!showCreateForm)}>
                  <Plus className="w-4 h-4" />
                  {showCreateForm ? 'View Invoices' : 'New Invoice'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {!showCreateForm && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(stats.total_revenue)}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Pending</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {formatCurrency(stats.pending_amount)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-yellow-500" />
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Overdue</p>
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(stats.overdue_amount)}
                    </p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
            </div>

            {/* Invoice List */}
            <InvoiceList
              invoices={invoices}
              loading={loading}
              onSelect={setSelectedInvoice}
              onPay={(invoice) => {
                setSelectedInvoice(invoice);
                setShowPaymentForm(true);
              }}
            />
          </>
        )}

        {/* Create Invoice Form */}
        {showCreateForm && (
          <InvoiceForm onSubmit={handleCreateInvoice} />
        )}
      </main>

      {/* Payment Modal */}
      {selectedInvoice && (
        <PaymentForm
          invoice={selectedInvoice}
          isOpen={showPaymentForm}
          onClose={() => {
            setShowPaymentForm(false);
            setSelectedInvoice(null);
          }}
          onSubmit={handleRecordPayment}
        />
      )}
    </div>
  );
};
