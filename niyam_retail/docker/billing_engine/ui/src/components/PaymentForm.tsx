import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { Modal, Button, Input, Select } from '@shared/components/index.ts';
import type { Invoice } from '@shared/types/models.ts';
import type { SelectOption } from '@shared/components/index.ts';
import { formatCurrency } from '@shared/utils/formatting.ts';

interface PaymentFormProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    invoice_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference?: string;
  }) => void;
  loading?: boolean;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  invoice,
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}) => {
  const [amount, setAmount] = useState((invoice.total_amount - invoice.amount_paid).toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');

  const paymentMethodOptions: SelectOption[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Credit/Debit Card' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'check', label: 'Check' },
    { value: 'crypto', label: 'Cryptocurrency' },
  ];

  const remainingBalance = invoice.total_amount - invoice.amount_paid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      invoice_id: invoice.id,
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      payment_date: paymentDate,
      reference: reference || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Invoice Info */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Invoice: {invoice.invoice_number}</p>
          <p className="text-sm text-gray-600">Customer: {invoice.customer_name}</p>
          <p className="text-lg font-bold text-gray-900 mt-2">
            Remaining: {formatCurrency(remainingBalance)}
          </p>
        </div>

        {/* Payment Amount */}
        <div>
          <label className="label">Payment Amount</label>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
            max={remainingBalance}
            required
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setAmount((remainingBalance / 2).toFixed(2))}
              className="text-sm text-primary-600 hover:underline"
            >
              Half
            </button>
            <button
              type="button"
              onClick={() => setAmount(remainingBalance.toFixed(2))}
              className="text-sm text-primary-600 hover:underline"
            >
              Full Amount
            </button>
          </div>
        </div>

        {/* Payment Method */}
        <div>
          <label className="label">Payment Method</label>
          <Select
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={paymentMethodOptions}
            required
          />
        </div>

        {/* Payment Date */}
        <div>
          <label className="label">Payment Date</label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentDate(e.target.value)}
            required
          />
        </div>

        {/* Reference */}
        <div>
          <label className="label">Reference Number (Optional)</label>
          <Input
            value={reference}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReference(e.target.value)}
            placeholder="Transaction ID, check number, etc."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading} className="flex-1">
            <DollarSign className="w-4 h-4" />
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
