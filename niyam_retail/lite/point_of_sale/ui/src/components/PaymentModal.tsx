import React, { useState } from 'react';
import { CreditCard, DollarSign, Smartphone, Calendar } from 'lucide-react';
import { Modal, Button } from '@shared/components/index.ts';
import { formatCurrency } from '@shared/utils/formatting.ts';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onComplete: (paymentData: {
    payment_method: string;
    amount_paid: number;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  total,
  onComplete,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'crypto' | 'bnpl'>('cash');
  const [amountTendered, setAmountTendered] = useState(total.toFixed(2));
  const [processing, setProcessing] = useState(false);

  const change = parseFloat(amountTendered) - total;

  const paymentMethods = [
    { id: 'cash', name: 'Cash', icon: DollarSign, color: 'bg-green-500' },
    { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, color: 'bg-blue-500' },
    { id: 'crypto', name: 'Cryptocurrency', icon: Smartphone, color: 'bg-purple-500' },
    { id: 'bnpl', name: 'Buy Now Pay Later', icon: Calendar, color: 'bg-orange-500' },
  ];

  const handlePayment = async () => {
    setProcessing(true);
    try {
      await onComplete({
        payment_method: paymentMethod,
        amount_paid: parseFloat(amountTendered),
      });
      onClose();
    } catch (error) {
      alert('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Process Payment"
      size="lg"
    >
      <div className="space-y-6">
        {/* Total Due */}
        <div className="text-center py-6 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Total Due</p>
          <p className="text-4xl font-bold text-gray-900">{formatCurrency(total)}</p>
        </div>

        {/* Payment Method Selection */}
        <div>
          <p className="label">Payment Method</p>
          <div className="grid grid-cols-2 gap-3">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const isSelected = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id as any)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-primary-500' : 'text-gray-400'}`} />
                  <p className={`text-sm font-medium ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>
                    {method.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cash Payment - Amount Tendered */}
        {paymentMethod === 'cash' && (
          <div>
            <label className="label">Amount Tendered</label>
            <input
              type="number"
              step="0.01"
              value={amountTendered}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmountTendered(e.target.value)}
              className="input text-xl font-semibold"
              autoFocus
            />
            {change >= 0 && (
              <div className="mt-3 p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Change Due</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(change)}</p>
              </div>
            )}
            {change < 0 && (
              <p className="mt-2 text-sm text-red-600">
                Insufficient amount (short by {formatCurrency(Math.abs(change))})
              </p>
            )}

            {/* Quick Amount Buttons */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[20, 50, 100, 200].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setAmountTendered(amount.toFixed(2))}
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card Payment */}
        {paymentMethod === 'card' && (
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <CreditCard className="w-12 h-12 mx-auto mb-2 text-blue-500" />
            <p className="text-sm text-gray-700">Insert, swipe, or tap card</p>
            <p className="text-xs text-gray-500 mt-1">Waiting for card reader...</p>
          </div>
        )}

        {/* Crypto Payment */}
        {paymentMethod === 'crypto' && (
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <Smartphone className="w-12 h-12 mx-auto mb-2 text-purple-500" />
            <p className="text-sm text-gray-700">Scan QR code to pay</p>
            <p className="text-xs text-gray-500 mt-1">Amount: {formatCurrency(total)}</p>
          </div>
        )}

        {/* BNPL */}
        {paymentMethod === 'bnpl' && (
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <Calendar className="w-12 h-12 mx-auto mb-2 text-orange-500" />
            <p className="text-sm text-gray-700">Buy Now Pay Later</p>
            <p className="text-xs text-gray-500 mt-1">Customer will be sent payment link</p>
          </div>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handlePayment}
          loading={processing}
          disabled={paymentMethod === 'cash' && change < 0}
          className="flex-1"
        >
          Complete Payment
        </Button>
      </div>
    </Modal>
  );
};
