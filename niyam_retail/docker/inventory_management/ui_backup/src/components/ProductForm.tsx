import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from '../../../../shared/components/index.ts';
import { uploadProductImages } from '../api/inventory';
import type { Product } from '../../../../shared/types/models.ts';

interface ProductFormProps {
  product?: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading?: boolean;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  product,
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    description: '',
    unit_price: '',
    cost_price: '',
    tax_rate: '10',
    reorder_point: '',
    reorder_quantity: '',
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        sku: product.sku,
        category: product.category || '',
        description: product.description || '',
        unit_price: product.unit_price.toString(),
        cost_price: product.cost_price?.toString() || '',
        tax_rate: product.tax_rate.toString(),
        reorder_point: product.reorder_point?.toString() || '',
        reorder_quantity: product.reorder_quantity?.toString() || '',
      });
    } else {
      setFormData({
        name: '',
        sku: '',
        category: '',
        description: '',
        unit_price: '',
        cost_price: '',
        tax_rate: '10',
        reorder_point: '',
        reorder_quantity: '',
      });
    }
  }, [product, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      unit_price: parseFloat(formData.unit_price),
      cost_price: formData.cost_price ? parseFloat(formData.cost_price) : undefined,
      tax_rate: parseFloat(formData.tax_rate),
      reorder_point: formData.reorder_point ? parseInt(formData.reorder_point) : undefined,
      reorder_quantity: formData.reorder_quantity ? parseInt(formData.reorder_quantity) : undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product ? 'Edit Product' : 'Add New Product'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Product Name *</label>
            <Input
              value={formData.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">SKU *</label>
            <Input
              value={formData.sku}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, sku: e.target.value })}
              required
            />
          </div>
        </div>

        {/* Category & Description */}
        <div>
          <label className="label">Category</label>
          <Input
            value={formData.category}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, category: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            value={formData.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
            className="input min-h-[80px]"
          />
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Sell Price *</label>
            <Input
              type="number"
              step="0.01"
              value={formData.unit_price}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, unit_price: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Cost Price</label>
            <Input
              type="number"
              step="0.01"
              value={formData.cost_price}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, cost_price: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Tax Rate (%)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.tax_rate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, tax_rate: e.target.value })}
              required
            />
          </div>
        </div>

        {/* Reorder Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Reorder Point</label>
            <Input
              type="number"
              value={formData.reorder_point}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, reorder_point: e.target.value })}
              placeholder="Alert when stock reaches..."
            />
          </div>
          <div>
            <label className="label">Reorder Quantity</label>
            <Input
              type="number"
              value={formData.reorder_quantity}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, reorder_quantity: e.target.value })}
              placeholder="Suggested order quantity"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading} className="flex-1">
            {product ? 'Update Product' : 'Create Product'}
          </Button>
        </div>

        {/* Images */}
        {product && (
          <div className="pt-4 border-t mt-4">
            <label className="label">Product Images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                if (!e.target.files || !product) return;
                try {
                  await uploadProductImages(product.id, Array.from(e.target.files));
                  alert('Images uploaded');
                } catch (err) {
                  alert('Failed to upload images');
                }
              }}
            />
            <p className="text-xs text-gray-500 mt-1">You can upload multiple images; the first becomes primary.</p>
          </div>
        )}
      </form>
    </Modal>
  );
};
