import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInventoryStore } from '../store/inventoryStore';
import {
  productApi,
  categoryApi,
  stockAdjustmentApi,
  alertsApi,
  valuationApi,
} from '../api/inventoryApi';
import type { CreateAdjustmentRequest } from '../api/inventoryApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { getTaxConfig } from '../../../../shared/config/tax';
import type { Product, StockAdjustmentReason } from '../../../../shared/types/retail';
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
  Separator,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../../shared/components/ui';
import { StatsCard, StatusBadge, DialogButtons } from '../../../../shared/components/blocks';
import {
  Package,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  Edit2,
  ArrowUpDown,
  Download,
  Box,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  X,
  Barcode,
} from 'lucide-react';

export default function InventoryMainPage() {
  const queryClient = useQueryClient();
  const {
    filters,
    setFilter,
    resetFilters,
    viewMode: _viewMode,
    selectedProducts,
    toggleSelectProduct,
    selectAll,
    clearSelection,
    isAddDialogOpen,
    setAddDialogOpen,
    isAdjustDialogOpen,
    setAdjustDialogOpen,
    editingProduct,
    setEditingProduct,
    adjustmentProduct,
    setAdjustmentProduct,
    currency,
    taxRegion,
  } = useInventoryStore();

  const [page, setPage] = useState(1);
  const limit = 50;

  // Fetch products
  const { data: productsData, isLoading: isLoadingProducts, refetch } = useQuery({
    queryKey: ['inventory-products', filters, page],
    queryFn: () => productApi.list({
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      page,
      limit,
    }),
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });

  // Fetch valuation
  const { data: valuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => valuationApi.get(),
  });

  // Fetch low stock
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['low-stock-products'],
    queryFn: () => alertsApi.getLowStock(),
  });

  const products = productsData?.products || [];
  const totalProducts = productsData?.total || 0;

  // Format price
  const formatPrice = useCallback((amount: number) => {
    return formatCurrency(amount, currency);
  }, [currency]);

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: productApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      setAddDialogOpen(false);
    },
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      setEditingProduct(null);
    },
  });

  // Delete product mutation (for future use)
  void useMutation({
    mutationFn: productApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
    },
  });

  // Stock adjustment mutation
  const adjustStockMutation = useMutation({
    mutationFn: stockAdjustmentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-products'] });
      setAdjustDialogOpen(false);
      setAdjustmentProduct(null);
    },
  });

  // Export products
  const handleExport = async () => {
    try {
      const blob = await productApi.export(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Selection
  const isAllSelected = products.length > 0 && selectedProducts.size === products.length;
  const toggleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll(products.map(p => p.id));
    }
  };

  // Get stock status
  const getStockStatus = (product: Product) => {
    if (product.quantityOnHand <= 0) return 'error';
    if (product.quantityOnHand <= product.reorderPoint) return 'warning';
    return 'active';
  };

  const getStockLabel = (product: Product) => {
    if (product.quantityOnHand <= 0) return 'Out of Stock';
    if (product.quantityOnHand <= product.reorderPoint) return 'Low Stock';
    return 'In Stock';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 space-y-6 max-w-7xl px-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
            <p className="text-muted-foreground">Manage products, stock levels, and inventory operations</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard
            title="Total Products"
            value={valuation?.totalProducts || 0}
            icon={Package}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/10"
          />
          <StatsCard
            title="Total Stock"
            value={(valuation?.totalQuantity || 0).toLocaleString()}
            icon={Box}
            iconColor="text-purple-500"
            iconBgColor="bg-purple-500/10"
          />
          <StatsCard
            title="Stock Value (Cost)"
            value={formatPrice(valuation?.totalCostValue || 0)}
            icon={TrendingDown}
            iconColor="text-amber-500"
            iconBgColor="bg-amber-500/10"
          />
          <StatsCard
            title="Stock Value (Retail)"
            value={formatPrice(valuation?.totalRetailValue || 0)}
            icon={TrendingUp}
            iconColor="text-green-500"
            iconBgColor="bg-green-500/10"
          />
          <StatsCard
            title="Low Stock Items"
            value={lowStockProducts.length}
            icon={AlertTriangle}
            iconColor="text-red-500"
            iconBgColor="bg-red-500/10"
            className={lowStockProducts.length > 0 ? 'border-red-500/30' : ''}
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by name, SKU, or barcode..."
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select
                value={filters.categoryId || 'all'}
                onValueChange={(v) => setFilter('categoryId', v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.status}
                onValueChange={(v: any) => setFilter('status', v)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>

              {(filters.search || filters.categoryId || filters.status !== 'all') && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}

              <div className="ml-auto text-sm text-muted-foreground">
                {totalProducts} product{totalProducts !== 1 ? 's' : ''}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU / Barcode</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingProducts ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}>
                        <Skeleton className="h-12 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No products found</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => setAddDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Product
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow
                      key={product.id}
                      className={selectedProducts.has(product.id) ? 'bg-primary/5' : ''}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => toggleSelectProduct(product.id)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <code className="text-sm bg-muted px-2 py-0.5 rounded">
                            {product.sku}
                          </code>
                          {product.barcode && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Barcode className="h-3 w-3" />
                              {product.barcode}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.categoryId ? (
                          <Badge variant="outline">{product.categoryId}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatPrice(product.costPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(product.sellingPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            product.quantityOnHand <= 0
                              ? 'text-red-600 font-medium'
                              : product.quantityOnHand <= product.reorderPoint
                              ? 'text-amber-600 font-medium'
                              : ''
                          }
                        >
                          {product.quantityOnHand}
                        </span>
                        <span className="text-muted-foreground text-sm ml-1">
                          {product.unit}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={getStockStatus(product)}
                          label={getStockLabel(product)}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setAdjustmentProduct(product);
                                    setAdjustDialogOpen(true);
                                  }}
                                >
                                  <ArrowUpDown className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Adjust Stock</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingProduct(product)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Pagination */}
        {productsData && productsData.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {productsData.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= productsData.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Product Dialog */}
      <AddProductDialog
        open={isAddDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={(data) => createProductMutation.mutate(data)}
        isLoading={createProductMutation.isPending}
        categories={categories}
        currency={currency}
        taxRegion={taxRegion}
      />

      {/* Edit Product Dialog */}
      {editingProduct && (
        <EditProductDialog
          product={editingProduct}
          open={!!editingProduct}
          onOpenChange={(open) => !open && setEditingProduct(null)}
          onSubmit={(data) => updateProductMutation.mutate({ id: editingProduct.id, data })}
          isLoading={updateProductMutation.isPending}
          categories={categories}
          currency={currency}
        />
      )}

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        product={adjustmentProduct}
        open={isAdjustDialogOpen && !!adjustmentProduct}
        onOpenChange={(open) => {
          setAdjustDialogOpen(open);
          if (!open) setAdjustmentProduct(null);
        }}
        onSubmit={(data) => adjustStockMutation.mutate(data)}
        isLoading={adjustStockMutation.isPending}
      />
    </div>
  );
}

// ============================================================================
// ADD PRODUCT DIALOG
// ============================================================================

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<Product>) => void;
  isLoading: boolean;
  categories: { id: string; name: string }[];
  currency: string;
  taxRegion: string;
}

function AddProductDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  categories,
  currency: _currency,
  taxRegion,
}: AddProductDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    description: '',
    costPrice: 0,
    sellingPrice: 0,
    mrp: 0,
    taxRateId: 'gst_18',
    hsnCode: '',
    reorderPoint: 10,
    reorderQuantity: 0,
    unit: 'pcs',
    initialStock: 0,
  });

  const taxConfig = getTaxConfig(taxRegion as any);

  const handleSubmit = () => {
    onSubmit({
      name: formData.name,
      sku: formData.sku,
      barcode: formData.barcode || undefined,
      categoryId: formData.categoryId || undefined,
      description: formData.description || undefined,
      costPrice: formData.costPrice,
      sellingPrice: formData.sellingPrice,
      mrp: formData.mrp || undefined,
      taxRateId: formData.taxRateId,
      hsnCode: formData.hsnCode || undefined,
      reorderPoint: formData.reorderPoint,
      reorderQuantity: formData.reorderQuantity,
      unit: formData.unit,
      quantityOnHand: formData.initialStock,
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      barcode: '',
      categoryId: '',
      description: '',
      costPrice: 0,
      sellingPrice: 0,
      mrp: 0,
      taxRateId: 'gst_18',
      hsnCode: '',
      reorderPoint: 10,
      reorderQuantity: 0,
      unit: 'pcs',
      initialStock: 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Product
          </DialogTitle>
          <DialogDescription>Enter the product details</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Basic Information
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Blue T-Shirt"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g., BLU-TSH-001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode</Label>
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="e.g., 1234567890123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.categoryId || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, categoryId: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description..."
              />
            </div>
          </div>

          <Separator />

          {/* Pricing */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Pricing
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costPrice">Cost Price *</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  value={formData.costPrice || ''}
                  onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellingPrice">Selling Price *</Label>
                <Input
                  id="sellingPrice"
                  type="number"
                  step="0.01"
                  value={formData.sellingPrice || ''}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mrp">MRP</Label>
                <Input
                  id="mrp"
                  type="number"
                  step="0.01"
                  value={formData.mrp || ''}
                  onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Tax */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Tax Configuration
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate</Label>
                <Select
                  value={formData.taxRateId}
                  onValueChange={(v) => setFormData({ ...formData, taxRateId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax rate" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxConfig.rates.map((rate) => (
                      <SelectItem key={rate.id} value={rate.id}>
                        {rate.name} ({rate.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {taxConfig.requiresHSN && (
                <div className="space-y-2">
                  <Label htmlFor="hsnCode">HSN Code</Label>
                  <Input
                    id="hsnCode"
                    value={formData.hsnCode}
                    onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                    placeholder="e.g., 6101"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Inventory */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Inventory
            </h4>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="initialStock">Initial Stock</Label>
                <Input
                  id="initialStock"
                  type="number"
                  value={formData.initialStock || ''}
                  onChange={(e) => setFormData({ ...formData, initialStock: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorderPoint">Reorder Point</Label>
                <Input
                  id="reorderPoint"
                  type="number"
                  value={formData.reorderPoint || ''}
                  onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorderQty">Reorder Qty</Label>
                <Input
                  id="reorderQty"
                  type="number"
                  value={formData.reorderQuantity || ''}
                  onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(v) => setFormData({ ...formData, unit: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces</SelectItem>
                    <SelectItem value="kg">Kilograms</SelectItem>
                    <SelectItem value="g">Grams</SelectItem>
                    <SelectItem value="l">Liters</SelectItem>
                    <SelectItem value="ml">Milliliters</SelectItem>
                    <SelectItem value="m">Meters</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={handleSubmit}
          confirmText={isLoading ? 'Adding...' : 'Add Product'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.name.trim() || !formData.sku.trim() || formData.sellingPrice <= 0}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EDIT PRODUCT DIALOG
// ============================================================================

interface EditProductDialogProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<Product>) => void;
  isLoading: boolean;
  categories: { id: string; name: string }[];
  currency: string;
}

function EditProductDialog({
  product,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  categories,
  currency: _currency,
}: EditProductDialogProps) {
  const [formData, setFormData] = useState({
    name: product.name,
    categoryId: product.categoryId || '',
    description: product.description || '',
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    mrp: product.mrp || 0,
    reorderPoint: product.reorderPoint,
    isActive: product.isActive,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Edit Product
          </DialogTitle>
          <DialogDescription>Update product details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Product Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sku">SKU</Label>
              <Input id="edit-sku" value={product.sku} disabled className="bg-muted" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cost">Cost Price</Label>
              <Input
                id="edit-cost"
                type="number"
                step="0.01"
                value={formData.costPrice}
                onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Selling Price *</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={formData.sellingPrice}
                onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-reorder">Reorder Point</Label>
              <Input
                id="edit-reorder"
                type="number"
                value={formData.reorderPoint}
                onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={formData.categoryId || 'none'}
                onValueChange={(v) => setFormData({ ...formData, categoryId: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit(formData)}
          confirmText={isLoading ? 'Saving...' : 'Save Changes'}
          confirmLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// STOCK ADJUSTMENT DIALOG
// ============================================================================

interface StockAdjustmentDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAdjustmentRequest) => void;
  isLoading: boolean;
}

function StockAdjustmentDialog({
  product,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: StockAdjustmentDialogProps) {
  const [adjustmentType, setAdjustmentType] = useState<'addition' | 'subtraction' | 'count'>('addition');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState<StockAdjustmentReason>('other');
  const [notes, setNotes] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const reasons = stockAdjustmentApi.getReasons();

  const handleSubmit = () => {
    if (!product) return;
    
    const quantityChange = adjustmentType === 'subtraction' ? -Math.abs(quantity) :
                          adjustmentType === 'count' ? quantity - product.quantityOnHand :
                          Math.abs(quantity);
    
    onSubmit({
      productId: product.id,
      type: adjustmentType,
      reason,
      quantityChange,
      notes: notes || undefined,
      batchNumber: batchNumber || undefined,
      expiryDate: expiryDate || undefined,
    });
  };

  const resetForm = () => {
    setAdjustmentType('addition');
    setQuantity(0);
    setReason('other');
    setNotes('');
    setBatchNumber('');
    setExpiryDate('');
  };

  if (!product) return null;

  const newQuantity = adjustmentType === 'count' 
    ? quantity 
    : adjustmentType === 'addition'
    ? product.quantityOnHand + quantity
    : product.quantityOnHand - quantity;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            {product.name} ({product.sku}) - Current: {product.quantityOnHand} {product.unit}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Adjustment Type */}
          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'addition', label: 'Add Stock', icon: TrendingUp, color: 'text-green-600' },
                { value: 'subtraction', label: 'Remove Stock', icon: TrendingDown, color: 'text-red-600' },
                { value: 'count', label: 'Set Count', icon: ClipboardList, color: 'text-blue-600' },
              ].map(({ value, label, icon: Icon, color }) => (
                <Button
                  key={value}
                  type="button"
                  variant={adjustmentType === value ? 'default' : 'outline'}
                  className="flex flex-col h-16"
                  onClick={() => setAdjustmentType(value as any)}
                >
                  <Icon className={`h-5 w-5 mb-1 ${adjustmentType === value ? '' : color}`} />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              {adjustmentType === 'count' ? 'New Count' : 'Quantity'}
            </Label>
            <Input
              id="quantity"
              type="number"
              value={quantity || ''}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              placeholder="0"
              min={0}
            />
            {quantity > 0 && (
              <p className="text-sm text-muted-foreground">
                New stock level: <span className="font-medium">{newQuantity}</span> {product.unit}
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={(v: StockAdjustmentReason) => setReason(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Batch & Expiry */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="batch">Batch Number</Label>
              <Input
                id="batch"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry">Expiry Date</Label>
              <Input
                id="expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes..."
            />
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={handleSubmit}
          confirmText={isLoading ? 'Adjusting...' : 'Confirm Adjustment'}
          confirmLoading={isLoading}
          confirmDisabled={quantity === 0 && adjustmentType !== 'count'}
        />
      </DialogContent>
    </Dialog>
  );
}
