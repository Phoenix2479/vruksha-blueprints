// Variant business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { v4: uuidv4 } = require('uuid');

async function listVariants(productId, tenantId) {
  const result = await query(
    `SELECT * FROM product_variants
     WHERE product_id = $1 AND tenant_id = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [productId, tenantId]
  );
  return result.rows;
}

async function getVariant(variantId, tenantId) {
  const result = await query(
    `SELECT v.*, p.name as product_name, p.slug as product_slug
     FROM product_variants v
     JOIN products p ON v.product_id = p.id
     WHERE v.id = $1 AND v.tenant_id = $2`,
    [variantId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function createVariant(productId, tenantId, data) {
  const id = uuidv4();

  // Verify product exists
  const product = await query(
    'SELECT id FROM products WHERE id = $1 AND tenant_id = $2',
    [productId, tenantId]
  );
  if (product.rows.length === 0) return null;

  const result = await query(
    `INSERT INTO product_variants (
       id, tenant_id, product_id, name, sku, price, compare_at_price,
       cost_price, stock_quantity, low_stock_threshold, weight, weight_unit,
       options, image_url, is_active, sort_order
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15, $16
     ) RETURNING *`,
    [
      id, tenantId, productId, data.name,
      data.sku || null, data.price, data.compare_at_price || null,
      data.cost_price || null, data.stock_quantity || 0,
      data.low_stock_threshold || 5, data.weight || null,
      data.weight_unit || 'kg', JSON.stringify(data.options || {}),
      data.image_url || null, data.is_active !== undefined ? data.is_active : true,
      data.sort_order || 0
    ]
  );

  return result.rows[0];
}

async function updateVariant(variantId, tenantId, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const updatableFields = [
    'name', 'sku', 'price', 'compare_at_price', 'cost_price',
    'stock_quantity', 'low_stock_threshold', 'weight', 'weight_unit',
    'image_url', 'is_active', 'sort_order'
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      values.push(data[field]);
      idx += 1;
    }
  }

  if (data.options !== undefined) {
    fields.push(`options = $${idx}::jsonb`);
    values.push(JSON.stringify(data.options));
    idx += 1;
  }

  if (fields.length === 0) return null;

  fields.push('updated_at = NOW()');
  values.push(variantId, tenantId);

  const result = await query(
    `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function deleteVariant(variantId, tenantId) {
  const result = await query(
    'DELETE FROM product_variants WHERE id = $1 AND tenant_id = $2',
    [variantId, tenantId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listVariants,
  getVariant,
  createVariant,
  updateVariant,
  deleteVariant
};
