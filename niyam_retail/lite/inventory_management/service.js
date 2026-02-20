/**
 * Inventory Management - Max Lite Version
 * Self-contained with SQLite (sql.js)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');
const { extractInventoryData, getAIUsageStats } = require('./ai_extractor');

const app = express();
const PORT = process.env.PORT || 8811;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for image uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'inventory_management', mode: 'lite' });
});

// Debug endpoint - shows raw database state
app.get('/debug/db', (req, res) => {
  try {
    const products = query('SELECT * FROM products WHERE active = 1');
    const inventory = query('SELECT * FROM inventory');
    console.log(`[Debug] Products: ${products.length}, Inventory: ${inventory.length}`);
    res.json({
      success: true,
      products_count: products.length,
      inventory_count: inventory.length,
      products: products,
      inventory: inventory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Products API - Returns products joined with inventory data
// UI expects: products array with unit_price, quantity, reorder_level, category_name
app.get('/api/products', (req, res) => {
  try {
    const { category_id, categoryId, search, limit } = req.query;
    const categoryFilter = category_id || categoryId;
    const searchFilter = search;
    const limitNum = parseInt(limit) || 100;

    let sql = `
      SELECT
        p.id, p.sku, p.name, p.description, p.category,
        p.category as category_name,
        p.price as unit_price,
        p.cost as cost_price,
        p.tax_rate,
        p.barcode,
        p.image_url,
        p.active,
        p.created_at,
        p.updated_at,
        COALESCE(i.quantity, 0) as quantity,
        COALESCE(i.min_quantity, 0) as reorder_level,
        COALESCE(i.location, 'main') as location
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.active = 1
    `;
    const params = [];

    // Category filter (case-insensitive)
    if (categoryFilter && categoryFilter !== 'all') {
      sql += ` AND LOWER(p.category) = LOWER(?)`;
      params.push(categoryFilter);
    }

    // Search filter
    if (searchFilter) {
      sql += ` AND (LOWER(p.name) LIKE LOWER(?) OR LOWER(p.sku) LIKE LOWER(?) OR p.barcode LIKE ?)`;
      params.push(`%${searchFilter}%`, `%${searchFilter}%`, `%${searchFilter}%`);
    }

    sql += ` LIMIT ?`;
    params.push(limitNum);

    const products = query(sql, params);
    console.log(`[Inventory] Products query: category=${categoryFilter}, search=${searchFilter}, found=${products.length}`);

    // Return as 'products' for UI compatibility AND 'data' for backwards compatibility
    res.json({ success: true, products: products, data: products });
  } catch (err) {
    console.error('[Inventory] Products fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ALIAS ROUTES - UI may call /products instead of /api/products
// ============================================

app.get('/products', (req, res) => {
  console.log('[Inventory] /products alias called, forwarding to /api/products');
  req.url = '/api/products' + (req._parsedUrl?.search || '');
  app._router.handle(req, res, () => res.status(404).json({ error: 'Not found' }));
});

app.get('/products/:id', (req, res) => {
  console.log('[Inventory] /products/:id alias called');
  req.url = `/api/products/${req.params.id}`;
  app._router.handle(req, res, () => res.status(404).json({ error: 'Not found' }));
});

app.post('/api/products', (req, res) => {
  try {
    console.log('[Inventory] POST /api/products received:', JSON.stringify(req.body, null, 2));

    // Accept both UI field names and backend field names
    const {
      sku, name, description, category, barcode,
      // UI field names (various conventions)
      sellingPrice, costPrice, initialQuantity, reorderLevel, location,
      unit_price, cost_price, quantity: bodyQty,
      // Backend field names (fallback)
      price, cost, tax_rate, taxRate,
      // Additional aliases
      reorder_point, min_quantity
    } = req.body;

    // Map fields - try all possible field names, handle empty strings
    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };

    const finalPrice = parseNum(sellingPrice) ?? parseNum(unit_price) ?? parseNum(price) ?? 0;
    const finalCost = parseNum(costPrice) ?? parseNum(cost_price) ?? parseNum(cost) ?? 0;
    const finalTaxRate = parseNum(tax_rate) ?? parseNum(taxRate) ?? 0;
    const quantity = parseNum(initialQuantity) ?? parseNum(bodyQty) ?? 0;
    const minQuantity = parseNum(reorderLevel) ?? parseNum(reorder_point) ?? parseNum(min_quantity) ?? 0;
    const stockLocation = location ?? 'main';

    console.log(`[Inventory] Mapped values - price: ${finalPrice}, cost: ${finalCost}, qty: ${quantity}`);

    const id = uuidv4();

    // Insert product
    run('INSERT INTO products (id, sku, name, description, category, price, cost, tax_rate, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, description || '', category || 'General', finalPrice, finalCost, finalTaxRate, barcode || '']);

    // Insert inventory with initial quantity and reorder level
    run('INSERT INTO inventory (id, product_id, quantity, min_quantity, location) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), id, quantity, minQuantity, stockLocation]);

    console.log(`[Inventory] Product created: ${name} (${sku}), price: ${finalPrice}, qty: ${quantity}`);
    // Return as 'product' for UI compatibility
    res.json({ success: true, product: { id, sku, name, price: finalPrice }, data: { id, sku, name, price: finalPrice } });
  } catch (err) {
    console.error('[Inventory] Product creation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    console.log('[Inventory] PUT /api/products/:id received:', JSON.stringify(req.body, null, 2));

    // Accept both UI field names and backend field names
    const {
      name, description, category, barcode,
      // UI field names
      sellingPrice, costPrice, unit_price, cost_price,
      // Backend field names
      price, cost, tax_rate, taxRate
    } = req.body;

    // Parse helper - handles empty strings and invalid numbers
    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };

    // Map fields - UI names take priority
    const finalPrice = parseNum(sellingPrice) ?? parseNum(unit_price) ?? parseNum(price);
    const finalCost = parseNum(costPrice) ?? parseNum(cost_price) ?? parseNum(cost);
    const finalTaxRate = parseNum(tax_rate) ?? parseNum(taxRate);

    // Build dynamic update
    const updates = [];
    const params = [];

    if (name !== undefined && name !== '') { updates.push('name=?'); params.push(name); }
    if (description !== undefined) { updates.push('description=?'); params.push(description); }
    if (category !== undefined && category !== '') { updates.push('category=?'); params.push(category); }
    if (finalPrice !== undefined) { updates.push('price=?'); params.push(finalPrice); }
    if (finalCost !== undefined) { updates.push('cost=?'); params.push(finalCost); }
    if (finalTaxRate !== undefined) { updates.push('tax_rate=?'); params.push(finalTaxRate); }
    if (barcode !== undefined) { updates.push('barcode=?'); params.push(barcode); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push('updated_at=?');
    params.push(new Date().toISOString());
    params.push(req.params.id);

    console.log(`[Inventory] Updating product ${req.params.id}:`, { updates, params });
    run(`UPDATE products SET ${updates.join(', ')} WHERE id=?`, params);
    console.log(`[Inventory] Product updated: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Inventory] Product update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH endpoint - same as PUT (UI uses PATCH for updates)
app.patch('/api/products/:id', (req, res) => {
  try {
    console.log('[Inventory] PATCH /api/products/:id received:', JSON.stringify(req.body, null, 2));

    const {
      name, description, category, barcode,
      sellingPrice, costPrice, unit_price, cost_price,
      price, cost, tax_rate, taxRate
    } = req.body;

    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };

    const finalPrice = parseNum(sellingPrice) ?? parseNum(unit_price) ?? parseNum(price);
    const finalCost = parseNum(costPrice) ?? parseNum(cost_price) ?? parseNum(cost);
    const finalTaxRate = parseNum(tax_rate) ?? parseNum(taxRate);

    const updates = [];
    const params = [];

    if (name !== undefined && name !== '') { updates.push('name=?'); params.push(name); }
    if (description !== undefined) { updates.push('description=?'); params.push(description); }
    if (category !== undefined && category !== '') { updates.push('category=?'); params.push(category); }
    if (finalPrice !== undefined) { updates.push('price=?'); params.push(finalPrice); }
    if (finalCost !== undefined) { updates.push('cost=?'); params.push(finalCost); }
    if (finalTaxRate !== undefined) { updates.push('tax_rate=?'); params.push(finalTaxRate); }
    if (barcode !== undefined) { updates.push('barcode=?'); params.push(barcode); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push('updated_at=?');
    params.push(new Date().toISOString());
    params.push(req.params.id);

    run(`UPDATE products SET ${updates.join(', ')} WHERE id=?`, params);
    console.log(`[Inventory] Product patched: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Inventory] Product patch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    run('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stock API
app.get('/api/stock', (req, res) => {
  try {
    const stock = query('SELECT i.*, p.name as product_name, p.sku FROM inventory i JOIN products p ON i.product_id = p.id WHERE p.active = 1');
    res.json({ success: true, data: stock });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stock/low', (req, res) => {
  try {
    const low = query('SELECT i.*, p.name as product_name, p.sku FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.quantity <= i.min_quantity AND p.active = 1');
    res.json({ success: true, data: low });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/stock/:productId', (req, res) => {
  try {
    const { quantity, min_quantity, max_quantity } = req.body;
    run('UPDATE inventory SET quantity=?, min_quantity=?, max_quantity=? WHERE product_id=?',
      [quantity, min_quantity || 0, max_quantity || 0, req.params.productId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/stock/:productId/adjust', (req, res) => {
  try {
    const { adjustment } = req.body;
    const current = get('SELECT quantity FROM inventory WHERE product_id = ?', [req.params.productId]);
    const newQty = (current?.quantity || 0) + adjustment;
    run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [newQty, req.params.productId]);
    res.json({ success: true, quantity: newQty });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stock adjustment endpoint - UI calls this with product_id in body
app.post('/api/stock/adjust', (req, res) => {
  try {
    const { product_id, productId, quantity_change, adjustment, reason, notes } = req.body;
    const pid = product_id || productId;
    const qty = quantity_change ?? adjustment ?? 0;

    if (!pid) {
      return res.status(400).json({ success: false, error: 'product_id is required' });
    }

    const current = get('SELECT quantity FROM inventory WHERE product_id = ?', [pid]);
    if (!current) {
      // Create inventory record if it doesn't exist
      run('INSERT INTO inventory (id, product_id, quantity, min_quantity, location) VALUES (?, ?, ?, 0, ?)',
        [uuidv4(), pid, qty, 'main']);
      console.log(`[Inventory] Created stock record for ${pid} with qty: ${qty}`);
      if (qty > 0) notifyAccounting('retail', 'retail.inventory.purchase.received', { product_id: pid, quantity: qty, reason, notes });
      res.json({ success: true, adjustment: { product_id: pid, previous: 0, new: qty, change: qty } });
    } else {
      const newQty = (current.quantity || 0) + qty;
      run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [newQty, pid]);
      console.log(`[Inventory] Adjusted stock for ${pid}: ${current.quantity} -> ${newQty} (${qty > 0 ? '+' : ''}${qty})`);
      if (qty > 0) notifyAccounting('retail', 'retail.inventory.purchase.received', { product_id: pid, quantity: qty, previous: current.quantity, new_qty: newQty, reason, notes });
      res.json({ success: true, adjustment: { product_id: pid, previous: current.quantity, new: newQty, change: qty } });
    }
  } catch (err) {
    console.error('[Inventory] Stock adjust error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SUPPLIER TEMPLATES API
// ============================================

// List all templates
app.get('/api/inventory/templates', (req, res) => {
  try {
    const templates = query('SELECT * FROM supplier_templates ORDER BY use_count DESC, last_used DESC');
    // Parse JSON fields
    const parsed = templates.map(t => ({
      ...t,
      column_mapping: t.column_mapping ? JSON.parse(t.column_mapping) : {},
      default_values: t.default_values ? JSON.parse(t.default_values) : {},
      header_pattern: t.header_pattern ? JSON.parse(t.header_pattern) : null
    }));
    res.json({ success: true, templates: parsed });
  } catch (err) {
    console.error('[Inventory] Templates list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get template by ID
app.get('/api/inventory/templates/:id', (req, res) => {
  try {
    const template = get('SELECT * FROM supplier_templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    
    res.json({ 
      success: true, 
      template: {
        ...template,
        column_mapping: template.column_mapping ? JSON.parse(template.column_mapping) : {},
        default_values: template.default_values ? JSON.parse(template.default_values) : {},
        header_pattern: template.header_pattern ? JSON.parse(template.header_pattern) : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Find template by fingerprint or header pattern (for auto-matching)
app.get('/api/inventory/templates/match', (req, res) => {
  try {
    const { fingerprint, headers, filename } = req.query;
    let template = null;
    let matchType = null;
    let confidence = 0;

    // Try fingerprint match first
    if (fingerprint) {
      template = get('SELECT * FROM supplier_templates WHERE supplier_fingerprint = ?', [fingerprint]);
      if (template) {
        matchType = 'fingerprint';
        confidence = 1.0;
      }
    }

    // Try filename pattern match
    if (!template && filename) {
      const templates = query('SELECT * FROM supplier_templates WHERE filename_pattern IS NOT NULL');
      for (const t of templates) {
        if (t.filename_pattern) {
          const pattern = t.filename_pattern.replace(/\*/g, '.*');
          const regex = new RegExp(pattern, 'i');
          if (regex.test(filename)) {
            template = t;
            matchType = 'filename';
            confidence = 0.9;
            break;
          }
        }
      }
    }

    // Try header similarity match
    if (!template && headers) {
      const headerArr = typeof headers === 'string' ? JSON.parse(headers) : headers;
      const templates = query('SELECT * FROM supplier_templates WHERE header_pattern IS NOT NULL');
      let bestMatch = null;
      let bestScore = 0;

      for (const t of templates) {
        const storedHeaders = JSON.parse(t.header_pattern || '[]');
        if (storedHeaders.length === 0) continue;
        
        // Calculate similarity (Jaccard index)
        const set1 = new Set(headerArr.map(h => h?.toLowerCase()?.trim()).filter(Boolean));
        const set2 = new Set(storedHeaders.map(h => h?.toLowerCase()?.trim()).filter(Boolean));
        const intersection = [...set1].filter(x => set2.has(x)).length;
        const union = new Set([...set1, ...set2]).size;
        const score = union > 0 ? intersection / union : 0;

        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          bestMatch = t;
        }
      }

      if (bestMatch) {
        template = bestMatch;
        matchType = 'headers';
        confidence = bestScore;
      }
    }

    if (template) {
      res.json({ 
        success: true, 
        matched: true,
        matchType,
        confidence,
        template: {
          ...template,
          column_mapping: template.column_mapping ? JSON.parse(template.column_mapping) : {},
          default_values: template.default_values ? JSON.parse(template.default_values) : {},
          header_pattern: template.header_pattern ? JSON.parse(template.header_pattern) : null
        }
      });
    } else {
      res.json({ success: true, matched: false });
    }
  } catch (err) {
    console.error('[Inventory] Template match error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create template
app.post('/api/inventory/templates', (req, res) => {
  try {
    const {
      supplier_name,
      supplier_fingerprint,
      filename_pattern,
      header_pattern,
      column_mapping,
      default_values,
      ai_prompt_template
    } = req.body;

    if (!supplier_name || !column_mapping) {
      return res.status(400).json({ success: false, error: 'supplier_name and column_mapping are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(`INSERT INTO supplier_templates 
      (id, supplier_name, supplier_fingerprint, filename_pattern, header_pattern, column_mapping, default_values, ai_prompt_template, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        supplier_name,
        supplier_fingerprint || null,
        filename_pattern || null,
        header_pattern ? JSON.stringify(header_pattern) : null,
        JSON.stringify(column_mapping),
        default_values ? JSON.stringify(default_values) : null,
        ai_prompt_template || null,
        now,
        now
      ]
    );

    console.log(`[Inventory] Created supplier template: ${supplier_name}`);
    res.json({ success: true, template: { id, supplier_name } });
  } catch (err) {
    console.error('[Inventory] Template create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update template
app.put('/api/inventory/templates/:id', (req, res) => {
  try {
    const {
      supplier_name,
      supplier_fingerprint,
      filename_pattern,
      header_pattern,
      column_mapping,
      default_values,
      ai_prompt_template
    } = req.body;

    const updates = [];
    const params = [];

    if (supplier_name) { updates.push('supplier_name=?'); params.push(supplier_name); }
    if (supplier_fingerprint !== undefined) { updates.push('supplier_fingerprint=?'); params.push(supplier_fingerprint); }
    if (filename_pattern !== undefined) { updates.push('filename_pattern=?'); params.push(filename_pattern); }
    if (header_pattern !== undefined) { updates.push('header_pattern=?'); params.push(JSON.stringify(header_pattern)); }
    if (column_mapping) { updates.push('column_mapping=?'); params.push(JSON.stringify(column_mapping)); }
    if (default_values !== undefined) { updates.push('default_values=?'); params.push(JSON.stringify(default_values)); }
    if (ai_prompt_template !== undefined) { updates.push('ai_prompt_template=?'); params.push(ai_prompt_template); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(req.params.id);
    run(`UPDATE supplier_templates SET ${updates.join(', ')} WHERE id=?`, params);

    console.log(`[Inventory] Updated supplier template: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete template
app.delete('/api/inventory/templates/:id', (req, res) => {
  try {
    run('DELETE FROM supplier_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Increment template use count
app.post('/api/inventory/templates/:id/use', (req, res) => {
  try {
    const now = new Date().toISOString();
    run('UPDATE supplier_templates SET use_count = use_count + 1, last_used = ? WHERE id = ?', [now, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// INGESTION SESSIONS API
// ============================================

// List sessions (pending only by default)
app.get('/api/inventory/sessions', (req, res) => {
  try {
    const { status } = req.query;
    const statusFilter = status || 'pending';
    
    let sessions;
    if (statusFilter === 'all') {
      sessions = query('SELECT id, supplier_template_id, source_type, original_filename, ai_confidence, status, import_notes, created_at, updated_at FROM ingestion_sessions ORDER BY created_at DESC');
    } else {
      sessions = query('SELECT id, supplier_template_id, source_type, original_filename, ai_confidence, status, import_notes, created_at, updated_at FROM ingestion_sessions WHERE status = ? ORDER BY created_at DESC', [statusFilter]);
    }
    
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get session by ID (includes full data)
app.get('/api/inventory/sessions/:id', (req, res) => {
  try {
    const session = get('SELECT * FROM ingestion_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    
    res.json({ 
      success: true, 
      session: {
        ...session,
        raw_data: session.raw_data ? JSON.parse(session.raw_data) : [],
        mapped_data: session.mapped_data ? JSON.parse(session.mapped_data) : [],
        warnings: session.warnings ? JSON.parse(session.warnings) : []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create session
app.post('/api/inventory/sessions', (req, res) => {
  try {
    const {
      supplier_template_id,
      source_type,
      original_filename,
      raw_data,
      mapped_data,
      warnings,
      ai_confidence,
      ai_mode,
      import_notes
    } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    run(`INSERT INTO ingestion_sessions 
      (id, supplier_template_id, source_type, original_filename, raw_data, mapped_data, warnings, ai_confidence, ai_mode, status, import_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        id,
        supplier_template_id || null,
        source_type || 'csv',
        original_filename || null,
        raw_data ? JSON.stringify(raw_data) : '[]',
        mapped_data ? JSON.stringify(mapped_data) : '[]',
        warnings ? JSON.stringify(warnings) : '[]',
        ai_confidence || null,
        ai_mode || null,
        import_notes || null,
        now,
        now
      ]
    );

    console.log(`[Inventory] Created ingestion session: ${id}`);
    res.json({ success: true, session_id: id });
  } catch (err) {
    console.error('[Inventory] Session create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update session (for editing mapped data)
app.put('/api/inventory/sessions/:id', (req, res) => {
  try {
    const { mapped_data, warnings, import_notes, status } = req.body;
    const now = new Date().toISOString();

    const updates = ['updated_at=?'];
    const params = [now];

    if (mapped_data !== undefined) { updates.push('mapped_data=?'); params.push(JSON.stringify(mapped_data)); }
    if (warnings !== undefined) { updates.push('warnings=?'); params.push(JSON.stringify(warnings)); }
    if (import_notes !== undefined) { updates.push('import_notes=?'); params.push(import_notes); }
    if (status !== undefined) { updates.push('status=?'); params.push(status); }

    params.push(req.params.id);
    run(`UPDATE ingestion_sessions SET ${updates.join(', ')} WHERE id=?`, params);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete session
app.delete('/api/inventory/sessions/:id', (req, res) => {
  try {
    run('DELETE FROM ingestion_sessions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Commit session - imports all products from session
app.post('/api/inventory/sessions/:id/commit', (req, res) => {
  try {
    const session = get('SELECT * FROM ingestion_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.status === 'committed') return res.status(400).json({ success: false, error: 'Session already committed' });

    const mappedData = session.mapped_data ? JSON.parse(session.mapped_data) : [];
    const { strategy = 'create', default_tax = 0, default_category = '' } = req.body;

    let created = 0;
    let updated = 0;
    let stockAdded = 0;
    let variantsCreated = 0;
    const warnings = [];

    for (const row of mappedData) {
      try {
        const sku = row.sku?.trim();
        const name = row.name?.trim();
        
        if (!name) {
          warnings.push(`Skipped row: missing name`);
          continue;
        }

        const productData = {
          sku: sku || `AUTO-${uuidv4().slice(0, 8)}`,
          name,
          category: row.category || default_category || 'General',
          price: parseFloat(row.unit_price || row.price || row.cost || 0),
          cost: parseFloat(row.cost || row.cost_price || 0),
          tax_rate: parseFloat(row.tax_rate ?? default_tax),
          description: row.description || '',
          barcode: row.barcode || '',
          parent_id: row.parent_id || null,
          variant_attributes: row.variant_attributes ? JSON.stringify(row.variant_attributes) : null,
          is_variant: row.is_variant ? 1 : 0
        };

        // Check if product exists (by SKU)
        const existing = sku ? get('SELECT id FROM products WHERE sku = ?', [sku]) : null;

        if (existing && strategy === 'upsert') {
          // Update existing
          run(`UPDATE products SET name=?, category=?, price=?, cost=?, tax_rate=?, description=?, barcode=?, parent_id=?, variant_attributes=?, is_variant=?, updated_at=? WHERE id=?`,
            [productData.name, productData.category, productData.price, productData.cost, productData.tax_rate, productData.description, productData.barcode, productData.parent_id, productData.variant_attributes, productData.is_variant, new Date().toISOString(), existing.id]
          );
          
          // Update stock if quantity provided
          if (row.quantity !== undefined && row.quantity !== null) {
            const qty = parseInt(row.quantity) || 0;
            run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [qty, existing.id]);
            stockAdded += qty;
          }
          
          updated++;
          if (productData.is_variant) variantsCreated++;
        } else if (!existing || strategy === 'create') {
          // Create new
          const id = uuidv4();
          run(`INSERT INTO products (id, sku, name, category, price, cost, tax_rate, description, barcode, parent_id, variant_attributes, is_variant, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [id, productData.sku, productData.name, productData.category, productData.price, productData.cost, productData.tax_rate, productData.description, productData.barcode, productData.parent_id, productData.variant_attributes, productData.is_variant]
          );
          
          // Create inventory record
          const qty = parseInt(row.quantity) || 0;
          const minQty = parseInt(row.reorder_point || row.min_quantity) || 0;
          run('INSERT INTO inventory (id, product_id, quantity, min_quantity, location) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), id, qty, minQty, row.location || 'main']
          );
          
          stockAdded += qty;
          created++;
          if (productData.is_variant) variantsCreated++;
        } else {
          warnings.push(`Skipped duplicate SKU: ${sku}`);
        }
      } catch (rowErr) {
        warnings.push(`Error on row: ${rowErr.message}`);
      }
    }

    // Mark session as committed
    const now = new Date().toISOString();
    run('UPDATE ingestion_sessions SET status = ?, updated_at = ? WHERE id = ?', ['committed', now, req.params.id]);

    // Update template use count if applicable
    if (session.supplier_template_id) {
      run('UPDATE supplier_templates SET use_count = use_count + 1, last_used = ? WHERE id = ?', [now, session.supplier_template_id]);
    }

    console.log(`[Inventory] Session ${req.params.id} committed: ${created} created, ${updated} updated, ${variantsCreated} variants`);
    res.json({ 
      success: true, 
      summary: { created, updated, stock_added: stockAdded, variants_created: variantsCreated },
      warnings 
    });
  } catch (err) {
    console.error('[Inventory] Session commit error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// VARIANT PRODUCTS API
// ============================================

// Get product variants
app.get('/api/products/:id/variants', (req, res) => {
  try {
    const variants = query('SELECT * FROM products WHERE parent_id = ? AND active = 1', [req.params.id]);
    const parsed = variants.map(v => ({
      ...v,
      variant_attributes: v.variant_attributes ? JSON.parse(v.variant_attributes) : null
    }));
    res.json({ success: true, variants: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create variant for a parent product
app.post('/api/products/:id/variants', (req, res) => {
  try {
    const parent = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!parent) return res.status(404).json({ success: false, error: 'Parent product not found' });

    const { sku, name, variant_attributes, price, cost, quantity } = req.body;

    const id = uuidv4();
    const variantSku = sku || `${parent.sku}-${uuidv4().slice(0, 4)}`;
    const variantName = name || `${parent.name} (Variant)`;

    run(`INSERT INTO products (id, sku, name, category, price, cost, tax_rate, description, parent_id, variant_attributes, is_variant, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [
        id,
        variantSku,
        variantName,
        parent.category,
        price ?? parent.price,
        cost ?? parent.cost,
        parent.tax_rate,
        parent.description,
        req.params.id,
        variant_attributes ? JSON.stringify(variant_attributes) : null
      ]
    );

    // Create inventory record
    const qty = parseInt(quantity) || 0;
    run('INSERT INTO inventory (id, product_id, quantity, min_quantity, location) VALUES (?, ?, ?, 0, ?)',
      [uuidv4(), id, qty, 'main']
    );

    console.log(`[Inventory] Created variant ${variantSku} for parent ${parent.sku}`);
    res.json({ success: true, variant: { id, sku: variantSku, name: variantName } });
  } catch (err) {
    console.error('[Inventory] Variant create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// AI EXTRACTION API
// ============================================

// Extract inventory data from image/document
app.post('/api/inventory/extract', async (req, res) => {
  try {
    const {
      image_base64,
      mime_type,
      mode = 'local',
      ocr_text,
      api_config,
      session_id
    } = req.body;

    if (!image_base64 && !ocr_text) {
      return res.status(400).json({ success: false, error: 'image_base64 or ocr_text is required' });
    }

    // Get supplier template if session has one
    let supplierTemplate = null;
    if (session_id) {
      const session = get('SELECT supplier_template_id FROM ingestion_sessions WHERE id = ?', [session_id]);
      if (session?.supplier_template_id) {
        const template = get('SELECT * FROM supplier_templates WHERE id = ?', [session.supplier_template_id]);
        if (template) {
          supplierTemplate = {
            ...template,
            column_mapping: template.column_mapping ? JSON.parse(template.column_mapping) : {},
            default_values: template.default_values ? JSON.parse(template.default_values) : {},
          };
        }
      }
    }

    const result = await extractInventoryData({
      imageBase64: image_base64,
      mimeType: mime_type || 'image/jpeg',
      mode,
      ocrText: ocr_text,
      apiConfig: api_config,
      supplierTemplate,
      sessionId: session_id
    });

    if (result.success) {
      // Add confidence to each product if not present
      const products = (result.data.products || []).map(p => ({
        ...p,
        confidence: p.confidence || (mode === 'cloud' ? 'high' : 'low')
      }));

      res.json({
        success: true,
        products,
        supplier_detected: result.data.supplier_detected,
        document_type: result.data.document_type,
        extraction_notes: result.data.extraction_notes,
        method: result.method,
        confidence: result.confidence
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        products: []
      });
    }
  } catch (err) {
    console.error('[Inventory] AI extraction error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get AI usage statistics
app.get('/api/inventory/ai-usage', (req, res) => {
  try {
    const stats = getAIUsageStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// DUPLICATE DETECTION & HANDLING
// ============================================

// Detect duplicates in a session before committing
app.get('/api/inventory/sessions/:id/duplicates', (req, res) => {
  try {
    const session = get('SELECT * FROM ingestion_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const mappedData = session.mapped_data ? JSON.parse(session.mapped_data) : [];
    const duplicates = [];

    for (let i = 0; i < mappedData.length; i++) {
      const row = mappedData[i];
      const sku = row.sku?.trim();
      
      if (!sku) continue;

      // Check if SKU exists in products
      const existing = get(`
        SELECT p.id, p.sku, p.name, p.price, p.cost, p.category,
               COALESCE(i.quantity, 0) as quantity
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        WHERE p.sku = ? AND p.active = 1
      `, [sku]);

      if (existing) {
        // Determine suggested action
        let suggestedAction = 'skip';
        
        // If quantities differ significantly or new data has more info, suggest merge
        if (row.quantity > 0 || row.price !== existing.price) {
          suggestedAction = 'merge';
        }
        
        // If variant attributes present, suggest create variant
        if (row.variant_attributes || row.is_variant) {
          suggestedAction = 'create_variant';
        }

        duplicates.push({
          rowIndex: i,
          existingSku: existing.sku,
          existingProduct: existing,
          newData: row,
          suggestedAction,
          priceDiff: row.price ? (row.price - existing.price) : null,
          qtyDiff: row.quantity ? (row.quantity - existing.quantity) : null
        });
      }
    }

    res.json({ 
      success: true, 
      duplicates,
      totalRows: mappedData.length,
      duplicateCount: duplicates.length,
      uniqueCount: mappedData.length - duplicates.length
    });
  } catch (err) {
    console.error('[Inventory] Duplicate detection error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Handle duplicate resolution for a session
app.post('/api/inventory/sessions/:id/resolve-duplicates', (req, res) => {
  try {
    const session = get('SELECT * FROM ingestion_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const { strategy, resolutions } = req.body;
    // strategy: 'merge_all' | 'skip_all' | 'variant_all' | 'custom'
    // resolutions: [{rowIndex: number, action: 'merge'|'skip'|'create_variant'}] (for custom)

    const mappedData = session.mapped_data ? JSON.parse(session.mapped_data) : [];
    const now = new Date().toISOString();

    if (strategy === 'skip_all') {
      // Remove all duplicate rows
      const skuSet = new Set();
      const existingSkus = query('SELECT sku FROM products WHERE active = 1').map(p => p.sku);
      existingSkus.forEach(sku => skuSet.add(sku));
      
      const filtered = mappedData.filter(row => !row.sku || !skuSet.has(row.sku.trim()));
      run('UPDATE ingestion_sessions SET mapped_data = ?, updated_at = ? WHERE id = ?', 
        [JSON.stringify(filtered), now, req.params.id]);
      
      res.json({ success: true, removed: mappedData.length - filtered.length, remaining: filtered.length });
      return;
    }

    if (strategy === 'variant_all') {
      // Add variant suffix to all duplicate SKUs
      const skuSet = new Set();
      const existingSkus = query('SELECT sku FROM products WHERE active = 1').map(p => p.sku);
      existingSkus.forEach(sku => skuSet.add(sku));
      
      const updated = mappedData.map(row => {
        if (row.sku && skuSet.has(row.sku.trim())) {
          return { 
            ...row, 
            sku: `${row.sku}-VAR-${Date.now().toString(36)}`,
            is_variant: true
          };
        }
        return row;
      });
      
      run('UPDATE ingestion_sessions SET mapped_data = ?, updated_at = ? WHERE id = ?', 
        [JSON.stringify(updated), now, req.params.id]);
      
      res.json({ success: true, message: 'Duplicate SKUs renamed as variants' });
      return;
    }

    if (strategy === 'custom' && Array.isArray(resolutions)) {
      // Apply custom resolutions
      const skipIndices = new Set();
      const updated = [...mappedData];

      for (const resolution of resolutions) {
        const { rowIndex, action } = resolution;
        if (rowIndex < 0 || rowIndex >= mappedData.length) continue;

        if (action === 'skip') {
          skipIndices.add(rowIndex);
        } else if (action === 'create_variant') {
          if (updated[rowIndex].sku) {
            updated[rowIndex] = {
              ...updated[rowIndex],
              sku: `${updated[rowIndex].sku}-VAR-${Date.now().toString(36)}`,
              is_variant: true
            };
          }
        }
        // For 'merge', we keep the row as-is and let commit handle the upsert
      }

      const filtered = updated.filter((_, i) => !skipIndices.has(i));
      run('UPDATE ingestion_sessions SET mapped_data = ?, updated_at = ? WHERE id = ?', 
        [JSON.stringify(filtered), now, req.params.id]);
      
      res.json({ success: true, removed: skipIndices.size, remaining: filtered.length });
      return;
    }

    // Default: merge_all - do nothing, commit will handle with upsert
    res.json({ success: true, message: 'Ready for merge (upsert) on commit' });
  } catch (err) {
    console.error('[Inventory] Duplicate resolution error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// DEFAULT TEMPLATES SEEDING
// ============================================

// Seed default templates for new users
app.post('/api/inventory/templates/seed-defaults', (req, res) => {
  try {
    // Check if user already has templates
    const existingCount = query('SELECT COUNT(*) as count FROM supplier_templates')[0]?.count || 0;
    
    if (existingCount > 0) {
      return res.json({ success: true, message: 'Templates already exist', seeded: 0 });
    }

    const defaultTemplates = [
      {
        id: uuidv4(),
        supplier_name: 'Clothing Supplier Template',
        column_mapping: JSON.stringify({
          'Style': 'sku',
          'Style Code': 'sku',
          'Color': 'category',
          'Size': 'variant_attributes.size',
          'Price': 'price',
          'Cost': 'cost',
          'Qty': 'quantity',
          'Quantity': 'quantity',
          'Description': 'description',
          'Barcode': 'barcode'
        }),
        default_values: JSON.stringify({ tax_rate: 12, category: 'Clothing' }),
        filename_pattern: '*clothing*,*apparel*,*fashion*',
        header_pattern: JSON.stringify(['style', 'color', 'size', 'price', 'qty'])
      },
      {
        id: uuidv4(),
        supplier_name: 'Electronics Wholesale',
        column_mapping: JSON.stringify({
          'SKU': 'sku',
          'Part Number': 'sku',
          'IMEI': 'barcode',
          'Serial': 'barcode',
          'Warranty': 'description',
          'Warranty Months': 'description',
          'Cost': 'cost',
          'Price': 'price',
          'MRP': 'price',
          'Stock': 'quantity',
          'Name': 'name',
          'Model': 'name'
        }),
        default_values: JSON.stringify({ tax_rate: 18, category: 'Electronics' }),
        filename_pattern: '*electronic*,*gadget*,*tech*',
        header_pattern: JSON.stringify(['sku', 'imei', 'warranty', 'cost', 'stock'])
      },
      {
        id: uuidv4(),
        supplier_name: 'Generic Import',
        column_mapping: JSON.stringify({
          'Name': 'name',
          'Product Name': 'name',
          'Item': 'name',
          'Description': 'description',
          'Desc': 'description',
          'Price': 'price',
          'Rate': 'price',
          'Amount': 'price',
          'Quantity': 'quantity',
          'Qty': 'quantity',
          'Stock': 'quantity',
          'SKU': 'sku',
          'Code': 'sku',
          'Item Code': 'sku',
          'Category': 'category',
          'Type': 'category'
        }),
        default_values: JSON.stringify({ tax_rate: 5, category: 'General' }),
        filename_pattern: null,
        header_pattern: JSON.stringify(['name', 'price', 'quantity'])
      }
    ];

    for (const template of defaultTemplates) {
      run(`INSERT INTO supplier_templates (id, supplier_name, column_mapping, default_values, filename_pattern, header_pattern, use_count, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1.0)`,
        [template.id, template.supplier_name, template.column_mapping, template.default_values, template.filename_pattern, template.header_pattern]
      );
    }

    console.log(`[Inventory] Seeded ${defaultTemplates.length} default templates`);
    res.json({ success: true, seeded: defaultTemplates.length });
  } catch (err) {
    console.error('[Inventory] Template seeding error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// MAINTENANCE ENDPOINTS
// ============================================

// Trigger maintenance (admin endpoint)
app.post('/api/inventory/maintenance/run', (req, res) => {
  try {
    // Lazy load maintenance module
    const maintenance = require('../shared/maintenance');
    const summary = maintenance.runFullMaintenance();
    res.json({ success: true, summary });
  } catch (err) {
    console.error('[Inventory] Maintenance error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get database statistics
app.get('/api/inventory/stats', (req, res) => {
  try {
    const maintenance = require('../shared/maintenance');
    const stats = maintenance.getDatabaseStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'inventory_management', status: 'running', ui: 'not built' });
});

// Initialize DB then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[Inventory Management] Running on http://localhost:${PORT}`);
    console.log(`[Inventory Management] Mode: Max Lite (SQLite)`);
    
    // Start scheduled maintenance
    try {
      const maintenance = require('../shared/maintenance');
      maintenance.startScheduledMaintenance();
    } catch (e) {
      console.log('[Inventory Management] Maintenance module not loaded:', e.message);
    }
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
