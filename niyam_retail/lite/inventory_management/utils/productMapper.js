// Product row mapping utilities

const { query } = require('@vruksha/platform/db/postgres');
const { DEFAULT_STORE_ID } = require('../config/constants');

function mapProductRow(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category || null,
    description: row.description || null,
    unit_price: row.price != null ? parseFloat(row.price) : 0,
    cost_price: row.cost != null ? parseFloat(row.cost) : null,
    tax_rate: row.tax_rate != null ? parseFloat(row.tax_rate) : 0,
    quantity_on_hand: row.available_quantity != null ? parseInt(row.available_quantity, 10) : 0,
    reorder_point: row.reorder_point != null ? parseInt(row.reorder_point, 10) : null,
    reorder_quantity: row.reorder_quantity != null ? parseInt(row.reorder_quantity, 10) : null,
    is_active: row.status === 'active',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getProductWithInventory(productId, tenantId) {
  const result = await query(
    `SELECT
       p.*,
       COALESCE(i.quantity, 0) AS quantity,
       COALESCE(i.available_quantity, 0) AS available_quantity,
       i.reorder_point,
       i.reorder_quantity
     FROM products p
     LEFT JOIN inventory i
       ON p.id = i.product_id AND i.store_id = $1 AND i.tenant_id = $2
     WHERE p.id = $3 AND p.tenant_id = $2`,
    [DEFAULT_STORE_ID, tenantId, productId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

module.exports = {
  mapProductRow,
  getProductWithInventory
};
