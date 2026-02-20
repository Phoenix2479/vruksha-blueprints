import type { QRCodeMetadata } from '../../types';

interface VCardFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function VCardForm({ metadata, onChange, label, onLabelChange }: VCardFormProps) {
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
          placeholder="e.g., My Business Card"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={metadata.vcard_name || ''}
          onChange={(e) => onChange({ vcard_name: e.target.value })}
          placeholder="John Doe"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={metadata.vcard_phone || ''}
            onChange={(e) => onChange({ vcard_phone: e.target.value })}
            placeholder="+91 98765 43210"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={metadata.vcard_email || ''}
            onChange={(e) => onChange({ vcard_email: e.target.value })}
            placeholder="john@example.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
          <input
            type="text"
            value={metadata.vcard_company || ''}
            onChange={(e) => onChange({ vcard_company: e.target.value })}
            placeholder="Acme Inc."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={metadata.vcard_title || ''}
            onChange={(e) => onChange({ vcard_title: e.target.value })}
            placeholder="Product Manager"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
        <input
          type="url"
          value={metadata.vcard_url || ''}
          onChange={(e) => onChange({ vcard_url: e.target.value })}
          placeholder="https://example.com"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> vCard QRs are directly encoded. 
          When scanned, the contact is added to the phone's address book.
        </p>
      </div>
    </div>
  );
}
