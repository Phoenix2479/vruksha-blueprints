export type QRType = 'product' | 'maker' | 'custom' | 'payment' | 'vcard' | 'wifi' | 'text';

export interface QRBranding {
  foreground_color: string;
  background_color: string;
  error_correction: 'L' | 'M' | 'Q' | 'H';
  size: number;
  logo_path: string | null;
  logo_size_percent: number;
}

export interface QRCodeMetadata {
  product_id?: string;
  product_name?: string;
  product_url?: string;
  maker_name?: string;
  custom_url?: string;
  upi_id?: string;
  amount?: number;
  currency?: string;
  note?: string;
  vcard_name?: string;
  vcard_phone?: string;
  vcard_email?: string;
  vcard_company?: string;
  vcard_title?: string;
  vcard_url?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  wifi_encryption?: 'WPA' | 'WEP' | 'nopass';
  wifi_hidden?: boolean;
  plain_text?: string;
}

export interface QRCode {
  id: string;
  type: QRType;
  label: string;
  target_url: string;
  metadata: QRCodeMetadata;
  branding: QRBranding;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  business_name: string;
  base_url: string;
  default_branding: QRBranding;
  updated_at?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  barcode?: string;
  category?: string;
}

export interface AnalyticsData {
  total_qrs: number;
  total_scans: number;
  scans_this_week: number;
  top_qrs: { id: string; label: string; type: string; scan_count: number }[];
  by_type: { type: string; count: number }[];
}

export const QR_TYPE_INFO: Record<QRType, { label: string; description: string; icon: string }> = {
  product: {
    label: 'Product',
    description: 'Link to product page with dynamic redirect',
    icon: 'Package',
  },
  maker: {
    label: 'Maker Story',
    description: 'Link to the maker/artisan story page',
    icon: 'User',
  },
  custom: {
    label: 'Custom URL',
    description: 'Link to any URL with dynamic redirect',
    icon: 'Link',
  },
  payment: {
    label: 'Payment (UPI)',
    description: 'UPI payment QR for quick payments',
    icon: 'CreditCard',
  },
  vcard: {
    label: 'Contact Card',
    description: 'vCard with contact information',
    icon: 'Contact',
  },
  wifi: {
    label: 'WiFi',
    description: 'WiFi network credentials',
    icon: 'Wifi',
  },
  text: {
    label: 'Plain Text',
    description: 'Simple text content',
    icon: 'FileText',
  },
};

export const DEFAULT_BRANDING: QRBranding = {
  foreground_color: '#000000',
  background_color: '#FFFFFF',
  error_correction: 'M',
  size: 300,
  logo_path: null,
  logo_size_percent: 20,
};
