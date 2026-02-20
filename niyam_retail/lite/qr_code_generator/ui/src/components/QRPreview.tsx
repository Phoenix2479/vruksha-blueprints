import QRCodeSVG from 'react-qr-code';
import { Copy, ExternalLink, Download } from 'lucide-react';
import type { QRType, QRCodeMetadata, QRBranding } from '../types';

interface QRPreviewProps {
  type: QRType | null;
  metadata: QRCodeMetadata;
  branding: Partial<QRBranding>;
  qrId?: string;
  showActions?: boolean;
}

export default function QRPreview({ type, metadata, branding, qrId, showActions = true }: QRPreviewProps) {
  // Generate the QR data based on type
  const getQRData = (): string => {
    if (!type) return 'https://example.com';

    switch (type) {
      case 'product':
      case 'maker':
      case 'custom':
        // For dynamic QRs, show the redirect URL if we have an ID
        if (qrId) {
          return `${window.location.origin}/qr/r/${qrId}`;
        }
        return metadata.custom_url || metadata.product_url || 'https://example.com';

      case 'payment':
        if (!metadata.upi_id) return 'upi://pay?pa=example@upi';
        let url = `upi://pay?pa=${encodeURIComponent(metadata.upi_id)}`;
        if (metadata.amount) url += `&am=${metadata.amount}`;
        if (metadata.currency) url += `&cu=${metadata.currency}`;
        if (metadata.note) url += `&tn=${encodeURIComponent(metadata.note)}`;
        return url;

      case 'vcard':
        let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
        if (metadata.vcard_name) vcard += `FN:${metadata.vcard_name}\n`;
        if (metadata.vcard_phone) vcard += `TEL:${metadata.vcard_phone}\n`;
        if (metadata.vcard_email) vcard += `EMAIL:${metadata.vcard_email}\n`;
        if (metadata.vcard_company) vcard += `ORG:${metadata.vcard_company}\n`;
        if (metadata.vcard_title) vcard += `TITLE:${metadata.vcard_title}\n`;
        vcard += 'END:VCARD';
        return vcard;

      case 'wifi':
        if (!metadata.wifi_ssid) return 'WIFI:S:Example;T:WPA;P:password;;';
        let wifi = `WIFI:T:${metadata.wifi_encryption || 'WPA'};S:${metadata.wifi_ssid};`;
        if (metadata.wifi_password) wifi += `P:${metadata.wifi_password};`;
        if (metadata.wifi_hidden) wifi += 'H:true;';
        wifi += ';';
        return wifi;

      case 'text':
        return metadata.plain_text || 'Sample text';

      default:
        return 'https://example.com';
    }
  };

  const qrData = getQRData();
  const redirectUrl = qrId ? `${window.location.origin}/qr/r/${qrId}` : null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadQR = () => {
    if (qrId) {
      window.open(`/api/qr/${qrId}/image?format=png&size=600`, '_blank');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Preview</h3>

      <div className="flex justify-center mb-4">
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: branding.background_color || '#FFFFFF' }}
        >
          <QRCodeSVG
            value={qrData}
            size={branding.size || 200}
            fgColor={branding.foreground_color || '#000000'}
            bgColor={branding.background_color || '#FFFFFF'}
            level={branding.error_correction || 'M'}
          />
        </div>
      </div>

      {showActions && (
        <div className="space-y-2">
          {redirectUrl && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={redirectUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg"
              />
              <button
                onClick={() => copyToClipboard(redirectUrl)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Copy URL"
              >
                <Copy className="h-4 w-4" />
              </button>
              <a
                href={redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Test redirect"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

          {qrId && (
            <button
              onClick={downloadQR}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download PNG
            </button>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          {type === 'payment' || type === 'vcard' || type === 'wifi' || type === 'text'
            ? 'Direct encoding (no redirect)'
            : 'Dynamic redirect enabled'}
        </p>
      </div>
    </div>
  );
}
