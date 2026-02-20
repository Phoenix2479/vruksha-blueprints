import React, { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Modal, Button, Input, Select } from '../../../../shared/components/index.ts';
import type { Product } from '../../../../shared/types/models.ts';
import type { SelectOption } from '../../../../shared/components/index.ts';

interface StockAdjustmentFormProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    product_id: string;
    quantity_change: number;
    reason: string;
    notes?: string;
  }) => void;
  loading?: boolean;
}

export const StockAdjustmentForm: React.FC<StockAdjustmentFormProps> = ({
  product,
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}) => {
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('restock');
  const [notes, setNotes] = useState('');

  const reasonOptions: SelectOption[] = [
    { value: 'restock', label: 'Restock / Purchase' },
    { value: 'sale', label: 'Sale / Customer Order' },
    { value: 'damage', label: 'Damaged / Spoiled' },
    { value: 'theft', label: 'Theft / Loss' },
    { value: 'return', label: 'Customer Return' },
    { value: 'adjustment', label: 'Manual Adjustment' },
    { value: 'transfer', label: 'Transfer to Another Location' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const quantityChange = adjustmentType === 'add' 
      ? parseInt(quantity) 
      : -parseInt(quantity);
    
    onSubmit({
      product_id: product.id,
      quantity_change: quantityChange,
      reason,
      notes: notes || undefined,
    });
  };

  const newQuantity = product.quantity_on_hand + (adjustmentType === 'add' ? parseInt(quantity) || 0 : -(parseInt(quantity) || 0));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adjust Stock">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product Info */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="font-semibold text-gray-900">{product.name}</p>
          <p className="text-sm text-gray-600">SKU: {product.sku}</p>
          <p className="text-lg font-bold text-gray-900 mt-2">
            Current Stock: {product.quantity_on_hand}
          </p>
        </div>

        {/* Adjustment Type */}
        <div>
          <label className="label">Adjustment Type</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAdjustmentType('add')}
              className={`p-4 rounded-lg border-2 transition-all ${
                adjustmentType === 'add'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <TrendingUp className={`w-6 h-6 mx-auto mb-2 ${adjustmentType === 'add' ? 'text-green-500' : 'text-gray-400'}`} />
              <p className="font-medium">Add Stock</p>
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentType('remove')}
              className={`p-4 rounded-lg border-2 transition-all ${
                adjustmentType === 'remove'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <TrendingDown className={`w-6 h-6 mx-auto mb-2 ${adjustmentType === 'remove' ? 'text-red-500' : 'text-gray-400'}`} />
              <p className="font-medium">Remove Stock</p>
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="label">Quantity</label>
          <Input
            type="number"
            value={quantity}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantity(e.target.value)}
            min="1"
            required
          />
          <p className="text-sm text-gray-600 mt-1">
            New stock level will be: <span className="font-semibold">{newQuantity}</span>
          </p>
        </div>

        {/* Reason */}
        <div>
          <label className="label">Reason</label>
          <Select
            value={reason}
            onChange={setReason}
            options={reasonOptions}
            required
          />
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            className="input min-h-[80px]"
            placeholder="Add any additional notes..."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant={adjustmentType === 'add' ? 'primary' : 'danger'}
            type="submit"
            loading={loading}
            className="flex-1"
          >
            {adjustmentType === 'add' ? 'Add' : 'Remove'} Stock
          </Button>
        </div>
      </form>
    </Modal>
  );
};
