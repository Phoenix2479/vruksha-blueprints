import type { QRCodeMetadata } from '../../types';

interface CustomURLFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function CustomURLForm({ metadata, onChange, label, onLabelChange }: CustomURLFormProps) {
  const validateUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isValidUrl = !metadata.custom_url || validateUrl(metadata.custom_url);

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
          placeholder="e.g., Website Link, Menu, Feedback Form"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          value={metadata.custom_url || ''}
          onChange={(e) => onChange({ custom_url: e.target.value })}
          placeholder="https://example.com/page"
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
            !isValidUrl ? 'border-red-300 bg-red-50' : 'border-gray-200'
          }`}
        />
        {!isValidUrl && (
          <p className="text-xs text-red-500 mt-1">Please enter a valid URL (starting with http:// or https://)</p>
        )}
      </div>

      <div className="bg-green-50 p-3 rounded-lg">
        <p className="text-sm text-green-700">
          <strong>Dynamic Redirect:</strong> The QR code points to our redirect server, 
          so you can change the target URL later without reprinting the QR code.
        </p>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Common Use Cases</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onLabelChange('Restaurant Menu')}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Menu
          </button>
          <button
            type="button"
            onClick={() => onLabelChange('Feedback Form')}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Feedback
          </button>
          <button
            type="button"
            onClick={() => onLabelChange('Social Media')}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Social
          </button>
          <button
            type="button"
            onClick={() => onLabelChange('Event Registration')}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            Event
          </button>
          <button
            type="button"
            onClick={() => onLabelChange('App Download')}
            className="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200"
          >
            App Download
          </button>
        </div>
      </div>
    </div>
  );
}
