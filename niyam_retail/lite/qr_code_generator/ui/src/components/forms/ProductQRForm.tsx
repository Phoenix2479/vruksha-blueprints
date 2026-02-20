import { useEffect } from 'react';
import type { QRCodeMetadata, Product } from '../../types';
import { useQRStore } from '../../stores/qrStore';

interface ProductQRFormProps {
  metadata: QRCodeMetadata;
  onChange: (updates: Partial<QRCodeMetadata>) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export default function ProductQRForm({ metadata, onChange, label, onLabelChange }: ProductQRFormProps) {
  const { products, fetchProducts } = useQRStore();

  useEffect(() => {
    if (products.length === 0) {
      fetchProducts();
    }
  }, [products.length, fetchProducts]);

  const handleProductSelect = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      onChange({
        product_id: product.id,
        product_name: product.name,
        product_url: `/product/${product.id}`,
      });
      if (!label) {
        onLabelChange(product.name);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select Product
        </label>
        {products.length > 0 ? (
          <select
            value={metadata.product_id || ''}
            onChange={(e) => handleProductSelect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select a product...</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} {product.sku ? `(${product.sku})` : ''} - ₹{product.price}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
            No products found. Add products in Product Catalog first, or enter details manually below.
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          QR Label <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="e.g., Organic Honey 500g"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Product Page URL (optional)
        </label>
        <input
          type="url"
          value={metadata.product_url || ''}
          onChange={(e) => onChange({ product_url: e.target.value })}
          placeholder="https://yourstore.com/product/123"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Leave empty to use default product page URL
        </p>
      </div>
    </div>
  );
}
