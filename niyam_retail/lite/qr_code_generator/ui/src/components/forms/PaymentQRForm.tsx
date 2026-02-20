import type { QRCodeMetadata } from '../../types';

interface PaymentQRFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function PaymentQRForm({ metadata, onChange, label, onLabelChange }: PaymentQRFormProps) {
  const validateUPI = (upiId: string) => {
    return upiId.includes('@');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          QR Label <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="e.g., Store Payment QR"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          UPI ID <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={metadata.upi_id || ''}
          onChange={(e) => onChange({ upi_id: e.target.value })}
          placeholder="yourname@upi or 9876543210@paytm"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        {metadata.upi_id && !validateUPI(metadata.upi_id) && (
          <p className="text-xs text-red-500 mt-1">UPI ID should contain @ symbol</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (optional)</label>
          <input
            type="number"
            value={metadata.amount || ''}
            onChange={(e) => onChange({ amount: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="100.00"
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <select
            value={metadata.currency || 'INR'}
            onChange={(e) => onChange({ currency: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
        <input
          type="text"
          value={metadata.note || ''}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Payment for order #123"
          maxLength={50}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-500 mt-1">Max 50 characters</p>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Payment QRs are directly encoded (not dynamic). 
          Customers can scan and pay directly via any UPI app.
        </p>
      </div>
    </div>
  );
}
