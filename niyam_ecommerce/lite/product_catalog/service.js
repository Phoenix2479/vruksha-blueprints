const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9151;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product_catalog', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'product_catalog' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'product_catalog', ready: true }));

// ── Helper: generate slug ──────────────────────────────────────────
function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 200);
}

// ══════════════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════════════

// List categories
app.get('/categories', (req, res) => {
  try {
    const { parent_id, is_active } = req.query;
    let sql = 'SELECT * FROM categories WHERE 1=1';
    const params = [];
    if (parent_id === 'root') {
      sql += ' AND parent_id IS NULL';
    } else if (parent_id) {
      sql += ' AND parent_id = ?';
      params.push(parent_id);
    }
    if (is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    sql += ' ORDER BY sort_order ASC, name ASC';
    const categories = query(sql, params);
    res.json({ success: true, data: categories });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get category by ID
app.get('/categories/:id', (req, res) => {
  try {
    const category = get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    const children = query('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order ASC', [req.params.id]);
    category.children = children;
    res.json({ success: true, data: category });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create category
app.post('/categories', (req, res) => {
  try {
    const { name, description, parent_id, image_url, sort_order, is_active } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    const id = uuidv4();
    const slug = generateSlug(name);
    run(`INSERT INTO categories (id, name, slug, parent_id, description, image_url, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, slug, parent_id || null, description || null, image_url || null, sort_order || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1]);
    const category = get('SELECT * FROM categories WHERE id = ?', [id]);
    notifyAccounting('ecommerce', 'ecommerce.category.created', { category_id: id, name });
    res.status(201).json({ success: true, data: category });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update category
app.patch('/categories/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Category not found' });
    const { name, description, parent_id, image_url, sort_order, is_active } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); fields.push('slug = ?'); params.push(generateSlug(name)); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (parent_id !== undefined) { fields.push('parent_id = ?'); params.push(parent_id || null); }
    if (image_url !== undefined) { fields.push('image_url = ?'); params.push(image_url); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.id);
    run(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, params);
    const category = get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: category });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete category
app.delete('/categories/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Category not found' });
    // Reassign children
    run('UPDATE categories SET parent_id = ? WHERE parent_id = ?', [existing.parent_id || null, req.params.id]);
    // Unlink products
    run('UPDATE products SET category_id = NULL WHERE category_id = ?', [req.params.id]);
    run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Category deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════

// List products with search and filtering
app.get('/products', (req, res) => {
  try {
    const { search, category_id, status, tag, min_price, max_price, is_digital, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category_id) { sql += ' AND category_id = ?'; params.push(category_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (tag) { sql += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }
    if (min_price) { sql += ' AND unit_price >= ?'; params.push(parseFloat(min_price)); }
    if (max_price) { sql += ' AND unit_price <= ?'; params.push(parseFloat(max_price)); }
    if (is_digital !== undefined) { sql += ' AND is_digital = ?'; params.push(is_digital === 'true' ? 1 : 0); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const products = query(sql, params);
    // Parse JSON fields
    const parsed = products.map(p => ({
      ...p,
      images: JSON.parse(p.images || '[]'),
      tags: JSON.parse(p.tags || '[]'),
      attributes: JSON.parse(p.attributes || '{}')
    }));
    res.json({ success: true, data: parsed });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get product by ID
app.get('/products/:id', (req, res) => {
  try {
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    product.images = JSON.parse(product.images || '[]');
    product.tags = JSON.parse(product.tags || '[]');
    product.attributes = JSON.parse(product.attributes || '{}');
    const variants = query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC', [req.params.id]);
    product.variants = variants.map(v => ({ ...v, options: JSON.parse(v.options || '{}') }));
    res.json({ success: true, data: product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create product
app.post('/products', (req, res) => {
  try {
    const { name, sku, description, short_description, category_id, brand, unit_price, cost_price, compare_at_price, tax_rate, weight, weight_unit, status, is_digital, images, tags, attributes, seo_title, seo_description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    const id = uuidv4();
    const slug = generateSlug(name);
    run(`INSERT INTO products (id, sku, name, slug, description, short_description, category_id, brand, unit_price, cost_price, compare_at_price, tax_rate, weight, weight_unit, status, is_digital, images, tags, attributes, seo_title, seo_description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sku || null, name, slug, description || null, short_description || null, category_id || null, brand || null, unit_price || 0, cost_price || 0, compare_at_price || null, tax_rate || 0, weight || null, weight_unit || 'kg', status || 'draft', is_digital ? 1 : 0, JSON.stringify(images || []), JSON.stringify(tags || []), JSON.stringify(attributes || {}), seo_title || null, seo_description || null]);
    const product = get('SELECT * FROM products WHERE id = ?', [id]);
    product.images = JSON.parse(product.images || '[]');
    product.tags = JSON.parse(product.tags || '[]');
    product.attributes = JSON.parse(product.attributes || '{}');
    notifyAccounting('ecommerce', 'ecommerce.product.created', { product_id: id, name, sku, unit_price: unit_price || 0 });
    res.status(201).json({ success: true, data: product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update product
app.patch('/products/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });
    const allowedFields = ['name', 'sku', 'description', 'short_description', 'category_id', 'brand', 'unit_price', 'cost_price', 'compare_at_price', 'tax_rate', 'weight', 'weight_unit', 'status', 'is_digital', 'seo_title', 'seo_description'];
    const fields = [];
    const params = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'is_digital') {
          fields.push(`${field} = ?`);
          params.push(req.body[field] ? 1 : 0);
        } else {
          fields.push(`${field} = ?`);
          params.push(req.body[field]);
        }
      }
    }
    if (req.body.name !== undefined) { fields.push('slug = ?'); params.push(generateSlug(req.body.name)); }
    if (req.body.images !== undefined) { fields.push('images = ?'); params.push(JSON.stringify(req.body.images)); }
    if (req.body.tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(req.body.tags)); }
    if (req.body.attributes !== undefined) { fields.push('attributes = ?'); params.push(JSON.stringify(req.body.attributes)); }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.id);
    run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    product.images = JSON.parse(product.images || '[]');
    product.tags = JSON.parse(product.tags || '[]');
    product.attributes = JSON.parse(product.attributes || '{}');
    notifyAccounting('ecommerce', 'ecommerce.product.updated', { product_id: req.params.id, name: product.name });
    res.json({ success: true, data: product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete product (soft delete)
app.delete('/products/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });
    run("UPDATE products SET status = 'archived', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    notifyAccounting('ecommerce', 'ecommerce.product.deleted', { product_id: req.params.id });
    res.json({ success: true, data: { message: 'Product archived' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// PRODUCT VARIANTS
// ══════════════════════════════════════════════════════════════════════

// List variants for a product
app.get('/products/:product_id/variants', (req, res) => {
  try {
    const variants = query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC', [req.params.product_id]);
    const parsed = variants.map(v => ({ ...v, options: JSON.parse(v.options || '{}') }));
    res.json({ success: true, data: parsed });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create variant
app.post('/products/:product_id/variants', (req, res) => {
  try {
    const product = get('SELECT id FROM products WHERE id = ?', [req.params.product_id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    const { name, sku, options, price_adjustment, stock_quantity, is_active } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    const id = uuidv4();
    run(`INSERT INTO product_variants (id, product_id, sku, name, options, price_adjustment, stock_quantity, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.product_id, sku || null, name, JSON.stringify(options || {}), price_adjustment || 0, stock_quantity || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1]);
    const variant = get('SELECT * FROM product_variants WHERE id = ?', [id]);
    variant.options = JSON.parse(variant.options || '{}');
    res.status(201).json({ success: true, data: variant });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update variant
app.patch('/products/:product_id/variants/:variant_id', (req, res) => {
  try {
    const existing = get('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [req.params.variant_id, req.params.product_id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Variant not found' });
    const fields = [];
    const params = [];
    if (req.body.name !== undefined) { fields.push('name = ?'); params.push(req.body.name); }
    if (req.body.sku !== undefined) { fields.push('sku = ?'); params.push(req.body.sku); }
    if (req.body.price_adjustment !== undefined) { fields.push('price_adjustment = ?'); params.push(req.body.price_adjustment); }
    if (req.body.stock_quantity !== undefined) { fields.push('stock_quantity = ?'); params.push(req.body.stock_quantity); }
    if (req.body.is_active !== undefined) { fields.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (req.body.options !== undefined) { fields.push('options = ?'); params.push(JSON.stringify(req.body.options)); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.variant_id);
    run(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ?`, params);
    const variant = get('SELECT * FROM product_variants WHERE id = ?', [req.params.variant_id]);
    variant.options = JSON.parse(variant.options || '{}');
    res.json({ success: true, data: variant });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete variant
app.delete('/products/:product_id/variants/:variant_id', (req, res) => {
  try {
    const existing = get('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [req.params.variant_id, req.params.product_id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Variant not found' });
    run('DELETE FROM product_variants WHERE id = ?', [req.params.variant_id]);
    res.json({ success: true, data: { message: 'Variant deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'product_catalog', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Product Catalog Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
