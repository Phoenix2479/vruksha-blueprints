import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
} from "../../../../shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "../../../../shared/components/blocks";
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Grid,
  List,
  Loader2,
  Image,
  DollarSign,
  Layers,
} from "lucide-react";

interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  brand: string;
  price: number;
  cost: number;
  image_url?: string;
  is_active: boolean;
  variants?: string[];
  tags?: string[];
  created_at: string;
}

const mockProducts: CatalogProduct[] = [
  { id: "1", name: "Classic T-Shirt", sku: "TSH-001", description: "100% cotton t-shirt", category: "Apparel", brand: "BasicWear", price: 29.99, cost: 12.00, is_active: true, tags: ["cotton", "basics"], created_at: new Date().toISOString() },
  { id: "2", name: "Denim Jeans", sku: "JNS-001", description: "Slim fit denim jeans", category: "Apparel", brand: "DenimCo", price: 79.99, cost: 35.00, is_active: true, tags: ["denim", "casual"], created_at: new Date().toISOString() },
  { id: "3", name: "Running Shoes", sku: "SHO-001", description: "Lightweight running shoes", category: "Footwear", brand: "SpeedRun", price: 129.99, cost: 55.00, is_active: true, tags: ["sports", "running"], created_at: new Date().toISOString() },
  { id: "4", name: "Leather Wallet", sku: "WAL-001", description: "Genuine leather wallet", category: "Accessories", brand: "LeatherCraft", price: 49.99, cost: 18.00, is_active: false, tags: ["leather", "accessories"], created_at: new Date().toISOString() },
];

export default function ProductCatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showAddModal, setShowAddModal] = useState(false);
  const [, setSelectedProduct] = useState<CatalogProduct | null>(null);

  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    description: "",
    category: "",
    brand: "",
    price: 0,
    cost: 0,
  });

  const { data: products = mockProducts, isLoading } = useQuery({
    queryKey: ["catalog-products"],
    queryFn: async () => mockProducts,
  });

  const categories = [...new Set(products.map((p) => p.category))];
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.is_active).length;
  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => sum + ((p.price - p.cost) / p.price) * 100, 0) / products.length
    : 0;

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleSaveProduct = () => {
    setShowAddModal(false);
    setNewProduct({ name: "", sku: "", description: "", category: "", brand: "", price: 0, cost: 0 });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold">Product Catalog</h1>
              <p className="text-sm text-muted-foreground">Manage your product listings</p>
            </div>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Products" value={totalProducts} icon={<Package className="h-5 w-5" />} iconColor="text-violet-600" iconBg="bg-violet-100" />
          <StatsCard title="Active Products" value={activeProducts} icon={<Tag className="h-5 w-5" />} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="Categories" value={categories.length} icon={<Layers className="h-5 w-5" />} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <StatsCard title="Avg. Margin" value={`${avgMargin.toFixed(1)}%`} icon={<DollarSign className="h-5 w-5" />} iconColor="text-emerald-600" iconBg="bg-emerald-100" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Products</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 w-64" />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div className="flex border rounded-md">
                  <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setViewMode("list")}>
                    <List className="h-4 w-4" />
                  </Button>
                  <Button variant={viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setViewMode("grid")}>
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : viewMode === "list" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                            <Image className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><code className="text-sm bg-muted px-2 py-1 rounded">{product.sku}</code></TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>{product.brand}</TableCell>
                      <TableCell className="text-right font-medium">${product.price.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${product.cost.toFixed(2)}</TableCell>
                      <TableCell>
                        <StatusBadge status={product.is_active ? "active" : "inactive"} label={product.is_active ? "Active" : "Inactive"} size="sm" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedProduct(product)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="overflow-hidden">
                    <div className="h-32 bg-muted flex items-center justify-center">
                      <Image className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium truncate">{product.name}</h3>
                      <p className="text-sm text-muted-foreground">{product.brand}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-semibold">${product.price.toFixed(2)}</span>
                        <StatusBadge status={product.is_active ? "active" : "inactive"} label={product.is_active ? "Active" : "Inactive"} size="sm" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Product
            </DialogTitle>
            <DialogDescription>Add a new product to your catalog</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="e.g., Classic T-Shirt" />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} placeholder="e.g., TSH-001" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} placeholder="Product description..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} placeholder="e.g., Apparel" />
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <Input value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} placeholder="e.g., BasicWear" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" value={newProduct.price || ""} onChange={(e) => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input type="number" value={newProduct.cost || ""} onChange={(e) => setNewProduct({ ...newProduct, cost: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
              </div>
            </div>
          </div>
          <DialogButtons onCancel={() => setShowAddModal(false)} onConfirm={handleSaveProduct} confirmText="Add Product" confirmDisabled={!newProduct.name || !newProduct.sku} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
