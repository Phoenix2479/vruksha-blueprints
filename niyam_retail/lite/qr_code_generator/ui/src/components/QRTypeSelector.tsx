import { Package, User, Link, CreditCard, Contact, Wifi, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import type { QRType } from '../types';
import { QR_TYPE_INFO } from '../types';

const iconMap = {
  Package,
  User,
  Link,
  CreditCard,
  Contact,
  Wifi,
  FileText,
};

interface QRTypeSelectorProps {
  selected: QRType | null;
  onSelect: (type: QRType) => void;
}

export default function QRTypeSelector({ selected, onSelect }: QRTypeSelectorProps) {
  const types: QRType[] = ['product', 'maker', 'custom', 'payment', 'vcard', 'wifi', 'text'];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {types.map((type) => {
        const info = QR_TYPE_INFO[type];
        const Icon = iconMap[info.icon as keyof typeof iconMap] || Package;
        const isSelected = selected === type;

        return (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={clsx(
              'p-4 rounded-xl border-2 text-left transition-all',
              isSelected
                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            )}
          >
            <div
              className={clsx(
                'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                isSelected ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <h3 className={clsx('font-semibold', isSelected ? 'text-primary-700' : 'text-gray-900')}>
              {info.label}
            </h3>
            <p className="text-xs text-gray-500 mt-1">{info.description}</p>
          </button>
        );
      })}
    </div>
  );
}
