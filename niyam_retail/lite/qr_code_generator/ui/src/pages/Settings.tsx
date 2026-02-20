import { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle } from 'lucide-react';
import { useQRStore } from '../stores/qrStore';
import BrandingOptions from '../components/BrandingOptions';
import type { QRBranding } from '../types';

export default function Settings() {
  const { settings, fetchSettings, updateSettings, isLoading, error } = useQRStore();
  
  const [businessName, setBusinessName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultBranding, setDefaultBranding] = useState<Partial<QRBranding>>({
    foreground_color: '#000000',
    background_color: '#FFFFFF',
    error_correction: 'M',
    size: 300,
    logo_path: null,
    logo_size_percent: 20,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.business_name || '');
      setBaseUrl(settings.base_url || '');
      if (settings.default_branding) {
        setDefaultBranding(settings.default_branding);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    const success = await updateSettings({
      business_name: businessName,
      base_url: baseUrl,
      default_branding: defaultBranding as QRBranding,
    });
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleReset = () => {
    if (settings) {
      setBusinessName(settings.business_name || '');
      setBaseUrl(settings.base_url || '');
      if (settings.default_branding) {
        setDefaultBranding(settings.default_branding);
      }
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Configure your QR generator preferences</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          Settings saved successfully!
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Business Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Business Settings</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="My Business"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used in payment QR codes as the payee name
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base URL
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:8852"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Base URL for dynamic QR redirect URLs. Change this if you're using a custom domain.
              </p>
            </div>
          </div>
        </div>

        {/* Default Branding */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Default Branding</h2>
          <p className="text-sm text-gray-500 mb-4">
            These settings will be applied to new QR codes by default. You can override them for each QR code.
          </p>
          <BrandingOptions
            branding={defaultBranding}
            onChange={(updates) => setDefaultBranding({ ...defaultBranding, ...updates })}
          />
        </div>

        {/* About */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">About QR Generator</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Mode:</strong> Niyam Lite (Offline-first)</p>
            <p><strong>Database:</strong> SQLite (stored locally)</p>
            <p className="pt-2 border-t border-gray-100">
              <strong>Features:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>7 QR code types (Product, Maker, Custom, Payment, vCard, WiFi, Text)</li>
              <li>Dynamic redirect for updatable URLs</li>
              <li>Bulk generation from product catalog</li>
              <li>PDF and ZIP export</li>
              <li>Scan analytics and tracking</li>
              <li>Custom branding with colors and logos</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
