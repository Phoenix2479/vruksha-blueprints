import React from 'react';
import { FileText, DollarSign, Calendar, AlertCircle } from 'lucide-react';
import type { Invoice } from '@shared/types/models.ts';
import { formatCurrency, formatDate } from '@shared/utils/formatting.ts';
import { Button } from '@shared/components/index.ts';

interface InvoiceListProps {
  invoices: Invoice[];
  loading?: boolean;
  onSelect: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  loading = false,
  onSelect,
  onPay,
}) => {
  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="card text-center py-12">
        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
        <p className="text-gray-600">No invoices found</p>
        <p className="text-sm text-gray-500 mt-1">Create your first invoice to get started</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      {invoices.map((invoice) => (
        <div
          key={invoice.id}
          className="card hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => onSelect(invoice)}
        >
          <div className="flex items-start justify-between">
            {/* Left: Invoice Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-gray-900">{invoice.invoice_number}</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                  {invoice.status.toUpperCase()}
                </span>
              </div>
              
              <p className="text-sm text-gray-600 mb-1">
                Customer: {invoice.customer_name || 'N/A'}
              </p>
              
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Due: {formatDate(invoice.due_date)}
                </span>
                {invoice.status === 'overdue' && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    Overdue
                  </span>
                )}
              </div>
            </div>

            {/* Right: Amount & Action */}
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900 mb-2">
                {formatCurrency(invoice.total_amount)}
              </p>
              
              {invoice.amount_paid > 0 && invoice.amount_paid < invoice.total_amount && (
                <p className="text-sm text-gray-600 mb-2">
                  Paid: {formatCurrency(invoice.amount_paid)}
                </p>
              )}

              {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    onPay(invoice);
                  }}
                >
                  <DollarSign className="w-4 h-4" />
                  Record Payment
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
