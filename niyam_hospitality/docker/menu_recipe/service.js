// Menu & Recipe Management Service - Niyam Hospitality
// Handles menu items, recipes, ingredients, and costing

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'menu_recipe';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// MENU CATEGORIES
// ============================================

app.get('/categories', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT c.*, COUNT(m.id) as item_count
      FROM restaurant_menu_categories c
      LEFT JOIN restaurant_menu_items m ON c.id = m.category_id
      WHERE c.tenant_id = $1
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `, [tenantId]);
    
    res.json({ success: true, categories: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/categories', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description, sort_order } = req.body;
    
    const result = await query(`
      INSERT INTO restaurant_menu_categories (tenant_id, name, description, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [tenantId, name, description, sort_order || 0]);
    
    res.json({ success: true, category: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// MENU ITEMS
// ============================================

app.get('/items', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { category_id, available, search } = req.query;
    
    let sql = `
      SELECT m.*, c.name as category_name
      FROM restaurant_menu_items m
      LEFT JOIN restaurant_menu_categories c ON m.category_id = c.id
      WHERE m.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (category_id) {
      sql += ` AND m.category_id = $${paramIdx++}`;
      params.push(category_id);
    }
    if (available === 'true') {
      sql += ' AND m.is_available = true';
    }
    if (search) {
      sql += ` AND (m.name ILIKE $${paramIdx++} OR m.description ILIKE $${paramIdx - 1})`;
      params.push(`%${search}%`);
    }
    
    sql += ' ORDER BY c.sort_order, m.name';
    
    const result = await query(sql, params);
    res.json({ success: true, items: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/items/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      SELECT m.*, c.name as category_name
      FROM restaurant_menu_items m
      LEFT JOIN restaurant_menu_categories c ON m.category_id = c.id
      WHERE m.id = $1 AND m.tenant_id = $2
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const MenuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  cost_price: z.number().optional(),
  category_id: z.string().uuid().optional(),
  is_veg: z.boolean().default(true),
  is_vegan: z.boolean().default(false),
  is_gluten_free: z.boolean().default(false),
  preparation_time_minutes: z.number().default(15),
  calories: z.number().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.string(),
    unit: z.string().optional()
  })).optional(),
  printer_station: z.string().default('kitchen')
});

app.post('/items', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = MenuItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO restaurant_menu_items 
      (tenant_id, name, description, price, cost_price, category_id, is_veg, is_vegan, 
       is_gluten_free, preparation_time_minutes, calories, ingredients, printer_station)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [tenantId, data.name, data.description, data.price, data.cost_price, data.category_id,
        data.is_veg, data.is_vegan, data.is_gluten_free, data.preparation_time_minutes,
        data.calories, JSON.stringify(data.ingredients || []), data.printer_station]);
    
    await publishEnvelope('hospitality.menu.item_created.v1', 1, {
      item_id: result.rows[0].id,
      name: data.name
    });
    
    res.json({ success: true, item: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/items/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = ['name', 'description', 'price', 'cost_price', 'category_id', 
      'is_veg', 'is_vegan', 'is_gluten_free', 'is_available', 'preparation_time_minutes',
      'calories', 'ingredients', 'printer_station'];
    
    const fields = [];
    const values = [id, tenantId];
    let paramIdx = 3;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramIdx++}`);
        values.push(key === 'ingredients' ? JSON.stringify(value) : value);
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const result = await query(`
      UPDATE restaurant_menu_items 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 86 an item (mark as unavailable)
app.post('/items/:id/86', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_menu_items 
      SET is_available = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, name
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    await publishEnvelope('hospitality.menu.item_86d.v1', 1, {
      item_id: id,
      name: result.rows[0].name
    });
    
    res.json({ success: true, message: `${result.rows[0].name} marked as 86'd (unavailable)` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Un-86 an item
app.post('/items/:id/available', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_menu_items 
      SET is_available = true, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, name
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ success: true, message: `${result.rows[0].name} is now available` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// RECIPES & COSTING
// ============================================

app.get('/items/:id/recipe', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      SELECT id, name, price, cost_price, ingredients, preparation_time_minutes
      FROM restaurant_menu_items
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = result.rows[0];
    const costPrice = parseFloat(item.cost_price) || 0;
    const sellingPrice = parseFloat(item.price);
    const foodCostPercentage = sellingPrice > 0 ? (costPrice / sellingPrice * 100).toFixed(1) : 0;
    const grossMargin = sellingPrice - costPrice;
    
    res.json({
      success: true,
      recipe: {
        id: item.id,
        name: item.name,
        ingredients: item.ingredients || [],
        preparation_time: item.preparation_time_minutes,
        costing: {
          cost_price: costPrice,
          selling_price: sellingPrice,
          food_cost_percentage: parseFloat(foodCostPercentage),
          gross_margin: grossMargin,
          margin_percentage: sellingPrice > 0 ? ((grossMargin / sellingPrice) * 100).toFixed(1) : 0
        }
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/items/:id/recipe', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { ingredients, cost_price, preparation_time_minutes } = req.body;
    
    const fields = [];
    const values = [id, tenantId];
    let paramIdx = 3;
    
    if (ingredients) {
      fields.push(`ingredients = $${paramIdx++}`);
      values.push(JSON.stringify(ingredients));
    }
    if (cost_price !== undefined) {
      fields.push(`cost_price = $${paramIdx++}`);
      values.push(cost_price);
    }
    if (preparation_time_minutes) {
      fields.push(`preparation_time_minutes = $${paramIdx++}`);
      values.push(preparation_time_minutes);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await query(`
      UPDATE restaurant_menu_items 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// MENU ANALYSIS
// ============================================

app.get('/analysis', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const [itemsRes, salesRes] = await Promise.all([
      query(`
        SELECT id, name, price, cost_price, is_available
        FROM restaurant_menu_items
        WHERE tenant_id = $1
      `, [tenantId]),
      query(`
        SELECT menu_item_id, SUM(quantity) as total_sold, SUM(total_price) as revenue
        FROM restaurant_order_items
        WHERE tenant_id = $1
        GROUP BY menu_item_id
      `, [tenantId])
    ]);
    
    const salesMap = new Map();
    salesRes.rows.forEach(s => salesMap.set(s.menu_item_id, s));
    
    const analysis = itemsRes.rows.map(item => {
      const sales = salesMap.get(item.id) || { total_sold: 0, revenue: 0 };
      const costPrice = parseFloat(item.cost_price) || 0;
      const price = parseFloat(item.price);
      const margin = price - costPrice;
      const marginPercent = price > 0 ? (margin / price * 100) : 0;
      
      return {
        id: item.id,
        name: item.name,
        price,
        cost_price: costPrice,
        margin,
        margin_percent: marginPercent.toFixed(1),
        total_sold: parseInt(sales.total_sold),
        revenue: parseFloat(sales.revenue),
        is_available: item.is_available
      };
    });
    
    // Sort by revenue
    analysis.sort((a, b) => b.revenue - a.revenue);
    
    res.json({
      success: true,
      analysis: {
        items: analysis,
        summary: {
          total_items: analysis.length,
          available_items: analysis.filter(a => a.is_available).length,
          avg_margin: (analysis.reduce((sum, a) => sum + parseFloat(a.margin_percent), 0) / analysis.length).toFixed(1),
          top_seller: analysis[0]?.name || 'N/A',
          total_revenue: analysis.reduce((sum, a) => sum + a.revenue, 0)
        }
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8915;
app.listen(PORT, () => {
  console.log(`✅ Menu & Recipe Service listening on ${PORT}`);
});
