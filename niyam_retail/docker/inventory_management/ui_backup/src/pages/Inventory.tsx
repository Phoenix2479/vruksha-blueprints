import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, AlertCircle } from 'lucide-react';
import { Button, TenantSwitcher } from '../../../../shared/components/index.ts';
import { ProductList } from '../components/ProductList';
import { ProductForm } from '../components/ProductForm';
import { StockAdjustmentForm } from '../components/StockAdjustmentForm';
import { ImportProducts } from '../components/ImportProducts';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
} from '../api/inventory';
import type { Product } from '../../../../shared/types/models.ts';
import { useDebounce } from '../../../../shared/hooks';
import { hasAnyRole } from '../../../../shared/utils/auth.ts';

export const Inventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showStockForm, setShowStockForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  useEffect(() => {
    loadProducts();
    loadLowStockCount();
  }, [debouncedSearch, showLowStockOnly]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getProducts({
        search: debouncedSearch || undefined,
        low_stock: showLowStockOnly || undefined,
      });
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLowStockCount = async () => {
    try {
      const lowStock = await getLowStockProducts();
      setLowStockCount(lowStock.length);
    } catch (error) {
      console.error('Error loading low stock count:', error);
    }
  };

  const handleCreateProduct = async (data: any) => {
    try {
      await createProduct(data);
      setShowProductForm(false);
      setSelectedProduct(null);
      loadProducts();
      loadLowStockCount();
    } catch (error) {
      alert('Failed to create product');
    }
  };

  const handleUpdateProduct = async (data: any) => {
    if (!selectedProduct) return;
    try {
      await updateProduct(selectedProduct.id, data);
      setShowProductForm(false);
      setSelectedProduct(null);
      loadProducts();
    } catch (error) {
      alert('Failed to update product');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      await deleteProduct(product.id);
      loadProducts();
      loadLowStockCount();
    } catch (error) {
      alert('Failed to delete product');
    }
  };

  const handleStockAdjustment = async (data: any) => {
    try {
      await adjustStock(data);
      setShowStockForm(false);
      setStockAdjustProduct(null);
      loadProducts();
      loadLowStockCount();
    } catch (error) {
      alert('Failed to adjust stock');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-primary-500" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
                <p className="text-sm text-gray-600">Manage products and stock levels</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TenantSwitcher />
              {hasAnyRole(['admin','manager']) && (
              <Button
                variant="primary"
                onClick={() => {
                  setSelectedProduct(null);
                  setShowProductForm(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Add Product
              </Button>
              )}
              {hasAnyRole(['admin','manager']) && (
              <Button
                variant="secondary"
                onClick={() => setShowImport(true)}
              >
                <Plus className="w-4 h-4" />
                Import
              </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Alerts & Filters */}
        <div className="mb-6 flex items-center justify-between gap-4">
          {/* Low Stock Alert */}
          {lowStockCount > 0 && (
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showLowStockOnly
                  ? 'bg-red-500 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">
                {lowStockCount} Low Stock Item{lowStockCount !== 1 ? 's' : ''}
              </span>
            </button>
          )}

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name or SKU..."
              className="input pl-10"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <p className="text-sm text-gray-600 mb-1">Total Products</p>
            <p className="text-3xl font-bold text-gray-900">{products.length}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600 mb-1">Low Stock Items</p>
            <p className="text-3xl font-bold text-red-600">{lowStockCount}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600 mb-1">Total Value</p>
            <p className="text-3xl font-bold text-gray-900">
              ${products.reduce((sum, p) => sum + (p.quantity_on_hand * p.unit_price), 0).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Product List */}
        <ProductList
          products={products}
          loading={loading}
          onEdit={(product) => {
            setSelectedProduct(product);
            setShowProductForm(true);
          }}
          onDelete={handleDeleteProduct}
          onAdjustStock={(product) => {
            setStockAdjustProduct(product);
            setShowStockForm(true);
          }}
        />
      </main>

      {/* Product Form Modal */}
      <ProductForm
        product={selectedProduct}
        isOpen={showProductForm}
        onClose={() => {
          setShowProductForm(false);
          setSelectedProduct(null);
        }}
        onSubmit={selectedProduct ? handleUpdateProduct : handleCreateProduct}
      />

      {/* Stock Adjustment Modal */}
      {stockAdjustProduct && (
        <StockAdjustmentForm
          product={stockAdjustProduct}
          isOpen={showStockForm}
          onClose={() => {
            setShowStockForm(false);
            setStockAdjustProduct(null);
          }}
          onSubmit={handleStockAdjustment}
        />
      )}

      {/* Import Modal */}
      <ImportProducts
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onCompleted={() => { loadProducts(); loadLowStockCount(); }}
      />
    </div>
  );
};
