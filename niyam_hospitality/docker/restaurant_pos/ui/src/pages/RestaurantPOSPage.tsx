import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, ScrollArea, Separator } from "@shared/components/ui";
import { StatusBadge } from "@shared/components/blocks";
import { UtensilsCrossed, Plus, Minus, ShoppingCart, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { getMenu, getTables, createOrder, type MenuItem, type TableStatus, type OrderItem } from "../api";
import { spacing } from "@shared/styles/spacing";

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
}

export default function RestaurantPOSPage() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableStatus | null>(null);

  // Queries
  const { data: menu = [], isLoading: menuLoading, refetch: refetchMenu } = useQuery({
    queryKey: ["menu"],
    queryFn: getMenu,
  });

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ["tables"],
    queryFn: getTables,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: ({ tableId, items }: { tableId: string; items: OrderItem[] }) =>
      createOrder(tableId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setCart([]);
      setSelectedTable(null);
    },
  });

  // Get unique categories from menu
  const categories = ["all", ...new Set(menu.filter(m => m.category_name).map(m => m.category_name!))];
  
  // Filter menu by category
  const filteredMenu = selectedCategory === "all" 
    ? menu.filter(m => m.is_available)
    : menu.filter(m => m.category_name === selectedCategory && m.is_available);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id);
      if (existing) {
        return prev.map(c => 
          c.menuItem.id === item.id 
            ? { ...c, quantity: c.quantity + 1 } 
            : c
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => 
      prev
        .map(c => c.menuItem.id === itemId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c)
        .filter(c => c.quantity > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null);
  };

  const handlePlaceOrder = () => {
    if (!selectedTable || cart.length === 0) return;
    
    const items: OrderItem[] = cart.map(c => ({
      menu_item_id: c.menuItem.id,
      quantity: c.quantity,
      notes: c.notes,
    }));
    
    createOrderMutation.mutate({ tableId: selectedTable.id, items });
  };

  const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  
  const occupiedTables = tables.filter(t => t.status === "occupied").length;
  const availableTables = tables.filter(t => t.status === "available");

  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <UtensilsCrossed className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Restaurant POS</h1>
              <p className="text-sm text-muted-foreground">Order Management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="text-center px-3 py-1 bg-muted rounded-lg">
                <p className="text-lg font-bold">{occupiedTables}/{tables.length}</p>
                <p className="text-xs text-muted-foreground">Tables</p>
              </div>
              <div className="text-center px-3 py-1 bg-green-100 rounded-lg">
                <p className="text-lg font-bold text-green-600">{cart.length}</p>
                <p className="text-xs text-green-600/70">Items</p>
              </div>
              <div className="text-center px-3 py-1 bg-blue-100 rounded-lg">
                <p className="text-lg font-bold text-blue-600">${total.toFixed(2)}</p>
                <p className="text-xs text-blue-600/70">Total</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetchMenu()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto ${spacing.page}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Menu Section */}
          <div className="lg:col-span-2 space-y-4">
            {/* Table Selection */}
            {!selectedTable && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Select Table</CardTitle>
                </CardHeader>
                <CardContent>
                  {tablesLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : availableTables.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No available tables</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableTables.map(table => (
                        <Button
                          key={table.id}
                          variant="outline"
                          onClick={() => setSelectedTable(table)}
                          className="min-w-[80px]"
                        >
                          T{table.table_number}
                          <span className="text-xs text-muted-foreground ml-1">({table.capacity})</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedTable && (
              <div className="flex items-center justify-between mb-4 p-3 bg-muted rounded-lg">
                <div>
                  <span className="font-medium">Table {selectedTable.table_number}</span>
                  {selectedTable.zone && <span className="text-muted-foreground ml-2">({selectedTable.zone})</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTable(null)}>Change</Button>
              </div>
            )}

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {categories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  className="capitalize whitespace-nowrap"
                >
                  {cat}
                </Button>
              ))}
            </div>

            {/* Menu Items */}
            {menuLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No items available in this category
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredMenu.map(item => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer hover:border-primary transition-colors ${!selectedTable ? 'opacity-50' : ''}`}
                    onClick={() => selectedTable && addToCart(item)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <h3 className="font-medium truncate flex-1">{item.name}</h3>
                        {item.is_veg && (
                          <span className="w-4 h-4 border border-green-600 flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-green-600"></span>
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                      )}
                      <p className="text-lg font-bold mt-2">${item.price.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Cart Section */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Current Order
                </CardTitle>
                {selectedTable && (
                  <StatusBadge status="info" label={`Table ${selectedTable.table_number}`} size="sm" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>{selectedTable ? "Add items to order" : "Select a table first"}</p>
                </div>
              ) : (
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {cart.map(c => (
                      <div key={c.menuItem.id} className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{c.menuItem.name}</p>
                          <p className="text-sm text-muted-foreground">
                            ${c.menuItem.price.toFixed(2)} × {c.quantity} = ${(c.menuItem.price * c.quantity).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(c.menuItem.id, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-medium">{c.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(c.menuItem.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              
              {cart.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (8%)</span>
                      <span>${tax.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={clearCart}>
                      Clear
                    </Button>
                    <Button 
                      onClick={handlePlaceOrder}
                      disabled={createOrderMutation.isPending || !selectedTable}
                    >
                      {createOrderMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      Send to Kitchen
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
