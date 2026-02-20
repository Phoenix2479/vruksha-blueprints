// Data normalization utilities for import

const { parseNumberFlexible, pick } = require('./helpers');

function normalizeRow(raw) {
  // Map common synonyms
  const keys = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase().trim(), v])
  );

  const name = keys.name || keys.product || keys.title || keys.description || '';
  const sku = keys.sku || keys.code || keys.product_code || '';
  const category = keys.category || keys.collection || '';
  const description = keys.description || keys.notes || '';
  const color = keys.color || keys.colour || '';
  const material = keys.material || '';
  const design = keys.design || '';
  const edition = keys.edition || '';
  const collection = keys.collection || '';
  const unit_price = parseNumberFlexible(keys.price || keys.unit_price || keys.sale_price);
  const cost_price = parseNumberFlexible(keys.cost || keys.cost_price);
  const tax_rate = parseNumberFlexible(keys.tax || keys.tax_rate);
  const quantity = parseNumberFlexible(keys.qty || keys.quantity || keys.stock || keys.units);
  const reorder_point = parseNumberFlexible(keys.reorder_point || keys.min_stock_level);
  const reorder_quantity = parseNumberFlexible(keys.reorder_quantity || 0);

  return {
    name: name?.toString().trim() || '',
    sku: sku?.toString().trim() || '',
    category: category?.toString().trim() || '',
    description: description?.toString().trim() || '',
    attributes: pick(
      { color, material, design, edition, collection },
      ['color', 'material', 'design', 'edition', 'collection']
    ),
    unit_price: unit_price || 0,
    cost_price: cost_price || null,
    tax_rate: tax_rate || 0,
    quantity: quantity || 0,
    reorder_point: reorder_point || 0,
    reorder_quantity: reorder_quantity || 0,
  };
}

module.exports = {
  normalizeRow
};
