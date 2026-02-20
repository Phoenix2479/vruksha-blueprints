import type { QRCodeMetadata } from '../../types';

interface MakerQRFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function MakerQRForm({ metadata, onChange, label, onLabelChange }: MakerQRFormProps) {
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
          placeholder="e.g., Meet the Artisan"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Maker/Artisan Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={metadata.maker_name || ''}
          onChange={(e) => onChange({ maker_name: e.target.value })}
          placeholder="Ramesh Kumar"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Story Page URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          value={metadata.custom_url || ''}
          onChange={(e) => onChange({ custom_url: e.target.value })}
          placeholder="https://yourstore.com/makers/ramesh-kumar"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Link to the page with the maker's story, photos, and product catalog
        </p>
      </div>

      <div className="bg-amber-50 p-3 rounded-lg">
        <h4 className="text-sm font-medium text-amber-800 mb-1">Why Maker QR Codes?</h4>
        <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
          <li>Connect customers directly to the artisan who made their product</li>
          <li>Share the maker's story, craftsmanship, and heritage</li>
          <li>Build trust through transparency and traceability</li>
          <li>Support fair trade and ethical sourcing narratives</li>
        </ul>
      </div>

      <div className="bg-green-50 p-3 rounded-lg">
        <p className="text-sm text-green-700">
          <strong>Dynamic Redirect:</strong> You can update the maker's story page URL 
          anytime without reprinting the QR code.
        </p>
      </div>
    </div>
  );
}
