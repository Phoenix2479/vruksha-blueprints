import React, { useState, useEffect } from 'react';
import { Search, Barcode, Package } from 'lucide-react';
import { useDebounce } from '@shared/hooks';
import { searchProducts } from '../api/pos';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  tax_rate: number;
  in_stock: boolean;
}

interface ProductSearchProps {
  onProductSelect: (product: Product) => void;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ onProductSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const debouncedSearch = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      searchForProducts(debouncedSearch);
    } else {
      setProducts([]);
      setShowResults(false);
    }
  }, [debouncedSearch]);

  const searchForProducts = async (query: string) => {
    setLoading(true);
    try {
      const results = await searchProducts(query);
      setProducts(results);
      setShowResults(true);
    } catch (error) {
      console.error('Product search error:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProduct = (product: Product) => {
    onProductSelect(product);
    setSearchTerm('');
    setProducts([]);
    setShowResults(false);
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Search className="w-5 h-5" />
        Product Search
      </h3>
      
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, SKU, or barcode..."
          className="input pl-10"
          autoFocus
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && products.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => handleSelectProduct(product)}
              className="w-full px-4 py-3 hover:bg-gray-50 border-b last:border-0 text-left transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{product.name}</p>
                  <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">${product.price.toFixed(2)}</p>
                  {!product.in_stock && (
                    <p className="text-xs text-red-600">Out of stock</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && products.length === 0 && !loading && (
        <div className="mt-2 p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
          No products found
        </div>
      )}

      {/* Quick Scan Button */}
      <div className="mt-4">
        <button
          className="btn btn-secondary w-full flex items-center justify-center gap-2"
          onClick={() => {
            const barcode = prompt('Enter barcode:');
            if (barcode) {
              setSearchTerm(barcode);
            }
          }}
        >
          <Barcode className="w-4 h-4" />
          Scan Barcode
        </button>
      </div>

      {/* Recent Products */}
      <div className="mt-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Recent Products</p>
        <div className="space-y-2">
          <button className="w-full px-3 py-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span>Last scanned items will appear here</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
