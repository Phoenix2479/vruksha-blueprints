import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  catalogProductApi,
  categoryApi,
  brandApi,
  tagApi,
} from '../api/catalogApi';
import type { CreateProductRequest, CategoryWithChildren } from '../api/catalogApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { getTaxConfig } from '../../../../shared/config/tax';
import type { Product, Brand } from '../../../../shared/types/retail';
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
import { StatsCard, StatusBadge, DialogButtons, ThemeToggle } from '../../../../shared/components/blocks';
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Grid,
  List,
  Image as ImageIcon,
  Download,
  Upload,
  Copy,
  Layers,
  X,
  Check,
  Star,
  Barcode,
} from 'lucide-react';

const CURRENCY = 'INR';
const TAX_REGION = 'IN';

export default function CatalogMainPage() {
  const queryClient = useQueryClient();
  
  // State
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    brandId: '',
    status: 'all' as 'all' | 'active' | 'inactive',
  });
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  
  const limit = 50;

  // Queries
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['catalog-products', filters, page],
    queryFn: () => catalogProductApi.list({
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      brandId: filters.brandId || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      page,
      limit,
    }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: brandApi.list,
  });

  const { data: popularTags = [] } = useQuery({
    queryKey: ['popular-tags'],
    queryFn: () => tagApi.getPopular(20),
  });

  const products = productsData?.products || [];
  const totalProducts = productsData?.total || 0;

  // Format price
  const formatPrice = useCallback((amount: number) => {
    return formatCurrency(amount, CURRENCY);
  }, []);

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: catalogProductApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setIsAddDialogOpen(false);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateProductRequest> }) =>
      catalogProductApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setEditingProduct(null);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: catalogProductApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
    },
  });

  const duplicateProductMutation = useMutation({
    mutationFn: catalogProductApi.duplicate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: catalogProductApi.bulkDelete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setSelectedProducts(new Set());
    },
  });

  // Stats
  const activeCount = products.filter(p => p.isActive).length;
  const featuredCount = products.filter(p => p.isFeatured).length;
  const categoryCount = categories.length;

  // Selection handlers
  const toggleSelectProduct = (id: string) => {
    const newSet = new Set(selectedProducts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedProducts(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  const isAllSelected = products.length > 0 && selectedProducts.size === products.length;

  // Export
  const handleExport = async () => {
    try {
      const blob = await catalogProductApi.export(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `product-catalog-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({ search: '', categoryId: '', brandId: '', status: 'all' });
    setPage(1);
  };

  const hasFilters = filters.search || filters.categoryId || filters.brandId || filters.status !== 'all';

  // Flatten categories for select
  const flatCategories = flattenCategories(categories);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold">Product Catalog</h1>
              <p className="text-sm text-muted-foreground">Manage your product listings and categories</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => setIsCategoryDialogOpen(true)}>
              <Layers className="h-4 w-4 mr-1" />
              Categories
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsBrandDialogOpen(true)}>
              <Tag className="h-4 w-4 mr-1" />
              Brands
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Product
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="Total Products"
            value={totalProducts}
            icon={Package}
            iconColor="text-violet-600"
            iconBgColor="bg-violet-100"
          />
          <StatsCard
            title="Active Products"
            value={activeCount}
            icon={Check}
            iconColor="text-green-600"
            iconBgColor="bg-green-100"
          />
          <StatsCard
            title="Featured"
            value={featuredCount}
            icon={Star}
            iconColor="text-amber-600"
            iconBgColor="bg-amber-100"
          />
          <StatsCard
            title="Categories"
            value={categoryCount}
            icon={Layers}
            iconColor="text-blue-600"
            iconBgColor="bg-blue-100"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, barcode, or tags..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10"
                />
              </div>

              <Select
                value={filters.categoryId || 'all'}
                onValueChange={(v) => setFilters({ ...filters, categoryId: v === 'all' ? '' : v })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {flatCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {'—'.repeat(cat.level || 0)} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.brandId || 'all'}
                onValueChange={(v) => setFilters({ ...filters, brandId: v === 'all' ? '' : v })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.status}
                onValueChange={(v: any) => setFilters({ ...filters, status: v })}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {totalProducts} product{totalProducts !== 1 ? 's' : ''}
                </span>
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-r-none"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-l-none"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedProducts.size > 0 && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedProducts.size} selected
            </span>
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Delete ${selectedProducts.size} products?`)) {
                  bulkDeleteMutation.mutate(Array.from(selectedProducts));
                }
              }}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProducts(new Set())}>
              Clear Selection
            </Button>
          </div>
        )}

        {/* Products */}
        <Card>
          {viewMode === 'list' ? (
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
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}>
                          <Skeleton className="h-16 w-full" />
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
                          onClick={() => setIsAddDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add First Product
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <ProductTableRow
                        key={product.id}
                        product={product}
                        isSelected={selectedProducts.has(product.id)}
                        onToggleSelect={() => toggleSelectProduct(product.id)}
                        onEdit={() => setEditingProduct(product)}
                        onDelete={() => {
                          if (confirm('Delete this product?')) {
                            deleteProductMutation.mutate(product.id);
                          }
                        }}
                        onDuplicate={() => duplicateProductMutation.mutate(product.id)}
                        formatPrice={formatPrice}
                        categories={flatCategories}
                        brands={brands}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <CardContent className="p-6">
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-64 w-full" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {products.map((product) => (
                    <ProductGridCard
                      key={product.id}
                      product={product}
                      isSelected={selectedProducts.has(product.id)}
                      onToggleSelect={() => toggleSelectProduct(product.id)}
                      onEdit={() => setEditingProduct(product)}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          )}
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
      </main>

      {/* Add Product Dialog */}
      <ProductFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={(data) => createProductMutation.mutate(data)}
        isLoading={createProductMutation.isPending}
        categories={flatCategories}
        brands={brands}
        tags={popularTags.map(t => t.tag)}
        title="Add Product"
      />

      {/* Edit Product Dialog */}
      {editingProduct && (
        <ProductFormDialog
          open={!!editingProduct}
          onOpenChange={(open) => !open && setEditingProduct(null)}
          onSubmit={(data) => updateProductMutation.mutate({ id: editingProduct.id, data })}
          isLoading={updateProductMutation.isPending}
          categories={flatCategories}
          brands={brands}
          tags={popularTags.map(t => t.tag)}
          title="Edit Product"
          initialData={editingProduct}
        />
      )}

      {/* Category Management Dialog */}
      <CategoryManagementDialog
        open={isCategoryDialogOpen}
        onOpenChange={setIsCategoryDialogOpen}
        categories={categories}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['categories'] })}
      />

      {/* Brand Management Dialog */}
      <BrandManagementDialog
        open={isBrandDialogOpen}
        onOpenChange={setIsBrandDialogOpen}
        brands={brands}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['brands'] })}
      />

      {/* Import Dialog */}
      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['catalog-products'] })}
      />
    </div>
  );
}

// ============================================================================
// PRODUCT TABLE ROW
// ============================================================================

function ProductTableRow({
  product,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onDuplicate,
  formatPrice,
  categories,
  brands,
}: {
  product: Product;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  formatPrice: (n: number) => string;
  categories: { id: string; name: string }[];
  brands: Brand[];
}) {
  const category = categories.find(c => c.id === product.categoryId);
  const brand = brands.find(b => b.id === product.brandId);

  return (
    <TableRow className={isSelected ? 'bg-primary/5' : ''}>
      <TableCell>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{product.name}</p>
              {product.isFeatured && (
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              )}
            </div>
            {product.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {product.description}
              </p>
            )}
            {product.tags && product.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {product.tags.slice(0, 3).map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs px-1 py-0">
                    {tag}
                  </Badge>
                ))}
                {product.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{product.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <code className="text-sm bg-muted px-2 py-0.5 rounded">{product.sku}</code>
          {product.barcode && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Barcode className="h-3 w-3" />
              {product.barcode}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell>
        {category ? (
          <Badge variant="outline">{category.name}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {brand ? brand.name : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {formatPrice(product.costPrice)}
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatPrice(product.sellingPrice)}
        {product.mrp && product.mrp > product.sellingPrice && (
          <p className="text-xs text-muted-foreground line-through">
            {formatPrice(product.mrp)}
          </p>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge
          status={product.isActive ? 'active' : 'inactive'}
          label={product.isActive ? 'Active' : 'Inactive'}
          size="sm"
        />
      </TableCell>
      <TableCell>
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onEdit}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onDuplicate}>
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// PRODUCT GRID CARD
// ============================================================================

function ProductGridCard({
  product,
  isSelected,
  onToggleSelect,
  onEdit,
  formatPrice,
}: {
  product: Product;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  formatPrice: (n: number) => string;
}) {
  return (
    <Card className={`overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <div className="relative">
        <div className="h-40 bg-muted flex items-center justify-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
        <div className="absolute top-2 left-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {product.isFeatured && (
          <div className="absolute top-2 right-2">
            <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
          </div>
        )}
      </div>
      <CardContent className="p-4" onClick={onEdit}>
        <h3 className="font-medium truncate">{product.name}</h3>
        <p className="text-sm text-muted-foreground">{product.sku}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="font-semibold">{formatPrice(product.sellingPrice)}</span>
          <StatusBadge
            status={product.isActive ? 'active' : 'inactive'}
            label={product.isActive ? 'Active' : 'Inactive'}
            size="sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// PRODUCT FORM DIALOG
// ============================================================================

function ProductFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  categories,
  brands,
  tags: _tags,
  title,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateProductRequest) => void;
  isLoading: boolean;
  categories: { id: string; name: string; level?: number }[];
  brands: Brand[];
  tags: string[];
  title: string;
  initialData?: Product;
}) {
  const [formData, setFormData] = useState<CreateProductRequest>(() => {
    if (initialData) {
      return {
        name: initialData.name,
        sku: initialData.sku,
        barcode: initialData.barcode,
        description: initialData.description,
        categoryId: initialData.categoryId,
        brandId: initialData.brandId,
        costPrice: initialData.costPrice,
        sellingPrice: initialData.sellingPrice,
        mrp: initialData.mrp,
        taxRateId: initialData.taxRateId,
        hsnCode: initialData.hsnCode,
        unit: initialData.unit,
        isActive: initialData.isActive,
        isFeatured: initialData.isFeatured,
        tags: initialData.tags,
        reorderPoint: initialData.reorderPoint,
      };
    }
    return {
      name: '',
      sku: '',
      barcode: '',
      description: '',
      categoryId: '',
      brandId: '',
      costPrice: 0,
      sellingPrice: 0,
      mrp: 0,
      taxRateId: 'gst_18',
      hsnCode: '',
      unit: 'pcs',
      isActive: true,
      isFeatured: false,
      tags: [],
      reorderPoint: 10,
    };
  });

  const [tagInput, setTagInput] = useState('');

  const taxConfig = getTaxConfig(TAX_REGION);

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(t => t !== tag),
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      barcode: '',
      description: '',
      categoryId: '',
      brandId: '',
      costPrice: 0,
      sellingPrice: 0,
      mrp: 0,
      taxRateId: 'gst_18',
      hsnCode: '',
      unit: 'pcs',
      isActive: true,
      isFeatured: false,
      tags: [],
      reorderPoint: 10,
    });
    setTagInput('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {initialData ? 'Update product details' : 'Add a new product to your catalog'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Basic Information
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Classic T-Shirt"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU *</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g., TSH-BLU-001"
                  disabled={!!initialData}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Barcode</Label>
                <Input
                  value={formData.barcode || ''}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="e.g., 1234567890123"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
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
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description..."
              />
            </div>
          </div>

          <Separator />

          {/* Classification */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Classification
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
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
                      <SelectItem key={cat.id} value={cat.id}>
                        {'—'.repeat(cat.level || 0)} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select
                  value={formData.brandId || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, brandId: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Brand</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              {formData.tags && formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => handleRemoveTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
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
                <Label>Cost Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.costPrice || ''}
                  onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Selling Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.sellingPrice || ''}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>MRP</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.mrp || ''}
                  onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>
            {formData.sellingPrice > 0 && formData.costPrice > 0 && (
              <p className="text-sm text-muted-foreground">
                Margin: {(((formData.sellingPrice - formData.costPrice) / formData.sellingPrice) * 100).toFixed(1)}%
              </p>
            )}
          </div>

          <Separator />

          {/* Tax */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Tax
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tax Rate</Label>
                <Select
                  value={formData.taxRateId}
                  onValueChange={(v) => setFormData({ ...formData, taxRateId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
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
                  <Label>HSN Code</Label>
                  <Input
                    value={formData.hsnCode || ''}
                    onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                    placeholder="e.g., 6101"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Status */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Status & Settings
            </h4>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">Featured</span>
              </label>
            </div>
          </div>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onSubmit(formData)}
          confirmText={isLoading ? 'Saving...' : initialData ? 'Save Changes' : 'Add Product'}
          confirmLoading={isLoading}
          confirmDisabled={!formData.name.trim() || !formData.sku.trim() || formData.sellingPrice <= 0}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// CATEGORY MANAGEMENT DIALOG
// ============================================================================

function CategoryManagementDialog({
  open,
  onOpenChange,
  categories,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithChildren[];
  onRefresh: () => void;
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParent, setNewCategoryParent] = useState('');

  const createMutation = useMutation({
    mutationFn: categoryApi.create,
    onSuccess: () => {
      onRefresh();
      setNewCategoryName('');
      setNewCategoryParent('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: categoryApi.delete,
    onSuccess: () => onRefresh(),
  });

  const flatCategories = flattenCategories(categories);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>Add, edit, or delete product categories</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add Category */}
          <div className="flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name..."
              className="flex-1"
            />
            <Select value={newCategoryParent} onValueChange={setNewCategoryParent}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Parent</SelectItem>
                {flatCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {'—'.repeat(cat.level || 0)} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => createMutation.mutate({
                name: newCategoryName,
                parentId: newCategoryParent && newCategoryParent !== 'none' ? newCategoryParent : undefined,
              })}
              disabled={!newCategoryName.trim() || createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <Separator />

          {/* Category List */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {flatCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-muted"
                >
                  <span style={{ paddingLeft: (cat.level || 0) * 16 }}>
                    {cat.name}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({cat.productCount} products)
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete category "${cat.name}"?`)) {
                        deleteMutation.mutate(cat.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// BRAND MANAGEMENT DIALOG
// ============================================================================

function BrandManagementDialog({
  open,
  onOpenChange,
  brands,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  onRefresh: () => void;
}) {
  const [newBrandName, setNewBrandName] = useState('');

  const createMutation = useMutation({
    mutationFn: brandApi.create,
    onSuccess: () => {
      onRefresh();
      setNewBrandName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: brandApi.delete,
    onSuccess: () => onRefresh(),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Manage Brands</DialogTitle>
          <DialogDescription>Add or remove product brands</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add Brand */}
          <div className="flex gap-2">
            <Input
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="New brand name..."
              className="flex-1"
            />
            <Button
              onClick={() => createMutation.mutate({ name: newBrandName })}
              disabled={!newBrandName.trim() || createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <Separator />

          {/* Brand List */}
          <ScrollArea className="h-[250px]">
            <div className="space-y-1">
              {brands.map((brand) => (
                <div
                  key={brand.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-muted"
                >
                  <span>{brand.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete brand "${brand.name}"?`)) {
                        deleteMutation.mutate(brand.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// IMPORT DIALOG
// ============================================================================

function ImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);

  const importMutation = useMutation({
    mutationFn: (f: File) => catalogProductApi.import(f, { updateExisting }),
    onSuccess: (result) => {
      alert(`Imported: ${result.imported}, Updated: ${result.updated}, Failed: ${result.failed}`);
      onSuccess();
      onOpenChange(false);
      setFile(null);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Import Products</DialogTitle>
          <DialogDescription>Upload a CSV or Excel file</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="import-file"
            />
            <label htmlFor="import-file" className="cursor-pointer">
              <span className="text-primary hover:underline">Choose a file</span>
              <span className="text-muted-foreground"> or drag and drop</span>
            </label>
            {file && (
              <p className="mt-2 text-sm font-medium">{file.name}</p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">Update existing products (match by SKU)</span>
          </label>
        </div>

        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => file && importMutation.mutate(file)}
          confirmText={importMutation.isPending ? 'Importing...' : 'Import'}
          confirmLoading={importMutation.isPending}
          confirmDisabled={!file}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function flattenCategories(categories: CategoryWithChildren[], level = 0): (CategoryWithChildren & { level: number })[] {
  const result: (CategoryWithChildren & { level: number })[] = [];
  
  for (const cat of categories) {
    result.push({ ...cat, level });
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children, level + 1));
    }
  }
  
  return result;
}
