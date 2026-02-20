import React from 'react';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { Button } from '@shared/components/index.ts';
import { useCartStore } from '../store/cartStore';
import { formatCurrency } from '@shared/utils/formatting.ts';
import { updateCartItem as updateCartItemAPI, removeCartItem as removeCartItemAPI, clearRemoteCart } from '../api/pos';

interface CartProps {
  onCheckout: () => void;
}

export const Cart: React.FC<CartProps> = ({ onCheckout }) => {
  const { items, subtotal, tax, discount, total, sessionId, setCart, clearCart } = useCartStore();

  const handleQuantityChange = async (id: string, quantity: number) => {
    if (!sessionId) return;
    try {
      const updatedItems = await updateCartItemAPI(sessionId, id, quantity);
      setCart(updatedItems, sessionId);
    } catch (error) {
      console.error('Failed to update cart item quantity', error);
      alert('Failed to update item quantity');
    }
  };

  const handleRemoveItem = async (id: string) => {
    if (!sessionId) return;
    try {
      const updatedItems = await removeCartItemAPI(sessionId, id);
      setCart(updatedItems, sessionId);
    } catch (error) {
      console.error('Failed to remove cart item', error);
      alert('Failed to remove item from cart');
    }
  };

  const handleClearCart = async () => {
    if (!sessionId) {
      clearCart();
      return;
    }
    try {
      await clearRemoteCart(sessionId);
      clearCart();
    } catch (error) {
      console.error('Failed to clear cart', error);
      alert('Failed to clear cart');
    }
  };

  if (items.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Shopping Cart
        </h3>
        <div className="text-center py-12 text-gray-500">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Cart is empty</p>
          <p className="text-sm mt-1">Search and add products to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Shopping Cart ({items.length} items)
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.confirm('Clear all items from cart?')) {
              handleClearCart();
            }
          }}
        >
          Clear
        </Button>
      </div>

      {/* Cart Items */}
      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-gray-900">{item.product_name}</p>
              <p className="text-sm text-gray-600">${item.unit_price.toFixed(2)} each</p>
              {item.discount_amount > 0 && (
                <p className="text-sm text-green-600">Discount: -${item.discount_amount.toFixed(2)}</p>
              )}
            </div>
            
            {/* Quantity Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleQuantityChange(item.id, Math.max(1, item.quantity - 1))}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-medium">{item.quantity}</span>
              <button
                onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Item Total */}
            <div className="text-right min-w-[80px]">
              <p className="font-semibold text-gray-900">
                ${item.total.toFixed(2)}
              </p>
              <button
                onClick={() => handleRemoveItem(item.id)}
                className="text-red-600 hover:text-red-700 mt-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-medium">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Tax:</span>
          <span className="font-medium">{formatCurrency(tax)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount:</span>
            <span className="font-medium">-{formatCurrency(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold border-t pt-2">
          <span>Total:</span>
          <span className="text-primary-500">{formatCurrency(total)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            const code = prompt('Enter discount code:');
            if (code) {
              // Validate and apply discount
              alert('Discount validation not yet implemented');
            }
          }}
        >
          Apply Discount
        </Button>
        <Button
          variant="primary"
          onClick={onCheckout}
          disabled={items.length === 0}
        >
          Checkout
        </Button>
      </div>
    </div>
  );
};
