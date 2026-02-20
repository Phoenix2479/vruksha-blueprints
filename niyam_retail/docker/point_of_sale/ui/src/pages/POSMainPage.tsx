import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usePOSStore } from '../store/posStore';
import { usePOSConfigStore, type LayoutPreset } from '../store/posConfigStore';
import { sessionApi, productApi, cartApi, checkoutApi } from '../api/posApi';
import { formatCurrency } from '@shared/config/currency';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
  Badge,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
  Card,
} from '@shared/components/ui';
import { ThemeToggle, DialogButtons } from '@shared/components/blocks';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Package,
  Loader2,
  User,
  Pause,
  Receipt,
  X,
  Tag,
  ScanBarcode,
  Grid3X3,
  Sparkles,
  Shirt,
  Baby,
  Watch,
  Settings,
  Building2,
  Truck,
  BarChart3,
  ChevronRight,
  Wallet,
  Clock,
  Users,
  List,
  LayoutGrid,
  Lock,
  Unlock,
  AlertTriangle,
  Check,
  Zap,
  Sliders,
  Volume2,
  VolumeX,
  Keyboard,
  ShoppingBag,
  Gift,
} from 'lucide-react';
import type { ProductSearchResult as APIProductResult } from '../api/posApi';
import type { CartItem as BaseCartItem } from '@shared/types/retail';

// Extended types for display
interface ProductSearchResult {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  price: number;
  originalPrice?: number;
  stockQuantity: number;
  category?: string;
  sizes?: string[];
  colors?: string[];
  defaultVariantId?: string;
  taxRate?: number;
  taxRateId?: string;
  imageUrl?: string;
}

interface CartItem extends BaseCartItem {
  imageUrl?: string;
}

// Map API result to display type
function mapToDisplayProduct(p: APIProductResult): ProductSearchResult {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    price: p.sellingPrice,
    originalPrice: p.mrp,
    stockQuantity: p.quantityOnHand,
    category: p.categoryName,
    defaultVariantId: p.variants?.[0]?.id,
    taxRate: p.taxRate,
    taxRateId: p.taxRateId,
    imageUrl: p.imageUrl,
  };
}

const STORE_ID = localStorage.getItem('niyam_store_id') || '00000000-0000-0000-0000-000000000001';
const CASHIER_ID = localStorage.getItem('niyam_user_id') || '00000000-0000-0000-0000-000000000001';

// Category configuration
const categories = [
  { id: 'all', label: 'All Products', icon: Grid3X3 },
  { id: 'men', label: 'Men', icon: Shirt },
  { id: 'women', label: 'Women', icon: Sparkles },
  { id: 'unisex', label: 'Unisex', icon: Users },
  { id: 'kids', label: 'Kids', icon: Baby },
  { id: 'accessories', label: 'Accessories', icon: Watch },
];

// Sidebar navigation items
const allSidebarItems = [
  { id: 'overview', label: 'Overview', icon: BarChart3, group: 'Main Menu' },
  { id: 'orders', label: 'Orders', icon: ShoppingBag, group: 'Main Menu' },
  { id: 'categories', label: 'Categories', icon: Grid3X3, group: 'Main Menu' },
  { id: 'promos', label: 'Promos', icon: Tag, group: 'Main Menu' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, group: 'Main Menu' },
  { id: 'products', label: 'Products', icon: Package, group: 'Inventory' },
  { id: 'reporting', label: 'Reporting', icon: BarChart3, group: 'Report' },
  { id: 'userManagement', label: 'User Management', icon: Users, group: 'Settings' },
  { id: 'bankAccount', label: 'Bank Account', icon: Building2, group: 'Settings' },
  { id: 'deliveryOrders', label: 'Delivery Orders', icon: Truck, group: 'Settings' },
];

// Color swatches
const colorSwatches: Record<string, string> = {
  black: '#1a1a1a', white: '#ffffff', navy: '#1e3a5f', gray: '#6b7280',
  brown: '#8b5a2b', beige: '#f5f5dc', olive: '#556b2f', cream: '#fffdd0',
  red: '#dc2626', blue: '#2563eb', green: '#16a34a', yellow: '#eab308',
};

export default function POSMainPage() {
  const posStore = usePOSStore();
  const configStore = usePOSConfigStore();
  
  const {
    session, setSession, cart, setCart, addToCart, updateCartItem,
    removeFromCart, clearCart, selectedCustomer, setSelectedCustomer,
    heldTransactions, holdCurrentCart, currency, isPaymentModalOpen, setPaymentModalOpen,
  } = posStore;
  
  const { settings, activeWorker, setQuickSwitchOpen, setSettingsOpen } = configStore;

  // State
  const [activeNav, setActiveNav] = useState('orders');
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(1000);
  const [discountCode, setDiscountCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'wallet' | 'credit' | 'giftcard'>('cash');
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const barcodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load products with stock info
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      try {
        const result = await productApi.search({
          query: searchQuery || undefined,
          categoryId: activeCategory !== 'all' ? activeCategory : undefined,
          limit: 50,
        });
        // Map API results to display format
        const mapped = (result || []).map(mapToDisplayProduct);
        setProducts(mapped);
      } catch (error) {
        console.error('Failed to load products:', error);
        // Mock data for demo
        setProducts(getMockProducts());
      } finally {
        setIsLoading(false);
      }
    };
    loadProducts();
  }, [searchQuery, activeCategory]);

  // Check for active session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const activeSession = await sessionApi.getActive(CASHIER_ID);
        if (activeSession) {
          setSession(activeSession);
          const existingCart = await cartApi.get(activeSession.id);
          setCart(existingCart);
        } else {
          setShowOpenSession(true);
        }
      } catch {
        setShowOpenSession(true);
      }
    };
    checkSession();
  }, []);

  // Barcode scanner handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        handleBarcodeScanned(barcodeBuffer);
        setBarcodeBuffer('');
        return;
      }
      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        setBarcodeBuffer(prev => prev + e.key);
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
        barcodeTimeoutRef.current = setTimeout(() => setBarcodeBuffer(''), 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [barcodeBuffer, session]);

  const handleBarcodeScanned = async (barcode: string) => {
    if (!session) return;
    try {
      const apiProduct = await productApi.getByBarcode(barcode);
      if (apiProduct) handleAddToCart(mapToDisplayProduct(apiProduct));
    } catch (error) {
      console.error('Barcode lookup failed:', error);
    }
  };

  // Session mutations
  const openSessionMutation = useMutation({
    mutationFn: () => sessionApi.open({
      cashierId: activeWorker?.id || CASHIER_ID,
      registerId: 'REG-001',
      storeId: STORE_ID,
      openingBalance,
    }),
    onSuccess: (newSession) => {
      setSession(newSession);
      setShowOpenSession(false);
    },
  });

  // Cart handlers
  const handleAddToCart = (product: ProductSearchResult, selectedSize?: string) => {
    if (!session) return;
    if (settings.soundEffects) playSound('add');
    
    addToCart({
      productId: product.id,
      variantId: product.defaultVariantId,
      name: product.name,
      sku: product.sku,
      quantity: 1,
      unitPrice: product.price,
      discountAmount: 0,
      taxRate: product.taxRate || 18,
      taxRateId: product.taxRateId || 'default',
      taxAmount: 0,
      lineTotal: product.price,
      notes: selectedSize ? `Size: ${selectedSize}` : undefined,
    });
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    const item = cart?.items.find(i => i.id === itemId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      removeFromCart(itemId);
    } else {
      updateCartItem(itemId, { quantity: newQty });
    }
  };

  const handleClearCart = () => {
    if (settings.confirmBeforeClear && cart?.items.length) {
      if (!confirm('Clear all items from cart?')) return;
    }
    clearCart();
  };

  const formatPrice = (amount: number) => formatCurrency(amount, currency);

  // Calculate totals
  const subtotal = cart?.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0) || 0;
  const discount = 0;
  const taxRate = 0.18;
  const salesTax = (subtotal - discount) * taxRate;
  const total = subtotal - discount + salesTax;

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: () => checkoutApi.complete({
      sessionId: session!.id,
      payments: [{
        method: paymentMethod,
        amount: total,
      }],
      customerId: selectedCustomer?.id,
    }),
    onSuccess: () => {
      if (settings.soundEffects) playSound('success');
      clearCart();
      setPaymentModalOpen(false);
      setSelectedCustomer(null);
    },
  });

  // Sound effects
  const playSound = (type: 'add' | 'remove' | 'success' | 'error') => {
    // In a real app, play actual sounds
    console.log(`Sound: ${type}`);
  };

  // Filter sidebar items based on settings
  const visibleSidebarItems = allSidebarItems.filter(item => 
    settings.sidebar.items[item.id as keyof typeof settings.sidebar.items]
  );

  // Group sidebar items
  const groupedSidebarItems = visibleSidebarItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof visibleSidebarItems>);

  if (!session && !showOpenSession) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Left Sidebar - Conditional */}
      {settings.sidebar.visible && (
        <aside className={`${settings.sidebar.collapsed ? 'w-16' : 'w-56'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all`}>
          {/* Logo */}
          <div className="h-16 px-4 flex items-center border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
              {!settings.sidebar.collapsed && (
                <span className="font-semibold text-lg dark:text-white">Niyam POS</span>
              )}
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className={`${settings.sidebar.collapsed ? 'px-2' : 'px-3'} space-y-6`}>
              {Object.entries(groupedSidebarItems).map(([group, items]) => (
                <div key={group}>
                  {!settings.sidebar.collapsed && (
                    <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      {group}
                    </p>
                  )}
                  <div className="space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeNav === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveNav(item.id)}
                          className={`w-full flex items-center ${settings.sidebar.collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                          title={settings.sidebar.collapsed ? item.label : undefined}
                        >
                          <Icon className="h-4 w-4" />
                          {!settings.sidebar.collapsed && item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </ScrollArea>

          {/* Worker Profile */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setQuickSwitchOpen(true)}
              className={`w-full flex items-center ${settings.sidebar.collapsed ? 'justify-center' : 'gap-3'} hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors`}
            >
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                {activeWorker?.avatarUrl ? (
                  <img src={activeWorker.avatarUrl} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-white" />
                )}
              </div>
              {!settings.sidebar.collapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium dark:text-white truncate">
                    {activeWorker?.name || 'Guest Cashier'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">Tap to switch</p>
                </div>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Main Menu</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-gray-900 dark:text-white font-medium capitalize">{activeNav}</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            {!settings.sidebar.visible && (
              <Button variant="outline" size="sm" onClick={() => setQuickSwitchOpen(true)}>
                <User className="h-4 w-4 mr-1" />
                {activeWorker?.name?.split(' ')[0] || 'Switch'}
              </Button>
            )}
            {heldTransactions.length > 0 && (
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4 mr-1" />
                {heldTransactions.length} Held
              </Button>
            )}
          </div>
        </header>

        {/* Content based on activeNav */}
        {activeNav === 'orders' ? (
          <>
            {/* Page Title */}
            <div className="px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <h1 className="text-2xl font-bold dark:text-white">Orders</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Experience a seamless purchasing experience with our intuitive cashier interface
              </p>
            </div>

        {/* Toolbar */}
        <div className="px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              List Product
            </div>
            <div className="flex items-center gap-3">
              {settings.quickActions.showBarcodeScanner && (
                <Button variant="outline" size="sm" className="gap-2">
                  <ScanBarcode className="h-4 w-4" />
                  Scan Barcode
                </Button>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-56"
                  autoFocus={settings.autoFocusSearch}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Category Filters - Conditional */}
        {settings.quickActions.showCategoryFilter && (
          <div className="px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <Button
                      key={cat.id}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`gap-2 ${isActive ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                    >
                      <Icon className="h-4 w-4" />
                      {cat.label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                {settings.quickActions.showViewToggle && (
                  <div className="flex border rounded-lg overflow-hidden">
                    <button
                      onClick={() => configStore.updateSettings({ productView: 'grid' })}
                      className={`p-2 ${settings.productView === 'grid' ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => configStore.updateSettings({ productView: 'list' })}
                      className={`p-2 ${settings.productView === 'list' ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {settings.quickActions.showSortOptions && (
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="price-asc">Price: Low</SelectItem>
                      <SelectItem value="price-desc">Price: High</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="stock">Stock</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Products Grid/List */}
        <ScrollArea className="flex-1 p-6">
          {isLoading ? (
            <div className={`grid gap-4 ${getGridClasses(settings.gridColumns)}`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductSkeleton key={i} cardSize={settings.productCard.cardSize} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Package className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No products found</p>
              <p className="text-sm">Try adjusting your search or category filter</p>
            </div>
          ) : settings.productView === 'grid' ? (
            <div className={`grid gap-4 ${getGridClasses(settings.gridColumns)}`}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  config={settings.productCard}
                  onAddToCart={handleAddToCart}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <ProductListItem
                  key={product.id}
                  product={product}
                  config={settings.productCard}
                  onAddToCart={handleAddToCart}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
          )}
        </ScrollArea>
          </>
        ) : activeNav === 'inventory' ? (
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold dark:text-white">Inventory</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Check stock levels and manage inventory</p>
            </div>
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <Package className="h-12 w-12 text-blue-500" />
                <div>
                  <h3 className="font-semibold">Stock Overview</h3>
                  <p className="text-sm text-gray-500">Real-time inventory tracking</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">In Stock</p>
                  <p className="text-2xl font-bold text-green-600">248</p>
                </div>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Low Stock</p>
                  <p className="text-2xl font-bold text-yellow-600">12</p>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-600">3</p>
                </div>
              </div>
            </Card>
          </div>
        ) : activeNav === 'customers' ? (
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold dark:text-white">Customers</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage customer profiles and loyalty</p>
            </div>
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <Users className="h-12 w-12 text-purple-500" />
                <div>
                  <h3 className="font-semibold">Customer Database</h3>
                  <p className="text-sm text-gray-500">Track purchases and preferences</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Total Customers</p>
                  <p className="text-2xl font-bold text-purple-600">1,284</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Loyalty Members</p>
                  <p className="text-2xl font-bold text-blue-600">892</p>
                </div>
              </div>
            </Card>
          </div>
        ) : activeNav === 'reports' ? (
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold dark:text-white">Reports</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Sales analytics and insights</p>
            </div>
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <BarChart3 className="h-12 w-12 text-green-500" />
                <div>
                  <h3 className="font-semibold">Sales Dashboard</h3>
                  <p className="text-sm text-gray-500">Today's performance metrics</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Today's Sales</p>
                  <p className="text-2xl font-bold text-green-600">{formatPrice(45680)}</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Transactions</p>
                  <p className="text-2xl font-bold text-blue-600">67</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Avg. Order</p>
                  <p className="text-2xl font-bold text-purple-600">{formatPrice(682)}</p>
                </div>
              </div>
            </Card>
          </div>
        ) : activeNav === 'discounts' ? (
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold dark:text-white">Discounts & Promotions</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage coupons, gift cards, and offers</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                    <Tag className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="font-semibold">Coupon Codes</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">Create and manage discount coupons</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-orange-600">24</span>
                  <span className="text-xs text-gray-400">Active coupons</span>
                </div>
              </Card>
              <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-pink-100 dark:bg-pink-900/20 rounded-lg">
                    <Gift className="h-6 w-6 text-pink-600" />
                  </div>
                  <h3 className="font-semibold">Gift Cards</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">Issue and redeem gift cards</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-pink-600">{formatPrice(12500)}</span>
                  <span className="text-xs text-gray-400">Outstanding balance</span>
                </div>
              </Card>
              <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                    <Wallet className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold">Store Credit</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">Manage customer store credits</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-blue-600">{formatPrice(8450)}</span>
                  <span className="text-xs text-gray-400">Total issued</span>
                </div>
              </Card>
              <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <Sparkles className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold">Promotions</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">BOGO, bundle deals, flash sales</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-green-600">8</span>
                  <span className="text-xs text-gray-400">Active promos</span>
                </div>
              </Card>
            </div>
          </div>
        ) : activeNav === 'suppliers' ? (
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold dark:text-white">Suppliers</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage vendor relationships</p>
            </div>
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <Truck className="h-12 w-12 text-indigo-500" />
                <div>
                  <h3 className="font-semibold">Supplier Management</h3>
                  <p className="text-sm text-gray-500">Track orders and deliveries</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Active Suppliers</p>
                  <p className="text-2xl font-bold text-indigo-600">18</p>
                </div>
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-sm text-gray-500">Pending Orders</p>
                  <p className="text-2xl font-bold text-orange-600">5</p>
                </div>
              </div>
            </Card>
          </div>
        ) : activeNav === 'settings' ? (
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold dark:text-white">Store Settings</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configure your store preferences</p>
            </div>
            <Card className="p-6">
              <Button onClick={() => setSettingsOpen(true)} className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Open POS Settings
              </Button>
            </Card>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Select a menu item from the sidebar</p>
            </div>
          </div>
        )}
      </main>

      {/* Right Panel - Cart */}
      <aside className={`${settings.cartPanel.position === 'right' ? 'w-80' : 'w-full h-80'} bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col`}>
        {/* Cart Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold dark:text-white">Order Product</h2>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Customer Selection - Conditional */}
        {settings.cartPanel.showCustomerSearch && selectedCustomer && (
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">{selectedCustomer.firstName} {selectedCustomer.lastName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Cart Items Count */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {cart?.items.length || 0} Items Selected
          </span>
          {cart?.items.length ? (
            <button onClick={handleClearCart} className="text-sm text-red-500 hover:text-red-600 font-medium">
              Clear All
            </button>
          ) : null}
        </div>

        {/* Cart Items */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {!cart?.items.length ? (
              <div className="text-center py-12 text-gray-400">
                <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Your cart is empty</p>
                <p className="text-xs mt-1">Add products to get started</p>
              </div>
            ) : (
              cart.items.map((item) => (
                <CartItemCard
                  key={item.id}
                  item={item}
                  config={settings.cartPanel}
                  onQuantityChange={handleQuantityChange}
                  onRemove={removeFromCart}
                  formatPrice={formatPrice}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Order Summary */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Sub Total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Discount</span>
              <span>{formatPrice(discount)}</span>
            </div>
            {settings.cartPanel.showTaxBreakdown && (
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Sales Tax (18%)</span>
                <span>{formatPrice(salesTax)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
              <span>Total Amount</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          {/* Discount Code - Conditional */}
          {settings.cartPanel.showDiscountCode && (
            <div className="flex gap-2">
              <Input
                placeholder="Discount Code"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm">Apply</Button>
            </div>
          )}

          {/* Payment Method */}
          <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
            <SelectTrigger className="w-full">
              <div className="flex items-center gap-2">
                {paymentMethod === 'card' && <CreditCard className="h-4 w-4" />}
                {paymentMethod === 'cash' && <Banknote className="h-4 w-4" />}
                {paymentMethod === 'upi' && <Smartphone className="h-4 w-4" />}
                {paymentMethod === 'wallet' && <Wallet className="h-4 w-4" />}
                {paymentMethod === 'credit' && <Users className="h-4 w-4" />}
                {paymentMethod === 'giftcard' && <Gift className="h-4 w-4" />}
                <span>
                  {paymentMethod === 'card' && 'Credit or Debit Card'}
                  {paymentMethod === 'cash' && 'Cash'}
                  {paymentMethod === 'upi' && 'UPI Payment'}
                  {paymentMethod === 'wallet' && 'Digital Wallet'}
                  {paymentMethod === 'credit' && 'Store Credit'}
                  {paymentMethod === 'giftcard' && 'Gift Card'}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {settings.payment.enableCash && (
                <SelectItem value="cash">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    Cash
                  </div>
                </SelectItem>
              )}
              {settings.payment.enableCard && (
                <SelectItem value="card">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Credit or Debit Card
                  </div>
                </SelectItem>
              )}
              {settings.payment.enableUPI && (
                <SelectItem value="upi">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    UPI Payment
                  </div>
                </SelectItem>
              )}
              {settings.payment.enableWallet && (
                <SelectItem value="wallet">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Digital Wallet
                  </div>
                </SelectItem>
              )}
              {settings.payment.enableCredit && (
                <SelectItem value="credit">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Store Credit
                  </div>
                </SelectItem>
              )}
              <SelectItem value="giftcard">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Gift Card
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Pay Button */}
          <Button 
            className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700"
            disabled={!cart?.items.length || checkoutMutation.isPending}
            onClick={() => cart?.items.length && setPaymentModalOpen(true)}
          >
            {checkoutMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Wallet className="h-5 w-5 mr-2" />
            )}
            Pay {cart?.items.length ? formatPrice(total) : ''}
          </Button>

          {/* Quick Actions */}
          {settings.cartPanel.showHoldButton && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => holdCurrentCart()}
                disabled={!cart?.items.length}
              >
                <Pause className="h-4 w-4 mr-1" />
                Hold
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <Receipt className="h-4 w-4 mr-1" />
                Receipt
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Open Session Dialog */}
      <Dialog open={showOpenSession} onOpenChange={setShowOpenSession}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Open Register</DialogTitle>
            <DialogDescription>
              Enter the opening cash balance to start your shift
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Opening Balance</Label>
              <Input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogButtons
            onCancel={() => setShowOpenSession(false)}
            onConfirm={() => openSessionMutation.mutate()}
            confirmText={openSessionMutation.isPending ? 'Opening...' : 'Open Register'}
            confirmLoading={openSessionMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Confirmation Dialog */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Complete the transaction for {formatPrice(total)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Items</span>
                <span>{cart?.items.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>{formatPrice(salesTax)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              {paymentMethod === 'card' && <CreditCard className="h-5 w-5 text-blue-600" />}
              {paymentMethod === 'cash' && <Banknote className="h-5 w-5 text-blue-600" />}
              {paymentMethod === 'upi' && <Smartphone className="h-5 w-5 text-blue-600" />}
              {paymentMethod === 'wallet' && <Wallet className="h-5 w-5 text-blue-600" />}
              {paymentMethod === 'credit' && <Users className="h-5 w-5 text-blue-600" />}
              {paymentMethod === 'giftcard' && <Gift className="h-5 w-5 text-blue-600" />}
              <span className="text-sm font-medium capitalize">
                {paymentMethod === 'giftcard' ? 'Gift Card' : paymentMethod} Payment
              </span>
            </div>
          </div>
          <DialogButtons
            onCancel={() => setPaymentModalOpen(false)}
            onConfirm={() => checkoutMutation.mutate()}
            confirmText={checkoutMutation.isPending ? 'Processing...' : 'Complete Payment'}
            confirmLoading={checkoutMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Quick Switch Dialog */}
      <QuickSwitchDialog />

      {/* Settings Dialog */}
      <SettingsDialog />
    </div>
  );
}

// Helper function for grid columns
function getGridClasses(columns: number): string {
  switch (columns) {
    case 2: return 'grid-cols-2';
    case 3: return 'grid-cols-2 lg:grid-cols-3';
    case 4: return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    case 5: return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
    default: return 'grid-cols-3';
  }
}

// Product Card Component
function ProductCard({ 
  product, 
  config,
  onAddToCart,
  formatPrice 
}: { 
  product: ProductSearchResult;
  config: import('../store/posConfigStore').ProductCardConfig;
  onAddToCart: (product: ProductSearchResult, size?: string) => void;
  formatPrice: (amount: number) => string;
}) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const availableSizes = product.sizes || ['S', 'M', 'L', 'XL'];
  const availableColors = product.colors || ['black', 'gray'];
  const stockCount = product.stockQuantity ?? 0;
  const isLowStock = stockCount > 0 && stockCount <= 5;
  const isOutOfStock = stockCount === 0;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-shadow group ${
      config.cardSize === 'compact' ? 'p-3' : config.cardSize === 'large' ? 'p-5' : 'p-4'
    } ${isOutOfStock ? 'opacity-60' : ''}`}>
      {/* Category Badge & Stock */}
      <div className="flex items-center justify-between mb-2">
        {config.showCategory && product.category && (
          <Badge variant="secondary" className="text-xs">{product.category}</Badge>
        )}
        {config.showStockCount && (
          <Badge 
            variant={isOutOfStock ? 'destructive' : isLowStock ? 'outline' : 'secondary'}
            className={`text-xs ${isLowStock ? 'border-orange-400 text-orange-600' : ''}`}
          >
            {isOutOfStock ? 'Out of Stock' : `${stockCount} left`}
          </Badge>
        )}
      </div>

      {/* Product Image */}
      {config.showImage && (
        <div className={`relative mb-3 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden ${
          config.cardSize === 'compact' ? 'aspect-square' : 'aspect-[4/3]'
        }`}>
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-12 w-12 text-gray-300" />
            </div>
          )}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-medium">Out of Stock</span>
            </div>
          )}
        </div>
      )}

      {/* Product Info */}
      <h3 className={`font-medium dark:text-white truncate mb-1 ${
        config.cardSize === 'compact' ? 'text-xs' : 'text-sm'
      }`}>{product.name}</h3>
      
      {config.showSku && (
        <p className="text-xs text-gray-400 mb-1">SKU: {product.sku}</p>
      )}
      
      {/* Size Options */}
      {config.showSizeSelector && (
        <div className="mb-2">
          <p className="text-xs text-gray-400 mb-1">Size</p>
          <div className="flex gap-1 flex-wrap">
            {availableSizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  selectedSize === size
                    ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color Options */}
      {config.showColorSelector && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Color</p>
          <div className="flex gap-1.5">
            {availableColors.map((color) => (
              <div
                key={color}
                className="h-4 w-4 rounded-full border border-gray-200 cursor-pointer hover:ring-2 ring-blue-400 ring-offset-1"
                style={{ backgroundColor: colorSwatches[color] || color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Price & Add to Cart */}
      <div className="flex items-center justify-between mt-auto">
        <div>
          <p className={`font-semibold dark:text-white ${config.cardSize === 'compact' ? 'text-sm' : ''}`}>
            {formatPrice(product.price)}
          </p>
          {config.showOriginalPrice && product.originalPrice && product.originalPrice > product.price && (
            <p className="text-xs text-gray-400 line-through">{formatPrice(product.originalPrice)}</p>
          )}
        </div>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={() => onAddToCart(product, selectedSize || undefined)}
          disabled={isOutOfStock}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Product List Item Component
function ProductListItem({ 
  product, 
  config,
  onAddToCart,
  formatPrice 
}: { 
  product: ProductSearchResult;
  config: import('../store/posConfigStore').ProductCardConfig;
  onAddToCart: (product: ProductSearchResult, size?: string) => void;
  formatPrice: (amount: number) => string;
}) {
  const stockCount = product.stockQuantity ?? 0;
  const isLowStock = stockCount > 0 && stockCount <= 5;
  const isOutOfStock = stockCount === 0;

  return (
    <div className={`flex items-center gap-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700 ${
      isOutOfStock ? 'opacity-60' : ''
    }`}>
      {config.showImage && (
        <div className="h-16 w-16 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-6 w-6 text-gray-300" />
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium dark:text-white truncate">{product.name}</h3>
          {config.showCategory && product.category && (
            <Badge variant="secondary" className="text-xs">{product.category}</Badge>
          )}
        </div>
        {config.showSku && <p className="text-xs text-gray-400">SKU: {product.sku}</p>}
      </div>
      {config.showStockCount && (
        <Badge 
          variant={isOutOfStock ? 'destructive' : isLowStock ? 'outline' : 'secondary'}
          className={isLowStock ? 'border-orange-400 text-orange-600' : ''}
        >
          {isOutOfStock ? 'Out' : `${stockCount}`}
        </Badge>
      )}
      <p className="font-semibold dark:text-white">{formatPrice(product.price)}</p>
      <Button size="sm" onClick={() => onAddToCart(product)} disabled={isOutOfStock}>
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </div>
  );
}

// Cart Item Card Component
function CartItemCard({
  item,
  config,
  onQuantityChange,
  onRemove,
  formatPrice,
}: {
  item: CartItem;
  config: import('../store/posConfigStore').CartPanelConfig;
  onQuantityChange: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  formatPrice: (amount: number) => string;
}) {
  return (
    <div className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      {config.showItemImage && (
        <div className="h-14 w-14 bg-gray-200 dark:bg-gray-600 rounded-lg flex-shrink-0 overflow-hidden">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-6 w-6 text-gray-400" />
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm dark:text-white truncate">{item.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{item.notes || 'Size: M'}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => onQuantityChange(item.id, -1)}
            className="h-6 w-6 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
          <button
            onClick={() => onQuantityChange(item.id, 1)}
            className="h-6 w-6 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-sm dark:text-white">{formatPrice(item.unitPrice * item.quantity)}</p>
        <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500 mt-1">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Product Skeleton
function ProductSkeleton({ cardSize }: { cardSize: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl ${cardSize === 'compact' ? 'p-3' : 'p-4'}`}>
      <Skeleton className="h-40 w-full rounded-lg mb-3" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-3" />
      <Skeleton className="h-6 w-20" />
    </div>
  );
}

// Quick Switch Dialog Component
function QuickSwitchDialog() {
  const { isQuickSwitchOpen, setQuickSwitchOpen, loginWithCode, quickSwitchError, workers, registerWorker } = usePOSConfigStore();
  const [code, setCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [newWorker, setNewWorker] = useState({ name: '', code: '', role: 'cashier' as const });

  const handleSubmit = () => {
    if (code.length >= 4) {
      loginWithCode(code);
      setCode('');
    }
  };

  const handleRegister = () => {
    if (newWorker.name && newWorker.code.length >= 4) {
      registerWorker(newWorker);
      setNewWorker({ name: '', code: '', role: 'cashier' });
      setIsRegistering(false);
    }
  };

  return (
    <Dialog open={isQuickSwitchOpen} onOpenChange={setQuickSwitchOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {isRegistering ? 'Register New Worker' : 'Quick Switch'}
          </DialogTitle>
          <DialogDescription>
            {isRegistering 
              ? 'Create a new worker profile with a security code'
              : 'Enter your security code to switch workspace'}
          </DialogDescription>
        </DialogHeader>

        {!isRegistering ? (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Security Code</Label>
              <Input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter 4-6 digit code"
                maxLength={6}
                className="text-center text-2xl tracking-widest"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoFocus
              />
              {quickSwitchError && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {quickSwitchError}
                </p>
              )}
            </div>

            {workers.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Or select a profile:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {workers.map((worker) => (
                      <button
                        key={worker.id}
                        onClick={() => {
                          setCode(worker.code);
                          setTimeout(handleSubmit, 100);
                        }}
                        className="flex items-center gap-2 p-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                          <User className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-sm font-medium truncate">{worker.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setQuickSwitchOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={code.length < 4}>
                <Unlock className="h-4 w-4 mr-1" />
                Switch
              </Button>
            </div>

            <button
              onClick={() => setIsRegistering(true)}
              className="w-full text-sm text-blue-600 hover:underline"
            >
              Register new worker
            </button>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newWorker.name}
                onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="space-y-2">
              <Label>Security Code (4-6 digits)</Label>
              <Input
                type="password"
                value={newWorker.code}
                onChange={(e) => setNewWorker({ ...newWorker, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="Create a code"
                maxLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newWorker.role} onValueChange={(v) => setNewWorker({ ...newWorker, role: v as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsRegistering(false)}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleRegister} disabled={!newWorker.name || newWorker.code.length < 4}>
                <Check className="h-4 w-4 mr-1" />
                Register
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Settings Dialog Component
function SettingsDialog() {
  const { 
    isSettingsOpen, setSettingsOpen, settingsTab, setSettingsTab,
    settings, applyPreset, updateProductCardConfig, updateCartPanelConfig,
    updateSidebarConfig, updatePaymentConfig, updateQuickActionsConfig, updateSettings
  } = usePOSConfigStore();

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            POS Settings
          </DialogTitle>
          <DialogDescription>
            Customize your point of sale interface
          </DialogDescription>
        </DialogHeader>

        <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as any)} className="mt-4">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="presets">Presets</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="cart">Cart</TabsTrigger>
            <TabsTrigger value="sidebar">Sidebar</TabsTrigger>
            <TabsTrigger value="payment">Payment</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4 pr-4">
            {/* Presets Tab */}
            <TabsContent value="presets" className="space-y-4">
              <p className="text-sm text-gray-500">Choose a preset to quickly configure your POS interface</p>
              <div className="grid grid-cols-3 gap-4">
                {(['minimal', 'standard', 'full'] as LayoutPreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className={`p-4 rounded-lg border-2 transition-colors text-left ${
                      settings.preset === preset
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {preset === 'minimal' && <Zap className="h-5 w-5 text-yellow-500" />}
                      {preset === 'standard' && <LayoutGrid className="h-5 w-5 text-blue-500" />}
                      {preset === 'full' && <Sparkles className="h-5 w-5 text-purple-500" />}
                      <span className="font-medium capitalize">{preset}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {preset === 'minimal' && 'Fast, focused interface for quick transactions'}
                      {preset === 'standard' && 'Balanced features for everyday use'}
                      {preset === 'full' && 'All features enabled for power users'}
                    </p>
                  </button>
                ))}
              </div>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Product Card Display</h3>
                <div className="grid grid-cols-2 gap-4">
                  <SettingToggle
                    label="Show Images"
                    checked={settings.productCard.showImage}
                    onChange={(v) => updateProductCardConfig({ showImage: v })}
                  />
                  <SettingToggle
                    label="Show SKU"
                    checked={settings.productCard.showSku}
                    onChange={(v) => updateProductCardConfig({ showSku: v })}
                  />
                  <SettingToggle
                    label="Show Category"
                    checked={settings.productCard.showCategory}
                    onChange={(v) => updateProductCardConfig({ showCategory: v })}
                  />
                  <SettingToggle
                    label="Show Stock Count"
                    checked={settings.productCard.showStockCount}
                    onChange={(v) => updateProductCardConfig({ showStockCount: v })}
                  />
                  <SettingToggle
                    label="Show Size Selector"
                    checked={settings.productCard.showSizeSelector}
                    onChange={(v) => updateProductCardConfig({ showSizeSelector: v })}
                  />
                  <SettingToggle
                    label="Show Color Selector"
                    checked={settings.productCard.showColorSelector}
                    onChange={(v) => updateProductCardConfig({ showColorSelector: v })}
                  />
                  <SettingToggle
                    label="Show Original Price"
                    checked={settings.productCard.showOriginalPrice}
                    onChange={(v) => updateProductCardConfig({ showOriginalPrice: v })}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Card Size</Label>
                  <Select 
                    value={settings.productCard.cardSize} 
                    onValueChange={(v) => updateProductCardConfig({ cardSize: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Grid Columns</Label>
                  <Select 
                    value={String(settings.gridColumns)} 
                    onValueChange={(v) => updateSettings({ gridColumns: Number(v) as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                      <SelectItem value="4">4 Columns</SelectItem>
                      <SelectItem value="5">5 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Cart Tab */}
            <TabsContent value="cart" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Cart Panel Options</h3>
                <div className="grid grid-cols-2 gap-4">
                  <SettingToggle
                    label="Customer Search"
                    checked={settings.cartPanel.showCustomerSearch}
                    onChange={(v) => updateCartPanelConfig({ showCustomerSearch: v })}
                  />
                  <SettingToggle
                    label="Discount Code Field"
                    checked={settings.cartPanel.showDiscountCode}
                    onChange={(v) => updateCartPanelConfig({ showDiscountCode: v })}
                  />
                  <SettingToggle
                    label="Item Notes"
                    checked={settings.cartPanel.showItemNotes}
                    onChange={(v) => updateCartPanelConfig({ showItemNotes: v })}
                  />
                  <SettingToggle
                    label="Item Images"
                    checked={settings.cartPanel.showItemImage}
                    onChange={(v) => updateCartPanelConfig({ showItemImage: v })}
                  />
                  <SettingToggle
                    label="Tax Breakdown"
                    checked={settings.cartPanel.showTaxBreakdown}
                    onChange={(v) => updateCartPanelConfig({ showTaxBreakdown: v })}
                  />
                  <SettingToggle
                    label="Hold Button"
                    checked={settings.cartPanel.showHoldButton}
                    onChange={(v) => updateCartPanelConfig({ showHoldButton: v })}
                  />
                  <SettingToggle
                    label="Receipt Preview"
                    checked={settings.cartPanel.showReceiptPreview}
                    onChange={(v) => updateCartPanelConfig({ showReceiptPreview: v })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Sidebar Tab */}
            <TabsContent value="sidebar" className="space-y-4">
              <div className="space-y-4">
                <SettingToggle
                  label="Show Sidebar"
                  checked={settings.sidebar.visible}
                  onChange={(v) => updateSidebarConfig({ visible: v })}
                />
                {settings.sidebar.visible && (
                  <>
                    <SettingToggle
                      label="Collapsed by Default"
                      checked={settings.sidebar.collapsed}
                      onChange={(v) => updateSidebarConfig({ collapsed: v })}
                    />
                    <Separator />
                    <h3 className="font-medium text-gray-900 dark:text-white">Menu Items</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {allSidebarItems.map((item) => (
                        <SettingToggle
                          key={item.id}
                          label={item.label}
                          checked={settings.sidebar.items[item.id as keyof typeof settings.sidebar.items]}
                          onChange={(v) => updateSidebarConfig({ 
                            items: { ...settings.sidebar.items, [item.id]: v } 
                          })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Payment Tab */}
            <TabsContent value="payment" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Payment Methods</h3>
                <div className="grid grid-cols-2 gap-4">
                  <SettingToggle
                    label="Cash"
                    checked={settings.payment.enableCash}
                    onChange={(v) => updatePaymentConfig({ enableCash: v })}
                  />
                  <SettingToggle
                    label="Card"
                    checked={settings.payment.enableCard}
                    onChange={(v) => updatePaymentConfig({ enableCard: v })}
                  />
                  <SettingToggle
                    label="UPI"
                    checked={settings.payment.enableUPI}
                    onChange={(v) => updatePaymentConfig({ enableUPI: v })}
                  />
                  <SettingToggle
                    label="Wallet"
                    checked={settings.payment.enableWallet}
                    onChange={(v) => updatePaymentConfig({ enableWallet: v })}
                  />
                  <SettingToggle
                    label="Store Credit"
                    checked={settings.payment.enableCredit}
                    onChange={(v) => updatePaymentConfig({ enableCredit: v })}
                  />
                  <SettingToggle
                    label="Split Payment"
                    checked={settings.payment.enableSplitPayment}
                    onChange={(v) => updatePaymentConfig({ enableSplitPayment: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Default Payment Method</Label>
                  <Select 
                    value={settings.payment.defaultMethod} 
                    onValueChange={(v) => updatePaymentConfig({ defaultMethod: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <SettingToggle
                    label="Barcode Scanner"
                    checked={settings.quickActions.showBarcodeScanner}
                    onChange={(v) => updateQuickActionsConfig({ showBarcodeScanner: v })}
                  />
                  <SettingToggle
                    label="Category Filter"
                    checked={settings.quickActions.showCategoryFilter}
                    onChange={(v) => updateQuickActionsConfig({ showCategoryFilter: v })}
                  />
                  <SettingToggle
                    label="Sort Options"
                    checked={settings.quickActions.showSortOptions}
                    onChange={(v) => updateQuickActionsConfig({ showSortOptions: v })}
                  />
                  <SettingToggle
                    label="View Toggle"
                    checked={settings.quickActions.showViewToggle}
                    onChange={(v) => updateQuickActionsConfig({ showViewToggle: v })}
                  />
                </div>

                <Separator />

                <h3 className="font-medium text-gray-900 dark:text-white">Behavior</h3>
                <div className="grid grid-cols-2 gap-4">
                  <SettingToggle
                    label="Sound Effects"
                    checked={settings.soundEffects}
                    onChange={(v) => updateSettings({ soundEffects: v })}
                    icon={settings.soundEffects ? Volume2 : VolumeX}
                  />
                  <SettingToggle
                    label="Auto-focus Search"
                    checked={settings.autoFocusSearch}
                    onChange={(v) => updateSettings({ autoFocusSearch: v })}
                  />
                  <SettingToggle
                    label="Confirm Before Clear"
                    checked={settings.confirmBeforeClear}
                    onChange={(v) => updateSettings({ confirmBeforeClear: v })}
                  />
                  <SettingToggle
                    label="Keyboard Shortcuts"
                    checked={settings.showKeyboardShortcuts}
                    onChange={(v) => updateSettings({ showKeyboardShortcuts: v })}
                    icon={Keyboard}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Font Size</Label>
                  <Select 
                    value={settings.fontSize} 
                    onValueChange={(v) => updateSettings({ fontSize: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end mt-4">
          <Button onClick={() => setSettingsOpen(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Setting Toggle Component
function SettingToggle({ 
  label, 
  checked, 
  onChange, 
  icon: Icon 
}: { 
  label: string; 
  checked: boolean; 
  onChange: (value: boolean) => void;
  icon?: any;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
        <span className="text-sm text-gray-900 dark:text-gray-100">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// Mock products for demo
function getMockProducts(): ProductSearchResult[] {
  return [
    { id: '1', name: 'Denim Fabric Jacket', sku: 'DFJ-001', price: 4595, originalPrice: 5500, category: 'Men', imageUrl: '', stockQuantity: 12, sizes: ['S', 'M', 'L', 'XL'], colors: ['navy', 'black'] },
    { id: '2', name: 'Basic Cropped T-Shirt', sku: 'BCT-002', price: 1790, category: 'Women', imageUrl: '', stockQuantity: 25, sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['white', 'black', 'gray', 'beige'] },
    { id: '3', name: 'STWD Raincoat with Hood', sku: 'SRH-003', price: 4990, category: 'Men', imageUrl: '', stockQuantity: 8, sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['olive', 'navy'] },
    { id: '4', name: 'Short Dress Asymmetric', sku: 'SDA-004', price: 2990, category: 'Women', imageUrl: '', stockQuantity: 3, sizes: ['S', 'M', 'L', 'XL'], colors: ['black', 'brown', 'red'] },
    { id: '5', name: 'Flowing Pinstripe Pants', sku: 'FPP-005', price: 4980, category: 'Women', imageUrl: '', stockQuantity: 15, sizes: ['US 0', 'US 2', 'US 4', 'US 6', 'US 8'], colors: ['cream', 'gray'] },
    { id: '6', name: 'Half-Moon Crossbody Bag', sku: 'HMB-006', price: 2850, category: 'Accessories', imageUrl: '', stockQuantity: 0, colors: ['black', 'brown'] },
    { id: '7', name: 'Necklace Lightning Bolt', sku: 'NLB-007', price: 890, category: 'Accessories', imageUrl: '', stockQuantity: 42, colors: ['gold', 'silver'] },
    { id: '8', name: 'Rubberized Fanny Pack', sku: 'RFP-008', price: 2780, category: 'Accessories', imageUrl: '', stockQuantity: 7, sizes: ['M'], colors: ['black', 'navy'] },
  ];
}
