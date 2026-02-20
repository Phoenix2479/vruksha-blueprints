import type { QRCodeMetadata } from '../../types';

interface WiFiFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function WiFiForm({ metadata, onChange, label, onLabelChange }: WiFiFormProps) {
  const showPasswordWarning = 
    metadata.wifi_encryption === 'WPA' && 
    metadata.wifi_password && 
    metadata.wifi_password.length < 8;

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
          placeholder="e.g., Guest WiFi"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Network Name (SSID) <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={metadata.wifi_ssid || ''}
          onChange={(e) => onChange({ wifi_ssid: e.target.value })}
          placeholder="MyNetwork"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Security Type</label>
        <select
          value={metadata.wifi_encryption || 'WPA'}
          onChange={(e) => onChange({ wifi_encryption: e.target.value as 'WPA' | 'WEP' | 'nopass' })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="WPA">WPA/WPA2 (Recommended)</option>
          <option value="WEP">WEP (Legacy)</option>
          <option value="nopass">No Password (Open)</option>
        </select>
      </div>

      {metadata.wifi_encryption !== 'nopass' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password {metadata.wifi_encryption === 'WPA' && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={metadata.wifi_password || ''}
            onChange={(e) => onChange({ wifi_password: e.target.value })}
            placeholder="Enter WiFi password"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {showPasswordWarning && (
            <p className="text-xs text-amber-600 mt-1">
              WPA passwords should be at least 8 characters
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="hidden-network"
          checked={metadata.wifi_hidden || false}
          onChange={(e) => onChange({ wifi_hidden: e.target.checked })}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="hidden-network" className="text-sm text-gray-700">
          Hidden network (SSID not broadcast)
        </label>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> WiFi QRs are directly encoded. 
          Customers can scan to auto-connect on most smartphones.
        </p>
      </div>
    </div>
  );
}
