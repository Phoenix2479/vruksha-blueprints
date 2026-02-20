import React from 'react';
import { Package, Edit, Trash2, AlertCircle } from 'lucide-react';
import type { Product } from '../../../../shared/types/models.ts';
import { formatCurrency } from '../../../../shared/utils/formatting.ts';
import { Button } from '../../../../shared/components/index.ts';

interface ProductListProps {
  products: Product[];
  loading?: boolean;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
}

export const ProductList: React.FC<ProductListProps> = ({
  products,
  loading = false,
  onEdit,
  onDelete,
  onAdjustStock,
}) => {
  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card text-center py-12">
        <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
        <p className="text-gray-600">No products found</p>
        <p className="text-sm text-gray-500 mt-1">Add your first product to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((product) => {
        const isLowStock = product.quantity_on_hand <= (product.reorder_point || 0);
        
        return (
          <div key={product.id} className="card hover:shadow-lg transition-shadow">
            {/* Product Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{product.name}</h3>
                <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                {product.category && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                    {product.category}
                  </span>
                )}
              </div>
              <Package className="w-5 h-5 text-gray-400" />
            </div>

            {/* Stock Level */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Stock Level</span>
                {isLowStock && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="w-3 h-3" />
                    Low Stock
                  </span>
                )}
              </div>
              <div className={`text-2xl font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                {product.quantity_on_hand || 0}
              </div>
              {product.reorder_point && (
                <p className="text-xs text-gray-500">Reorder at: {product.reorder_point}</p>
              )}
            </div>

            {/* Pricing */}
            <div className="mb-4 pb-4 border-b">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sell Price:</span>
                <span className="font-semibold">{formatCurrency(product.unit_price)}</span>
              </div>
              {product.cost_price && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Cost:</span>
                  <span className="font-medium">{formatCurrency(product.cost_price)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAdjustStock(product)}
              >
                Adjust
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(product)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm('Delete this product?')) {
                    onDelete(product);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
