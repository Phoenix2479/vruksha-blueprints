import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ScrollArea,
} from "../../../../shared/components/ui";
import { StatsCard, StatusBadge, getInventoryStatus, DialogButtons } from "../../../../shared/components/blocks";
import {
  Plus,
  Search,
  RefreshCw,
  Package,
  AlertTriangle,
  Edit2,
  Trash2,
  DollarSign,
  Box,
  Loader2,
} from "lucide-react";
import type { Product } from "../../../../shared/types/models";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
} from "../api/inventory";

interface NewProduct {
  name: string;
  sku: string;
  category: string;
  description: string;
  unit_price: number;
  cost_price: number;
  tax_rate: number;
  quantity_on_hand: number;
  reorder_point: number;
}

const EMPTY_NEW_PRODUCT: NewProduct = {
  name: "",
  sku: "",
  category: "",
  description: "",
  unit_price: 0,
  cost_price: 0,
  tax_rate: 0,
  quantity_on_hand: 0,
  reorder_point: 10,
};

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [newProduct, setNewProduct] = useState<NewProduct>(EMPTY_NEW_PRODUCT);

  // Fetch products
  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: () => getProducts({ search: searchQuery || undefined }),
    refetchInterval: 30000,
  });

  // Fetch low stock count
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ["low-stock-products"],
    queryFn: getLowStockProducts,
  });

  // Add product mutation
  const addProductMutation = useMutation({
    mutationFn: async (product: NewProduct) => {
      const created = await createProduct({
        name: product.name,
        sku: product.sku,
        category: product.category || undefined,
        description: product.description || undefined,
        unit_price: product.unit_price,
        cost_price: product.cost_price || undefined,
        tax_rate: product.tax_rate,
        reorder_point: product.reorder_point,
      });

      if (product.quantity_on_hand > 0) {
        await adjustStock({
          product_id: created.id,
          quantity_change: product.quantity_on_hand,
          reason: "Initial stock on product creation",
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
      setAddDialogOpen(false);
      setNewProduct(EMPTY_NEW_PRODUCT);
    },
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Product> }) => {
      return updateProduct(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      setEditProduct(null);
    },
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
    },
  });

  // Filter products
  const filteredProducts = products.filter((p: Product) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Selection helpers
  const toggleSelectProduct = (id: string) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    setSelectedProducts(
      selectedProducts.size === filteredProducts.length
        ? new Set()
        : new Set(filteredProducts.map((p: Product) => p.id))
    );
  };

  const isAllSelected = filteredProducts.length > 0 && selectedProducts.size === filteredProducts.length;

  // Stats
  const totalProducts = products.length;
  const totalValue = products.reduce((sum: number, p: Product) => sum + (p.unit_price * p.quantity_on_hand), 0);
  const lowStockCount = lowStockProducts.length;
  const totalStock = products.reduce((sum: number, p: Product) => sum + p.quantity_on_hand, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 space-y-6 max-w-7xl px-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Inventory Management</h1>
            <p className="text-muted-foreground">Manage your products and stock levels</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Total Products" value={totalProducts} icon={Package} iconColor="text-blue-500" iconBgColor="bg-blue-500/10" />
          <StatsCard title="Total Value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} iconColor="text-green-500" iconBgColor="bg-green-500/10" />
          <StatsCard title="Total Stock" value={totalStock.toLocaleString()} icon={Box} iconColor="text-purple-500" iconBgColor="bg-purple-500/10" />
          <StatsCard title="Low Stock Items" value={lowStockCount} icon={AlertTriangle} iconColor="text-amber-500" iconBgColor="bg-amber-500/10" className={lowStockCount > 0 ? "border-amber-500/30" : ""} />
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products by name, SKU, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Products Table */}
        <Card className="rounded-lg border">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading products...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      {searchQuery ? "No products match your search" : "No products found. Add your first product!"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product: Product) => (
                    <TableRow key={product.id} className={selectedProducts.has(product.id) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => toggleSelectProduct(product.id)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{product.name}</p>
                          {product.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">{product.sku}</code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{product.category || "—"}</TableCell>
                      <TableCell className="text-right font-medium">${product.unit_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <span className={product.quantity_on_hand <= (product.reorder_point || 0) ? "text-amber-600 font-medium" : ""}>
                          {product.quantity_on_hand}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={getInventoryStatus(product.quantity_on_hand, product.reorder_point || 0)}
                          label={product.quantity_on_hand <= 0 ? "Out of Stock" : product.quantity_on_hand <= (product.reorder_point || 0) ? "Low Stock" : "In Stock"}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        <TooltipProvider delayDuration={300}>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setEditProduct(product)}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
                                  onClick={() => {
                                    if (confirm("Delete this product?")) {
                                      deleteProductMutation.mutate(product.id);
                                    }
                                  }}
                                  disabled={deleteProductMutation.isPending}
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
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>

      {/* Add Product Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Product
            </DialogTitle>
            <DialogDescription>Enter the details for your new product.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="e.g., Blue T-Shirt"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                  placeholder="e.g., BLU-TSH-001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  placeholder="e.g., Apparel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit_price">Unit Price *</Label>
                <Input
                  id="unit_price"
                  type="number"
                  step="0.01"
                  value={newProduct.unit_price || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, unit_price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Initial Stock</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={newProduct.quantity_on_hand || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, quantity_on_hand: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorder">Reorder Point</Label>
                <Input
                  id="reorder"
                  type="number"
                  value={newProduct.reorder_point || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, reorder_point: parseInt(e.target.value) || 0 })}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Tax Rate %</Label>
                <Input
                  id="tax"
                  type="number"
                  step="0.1"
                  value={newProduct.tax_rate || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, tax_rate: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogButtons
            onCancel={() => setAddDialogOpen(false)}
            onConfirm={() => addProductMutation.mutate(newProduct)}
            confirmText={addProductMutation.isPending ? "Adding..." : "Add Product"}
            confirmLoading={addProductMutation.isPending}
            confirmDisabled={!newProduct.name.trim() || !newProduct.sku.trim() || newProduct.unit_price <= 0}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={!!editProduct} onOpenChange={() => setEditProduct(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Product
            </DialogTitle>
            <DialogDescription>Update product details.</DialogDescription>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Product Name *</Label>
                  <Input
                    id="edit-name"
                    value={editProduct.name}
                    onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sku">SKU</Label>
                  <Input id="edit-sku" value={editProduct.sku} disabled className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Category</Label>
                  <Input
                    id="edit-category"
                    value={editProduct.category || ""}
                    onChange={(e) => setEditProduct({ ...editProduct, category: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Unit Price *</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    value={editProduct.unit_price}
                    onChange={(e) => setEditProduct({ ...editProduct, unit_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-stock">Stock</Label>
                  <Input
                    id="edit-stock"
                    type="number"
                    value={editProduct.quantity_on_hand}
                    onChange={(e) => setEditProduct({ ...editProduct, quantity_on_hand: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reorder">Reorder Point</Label>
                  <Input
                    id="edit-reorder"
                    type="number"
                    value={editProduct.reorder_point || ""}
                    onChange={(e) => setEditProduct({ ...editProduct, reorder_point: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tax">Tax Rate %</Label>
                  <Input
                    id="edit-tax"
                    type="number"
                    step="0.1"
                    value={editProduct.tax_rate}
                    onChange={(e) => setEditProduct({ ...editProduct, tax_rate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogButtons
            onCancel={() => setEditProduct(null)}
            onConfirm={() => {
              if (editProduct) {
                updateProductMutation.mutate({
                  id: editProduct.id,
                  updates: {
                    name: editProduct.name,
                    category: editProduct.category,
                    unit_price: editProduct.unit_price,
                    quantity_on_hand: editProduct.quantity_on_hand,
                    reorder_point: editProduct.reorder_point,
                    tax_rate: editProduct.tax_rate,
                  },
                });
              }
            }}
            confirmText={updateProductMutation.isPending ? "Saving..." : "Save Changes"}
            confirmLoading={updateProductMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
