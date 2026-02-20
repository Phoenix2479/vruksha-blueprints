// Product Catalog - Variants Routes
const express = require('express');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// PRODUCT VARIANTS
// ============================================

const CreateVariantSchema = z.object({
  product_id: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().optional(),
  attributes: z.record(z.string()),
  price: z.number().optional(),
  cost: z.number().optional(),
  weight: z.number().optional(),
  barcode: z.string().optional(),
  image_url: z.string().url().optional(),
  stock_quantity: z.number().int().optional()
});

// Get variants for product
router.get('/product/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    
    const result = await query(
      `SELECT v.*, 
              (SELECT json_agg(pm.*) FROM product_media pm WHERE pm.variant_id = v.id) as media
       FROM product_variants v
       WHERE v.tenant_id = $1 AND v.product_id = $2 AND v.is_active = true
       ORDER BY v.created_at`,
      [tenantId, product_id]
    );
    
    res.json({ success: true, variants: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create variant
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const data = parsed.data;
    
    const result = await query(
      `INSERT INTO product_variants 
       (tenant_id, product_id, sku, name, attributes, price, cost, weight, barcode, image_url, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId, data.product_id, data.sku, data.name,
        JSON.stringify(data.attributes), data.price, data.cost,
        data.weight, data.barcode, data.image_url, data.stock_quantity || 0
      ]
    );
    
    res.json({ success: true, variant: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get variant by ID
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      `SELECT v.*, p.name as product_name
       FROM product_variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.id = $1 AND v.tenant_id = $2`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    
    res.json({ success: true, variant: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update variant
router.patch('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { name, attributes, price, cost, weight, barcode, image_url, stock_quantity, is_active } = req.body;
    
    const updates = [];
    const params = [id, tenantId];
    let idx = 3;
    
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (attributes !== undefined) { updates.push(`attributes = $${idx++}`); params.push(JSON.stringify(attributes)); }
    if (price !== undefined) { updates.push(`price = $${idx++}`); params.push(price); }
    if (cost !== undefined) { updates.push(`cost = $${idx++}`); params.push(cost); }
    if (weight !== undefined) { updates.push(`weight = $${idx++}`); params.push(weight); }
    if (barcode !== undefined) { updates.push(`barcode = $${idx++}`); params.push(barcode); }
    if (image_url !== undefined) { updates.push(`image_url = $${idx++}`); params.push(image_url); }
    if (stock_quantity !== undefined) { updates.push(`stock_quantity = $${idx++}`); params.push(stock_quantity); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(is_active); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await query(
      `UPDATE product_variants SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    
    res.json({ success: true, variant: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete variant (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      `UPDATE product_variants SET is_active = false, updated_at = NOW() 
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    
    res.json({ success: true, message: 'Variant deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PRODUCT ATTRIBUTES
// ============================================

// List attributes
router.get('/attributes', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(
      'SELECT * FROM product_attributes WHERE tenant_id = $1 ORDER BY sort_order, name',
      [tenantId]
    );
    
    res.json({ success: true, attributes: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create attribute
router.post('/attributes', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { name, code, attribute_type, options, unit, is_filterable, is_visible, sort_order } = req.body;
    
    const result = await query(
      `INSERT INTO product_attributes 
       (tenant_id, name, code, attribute_type, options, unit, is_filterable, is_visible, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, name, code, attribute_type, options ? JSON.stringify(options) : null, unit, is_filterable || false, is_visible !== false, sort_order || 0]
    );
    
    res.json({ success: true, attribute: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Set attribute value for product
router.post('/attributes/values', async (req, res, next) => {
  try {
    const { product_id, attribute_id, value } = req.body;
    
    // Get attribute type
    const attrResult = await query('SELECT attribute_type FROM product_attributes WHERE id = $1', [attribute_id]);
    if (attrResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attribute not found' });
    }
    
    const attrType = attrResult.rows[0].attribute_type;
    const valueColumns = {
      text: 'value_text',
      number: 'value_number',
      boolean: 'value_boolean',
      select: 'value_text',
      multiselect: 'value_json'
    };
    
    const valueColumn = valueColumns[attrType] || 'value_text';
    const valueToStore = attrType === 'multiselect' ? JSON.stringify(value) : value;
    
    const result = await query(
      `INSERT INTO product_attribute_values (product_id, attribute_id, ${valueColumn})
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, attribute_id) 
       DO UPDATE SET ${valueColumn} = EXCLUDED.${valueColumn}
       RETURNING *`,
      [product_id, attribute_id, valueToStore]
    );
    
    res.json({ success: true, value: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get attribute values for product
router.get('/attributes/values/:product_id', async (req, res, next) => {
  try {
    const { product_id } = req.params;
    
    const result = await query(
      `SELECT pav.*, pa.name, pa.code, pa.attribute_type
       FROM product_attribute_values pav
       JOIN product_attributes pa ON pav.attribute_id = pa.id
       WHERE pav.product_id = $1`,
      [product_id]
    );
    
    res.json({ success: true, values: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
