import type { QRCodeMetadata } from '../../types';

interface TextQRFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function TextQRForm({ metadata, onChange, label, onLabelChange }: TextQRFormProps) {
  const textLength = metadata.plain_text?.length || 0;
  const maxLength = 500;

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
          placeholder="e.g., Welcome Message"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Text Content <span className="text-red-500">*</span>
        </label>
        <textarea
          value={metadata.plain_text || ''}
          onChange={(e) => onChange({ plain_text: e.target.value.slice(0, maxLength) })}
          placeholder="Enter your text message here..."
          rows={5}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{textLength} / {maxLength} characters</span>
          {textLength > 300 && (
            <span className="text-amber-600">Longer text = larger QR code</span>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Templates</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              onLabelChange('Welcome Message');
              onChange({ plain_text: 'Welcome to our store! Thank you for visiting us today.' });
            }}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Welcome
          </button>
          <button
            type="button"
            onClick={() => {
              onLabelChange('Instructions');
              onChange({ plain_text: 'Scan this QR code to get started. For assistance, please ask our staff.' });
            }}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Instructions
          </button>
          <button
            type="button"
            onClick={() => {
              onLabelChange('Coupon Code');
              onChange({ plain_text: 'Use code SAVE10 at checkout for 10% off your purchase!' });
            }}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Coupon
          </button>
          <button
            type="button"
            onClick={() => {
              onLabelChange('Thank You Note');
              onChange({ plain_text: 'Thank you for your purchase! We appreciate your business.' });
            }}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Thank You
          </button>
        </div>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Text QRs display the content directly when scanned. 
          Best for short messages, codes, or simple information.
        </p>
      </div>
    </div>
  );
}
