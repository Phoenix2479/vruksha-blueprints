import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@shared/components/index.ts';
import { useDebounce } from '@shared/hooks';
import { searchProducts } from '../api/billing';

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
}

interface InvoiceFormProps {
  onSubmit: (data: {
    customer_id: string;
    due_date: string;
    items: InvoiceItem[];
    notes?: string;
  }) => void;
  loading?: boolean;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({ onSubmit, loading = false }) => {
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 10, total: 0 },
  ]);

  // Product search (adds a new line with selected product)
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; sku: string; price: number; tax_rate: number; in_stock: boolean }>>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounced = useDebounce(searchTerm, 300);

  useEffect(() => {
    const run = async () => {
      if (!debounced || debounced.length < 2) {
        setResults([]);
        setShowResults(false);
        return;
      }
      setLoadingSearch(true);
      try {
        const r = await searchProducts(debounced);
        setResults(r);
        setShowResults(true);
      } catch (e) {
        setResults([]);
      } finally {
        setLoadingSearch(false);
      }
    };
    run();
  }, [debounced]);

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0, tax_rate: 10, total: 0 }]);
  };

  const addProductAsItem = (p: { name: string; sku: string; price: number; tax_rate: number }) => {
    const newItem: InvoiceItem = {
      description: p.name,
      quantity: 1,
      unit_price: p.price,
      tax_rate: p.tax_rate ?? 0,
      total: p.price * 1,
    };
    setItems((prev) => [...prev, newItem]);
    setSearchTerm('');
    setResults([]);
    setShowResults(false);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Recalculate total
    const item = newItems[index];
    item.total = item.quantity * item.unit_price;
    
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTax = () => {
    return items.reduce((sum, item) => sum + (item.total * item.tax_rate / 100), 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      customer_id: customerId,
      due_date: dueDate,
      items: items.filter(item => item.description.trim() !== ''),
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Create New Invoice</h2>

      {/* Quick add from Product Catalog */}
      <div className="mb-6">
        <label className="label mb-2">Add Items from Products</label>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or SKU..."
            className="input"
          />
          {loadingSearch && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        {showResults && results.length > 0 && (
          <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProductAsItem(p)}
                className="w-full px-4 py-3 hover:bg-gray-50 border-b last:border-0 text-left transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-sm text-gray-600">SKU: {p.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">${'{'}p.price.toFixed(2){'}'}</p>
                    {!p.in_stock && (
                      <p className="text-xs text-red-600">Out of stock</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {showResults && results.length === 0 && !loadingSearch && (
          <div className="mt-2 p-3 text-center text-gray-500 border border-gray-200 rounded-lg">No products found</div>
        )}
      </div>

      {/* Customer & Due Date */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="label">Customer (optional: ID or Name)</label>
          <Input
            value={customerId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerId(e.target.value)}
            placeholder="Type a customer ID (UUID) or any name"
          />
          <p className="text-xs text-gray-500 mt-1">You can leave this blank or enter any text; we’ll save it.</p>
        </div>
        <div>
          <label className="label">Due Date</label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDueDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Invoice Items */}
      <div className="mb-6">
        <label className="label mb-3">Invoice Items</label>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <Input
                  value={item.description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItem(index, 'description', e.target.value)}
                  placeholder="Description"
                  required
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  value={item.quantity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  placeholder="Qty"
                  min="1"
                  required
                />
              </div>
              <div className="w-28">
                <Input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                  placeholder="Price"
                  min="0"
                  required
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  value={item.tax_rate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItem(index, 'tax_rate', parseFloat(e.target.value) || 0)}
                  placeholder="Tax%"
                  min="0"
                  max="100"
                />
              </div>
              <div className="w-24 pt-2 font-semibold text-right">
                ${item.total.toFixed(2)}
              </div>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="mt-2 text-red-600 hover:text-red-700"
                disabled={items.length === 1}
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
        
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addItem}
          className="mt-3"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      {/* Totals */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between mb-2">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-medium">${calculateSubtotal().toFixed(2)}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="text-gray-600">Tax:</span>
          <span className="font-medium">${calculateTax().toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold border-t pt-2">
          <span>Total:</span>
          <span className="text-primary-500">${calculateTotal().toFixed(2)}</span>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="label">Notes (Optional)</label>
        <textarea
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
          className="input min-h-[80px]"
          placeholder="Add any notes or payment terms..."
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <Button variant="secondary" type="button" className="flex-1">
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={loading} className="flex-1">
          Create Invoice
        </Button>
      </div>
    </form>
  );
};
