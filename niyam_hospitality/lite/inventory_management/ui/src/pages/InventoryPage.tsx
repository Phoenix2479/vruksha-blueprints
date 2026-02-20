import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label, StatsCard, StatusBadge, DialogButtons } from "../components";
import { Package, Truck, Users, AlertTriangle, Search, Plus, RefreshCw, Loader2, DollarSign, TrendingDown, FileText, CheckCircle, Send, ArrowUpDown } from "lucide-react";
import { getItems, getStats, getCategories, getVendors, getPurchaseOrders, createItem, createVendor, adjustStock, approvePurchaseOrder, sendPurchaseOrder, getLowStockItems, type InventoryItem, type Vendor, type PurchaseOrder, type InventoryStats, type Category } from "../api";

// Status colors
const poStatusColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  draft: 'default',
  approved: 'info',
  sent: 'warning',
  partial: 'warning',
  received: 'success',
  cancelled: 'error',
};

// Tabs component
function InventoryTabs({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const tabs = [
    { id: 'items', label: 'Items', icon: Package },
    { id: 'orders', label: 'Purchase Orders', icon: FileText },
    { id: 'vendors', label: 'Vendors', icon: Users },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  ];
  
  return (
    <div className="flex gap-2 mb-4 border-b pb-2">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            tab === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Stats Overview
function StatsOverview({ stats }: { stats?: InventoryStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <StatsCard title="Total Items" value={stats?.total_items || 0} icon={Package} />
      <StatsCard title="Inventory Value" value={`₹${(stats?.inventory_value || 0).toLocaleString()}`} icon={DollarSign} />
      <StatsCard title="Low Stock" value={stats?.low_stock_items || 0} icon={TrendingDown} variant={stats?.low_stock_items ? 'warning' : 'default'} />
      <StatsCard title="Pending POs" value={stats?.pending_po_count || 0} icon={FileText} />
      <StatsCard title="PO Value" value={`₹${(stats?.pending_po_value || 0).toLocaleString()}`} icon={Truck} />
    </div>
  );
}

// Items Tab
function ItemsTab({ categories }: { categories: Category[] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAdjustDialog, setShowAdjustDialog] = useState<InventoryItem | null>(null);
  const [newItem, setNewItem] = useState({ name: '', sku: '', unit: 'each', unit_cost: 0, par_level: 0, reorder_point: 0, category_id: '' });
  const [adjustment, setAdjustment] = useState({ type: 'add' as 'add' | 'remove' | 'set', quantity: 0, reason: '' });

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ['items', search, categoryFilter, showLowStock],
    queryFn: () => getItems({ search: search || undefined, category_id: categoryFilter || undefined, low_stock: showLowStock }),
  });

  const createMutation = useMutation({
    mutationFn: () => createItem(newItem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowAddDialog(false);
      setNewItem({ name: '', sku: '', unit: 'each', unit_cost: 0, par_level: 0, reorder_point: 0, category_id: '' });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: () => adjustStock(showAdjustDialog!.id, adjustment.type, adjustment.quantity, adjustment.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowAdjustDialog(null);
      setAdjustment({ type: 'add', quantity: 0, reason: '' });
    },
  });

  return (
    <>
      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-background"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button variant={showLowStock ? 'default' : 'outline'} onClick={() => setShowLowStock(!showLowStock)}>
          <TrendingDown className="h-4 w-4 mr-2" />
          Low Stock
        </Button>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Items Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Par Level</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No items found</TableCell></TableRow>
            ) : items.map(item => (
              <TableRow key={item.id} className={item.current_stock <= item.reorder_point ? 'bg-red-50' : ''}>
                <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.category_name || '-'}</TableCell>
                <TableCell className="text-right font-medium">{item.current_stock} {item.unit}</TableCell>
                <TableCell className="text-right">{item.par_level}</TableCell>
                <TableCell className="text-right">₹{item.unit_cost.toFixed(2)}</TableCell>
                <TableCell className="text-right">₹{(item.current_stock * item.unit_cost).toFixed(2)}</TableCell>
                <TableCell>
                  {item.current_stock <= item.reorder_point ? (
                    <StatusBadge status="Low Stock" variant="error" />
                  ) : item.current_stock <= item.par_level ? (
                    <StatusBadge status="Below Par" variant="warning" />
                  ) : (
                    <StatusBadge status="OK" variant="success" />
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setShowAdjustDialog(item)}>
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add Item Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={newItem.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem({...newItem, name: e.target.value})} placeholder="Item name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>SKU</Label>
                <Input value={newItem.sku} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem({...newItem, sku: e.target.value})} placeholder="Auto-generated if blank" />
              </div>
              <div>
                <Label>Unit</Label>
                <select value={newItem.unit} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewItem({...newItem, unit: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                  <option value="each">Each</option>
                  <option value="kg">Kilogram</option>
                  <option value="liter">Liter</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <select value={newItem.category_id} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewItem({...newItem, category_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Unit Cost</Label>
                <Input type="number" value={newItem.unit_cost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem({...newItem, unit_cost: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <Label>Par Level</Label>
                <Input type="number" value={newItem.par_level} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem({...newItem, par_level: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <Label>Reorder Point</Label>
                <Input type="number" value={newItem.reorder_point} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem({...newItem, reorder_point: parseFloat(e.target.value) || 0})} />
              </div>
            </div>
          </div>
          <DialogButtons>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newItem.name || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Item
            </Button>
          </DialogButtons>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={!!showAdjustDialog} onOpenChange={() => setShowAdjustDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock: {showAdjustDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current Stock: <span className="font-medium text-foreground">{showAdjustDialog?.current_stock} {showAdjustDialog?.unit}</span>
            </div>
            <div>
              <Label>Adjustment Type</Label>
              <select value={adjustment.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAdjustment({...adjustment, type: e.target.value as 'add' | 'remove' | 'set'})} className="w-full px-3 py-2 border rounded-lg">
                <option value="add">Add Stock</option>
                <option value="remove">Remove Stock</option>
                <option value="set">Set to Quantity</option>
              </select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={adjustment.quantity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustment({...adjustment, quantity: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={adjustment.reason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustment({...adjustment, reason: e.target.value})} placeholder="Reason for adjustment" />
            </div>
          </div>
          <DialogButtons>
            <Button variant="outline" onClick={() => setShowAdjustDialog(null)}>Cancel</Button>
            <Button onClick={() => adjustMutation.mutate()} disabled={!adjustment.quantity || adjustMutation.isPending}>
              {adjustMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply Adjustment
            </Button>
          </DialogButtons>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Purchase Orders Tab
function PurchaseOrdersTab({ vendors: _vendors }: { vendors: Vendor[] }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: () => getPurchaseOrders({ status: statusFilter || undefined }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvePurchaseOrder(id, 'System'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendPurchaseOrder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  return (
    <>
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-background"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="partial">Partial</option>
          <option value="received">Received</option>
        </select>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No purchase orders found</TableCell></TableRow>
            ) : orders.map((po: PurchaseOrder) => (
              <TableRow key={po.id}>
                <TableCell className="font-mono font-medium">{po.po_number}</TableCell>
                <TableCell>{po.vendor_name}</TableCell>
                <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                <TableCell>{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</TableCell>
                <TableCell className="text-right font-medium">₹{po.total.toLocaleString()}</TableCell>
                <TableCell>
                  <StatusBadge status={po.status} variant={poStatusColors[po.status]} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {po.status === 'draft' && (
                      <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(po.id)} disabled={approveMutation.isPending}>
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {po.status === 'approved' && (
                      <Button variant="ghost" size="sm" onClick={() => sendMutation.mutate(po.id)} disabled={sendMutation.isPending}>
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

// Vendors Tab
function VendorsTab() {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: '', contact_name: '', email: '', phone: '', payment_terms: 'Net 30' });

  const { data: vendors = [], isLoading, refetch } = useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
  });

  const createMutation = useMutation({
    mutationFn: () => createVendor(newVendor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setShowAddDialog(false);
      setNewVendor({ name: '', contact_name: '', email: '', phone: '', payment_terms: 'Net 30' });
    },
  });

  return (
    <>
      <div className="flex gap-3 mb-4">
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : vendors.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">No vendors found</div>
        ) : vendors.map((vendor: Vendor) => (
          <Card key={vendor.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{vendor.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                {vendor.contact_name && <p><span className="text-muted-foreground">Contact:</span> {vendor.contact_name}</p>}
                {vendor.email && <p><span className="text-muted-foreground">Email:</span> {vendor.email}</p>}
                {vendor.phone && <p><span className="text-muted-foreground">Phone:</span> {vendor.phone}</p>}
                {vendor.payment_terms && <p><span className="text-muted-foreground">Terms:</span> {vendor.payment_terms}</p>}
                <p><span className="text-muted-foreground">Lead Time:</span> {vendor.lead_time_days} days</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Vendor Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input value={newVendor.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVendor({...newVendor, name: e.target.value})} placeholder="Vendor name" />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={newVendor.contact_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVendor({...newVendor, contact_name: e.target.value})} placeholder="Contact name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={newVendor.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVendor({...newVendor, email: e.target.value})} placeholder="email@example.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={newVendor.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVendor({...newVendor, phone: e.target.value})} placeholder="+91 ..." />
              </div>
            </div>
            <div>
              <Label>Payment Terms</Label>
              <select value={newVendor.payment_terms} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewVendor({...newVendor, payment_terms: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                <option value="COD">Cash on Delivery</option>
                <option value="Net 7">Net 7</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
          </div>
          <DialogButtons>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newVendor.name || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Vendor
            </Button>
          </DialogButtons>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Alerts Tab
function AlertsTab() {
  const { data: lowStockItems = [], isLoading } = useQuery({
    queryKey: ['low-stock'],
    queryFn: getLowStockItems,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            Low Stock Alerts ({lowStockItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : lowStockItems.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No low stock items 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Reorder Point</TableHead>
                  <TableHead className="text-right">Reorder Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockItems.map((item: InventoryItem) => (
                  <TableRow key={item.id} className="bg-red-50">
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right text-red-600 font-medium">{item.current_stock} {item.unit}</TableCell>
                    <TableCell className="text-right">{item.reorder_point}</TableCell>
                    <TableCell className="text-right">{item.reorder_quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main Page
export default function InventoryPage() {
  const [tab, setTab] = useState('items');

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: getVendors });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            Inventory Management
          </h1>
          <p className="text-muted-foreground">Track stock, manage vendors, and create purchase orders</p>
        </div>

        {/* Stats */}
        <StatsOverview stats={stats} />

        {/* Tabs */}
        <InventoryTabs tab={tab} setTab={setTab} />

        {/* Tab Content */}
        {tab === 'items' && <ItemsTab categories={categories} />}
        {tab === 'orders' && <PurchaseOrdersTab vendors={vendors} />}
        {tab === 'vendors' && <VendorsTab />}
        {tab === 'alerts' && <AlertsTab />}
      </div>
    </div>
  );
}
