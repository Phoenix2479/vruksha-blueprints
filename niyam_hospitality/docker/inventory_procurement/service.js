// Inventory & Procurement Service - Niyam Hospitality
// Manages F&B inventory, stock levels, purchase orders, and suppliers

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
const SERVICE_NAME = 'inventory_procurement';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// In-memory inventory (would be a DB table in production)
const inventoryItems = new Map();
const purchaseOrders = new Map();
const suppliers = new Map();
let poCounter = 1000;

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
    
    // Initialize with sample data
    initializeSampleData();
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

function initializeSampleData() {
  const tenantId = DEFAULT_TENANT_ID;
  
  // Sample inventory items
  const items = [
    { id: 'inv-1', name: 'Tomatoes', category: 'vegetables', unit: 'kg', quantity: 25, reorder_level: 10, cost_per_unit: 2.5 },
    { id: 'inv-2', name: 'Onions', category: 'vegetables', unit: 'kg', quantity: 30, reorder_level: 15, cost_per_unit: 1.5 },
    { id: 'inv-3', name: 'Chicken Breast', category: 'meat', unit: 'kg', quantity: 15, reorder_level: 8, cost_per_unit: 12 },
    { id: 'inv-4', name: 'Olive Oil', category: 'pantry', unit: 'liter', quantity: 8, reorder_level: 5, cost_per_unit: 15 },
    { id: 'inv-5', name: 'Rice', category: 'pantry', unit: 'kg', quantity: 50, reorder_level: 20, cost_per_unit: 3 },
    { id: 'inv-6', name: 'Wine (House Red)', category: 'beverages', unit: 'bottle', quantity: 24, reorder_level: 12, cost_per_unit: 18 },
    { id: 'inv-7', name: 'Milk', category: 'dairy', unit: 'liter', quantity: 20, reorder_level: 10, cost_per_unit: 2 },
    { id: 'inv-8', name: 'Eggs', category: 'dairy', unit: 'dozen', quantity: 10, reorder_level: 5, cost_per_unit: 4 }
  ];
  
  items.forEach(item => {
    inventoryItems.set(item.id, { ...item, tenant_id: tenantId, updated_at: new Date().toISOString() });
  });
  
  // Sample suppliers
  const sampleSuppliers = [
    { id: 'sup-1', name: 'Fresh Farms Co.', category: 'vegetables', contact: 'John', phone: '555-0101', email: 'orders@freshfarms.com' },
    { id: 'sup-2', name: 'Prime Meats Ltd.', category: 'meat', contact: 'Sarah', phone: '555-0102', email: 'orders@primemeats.com' },
    { id: 'sup-3', name: 'Beverage Distributors', category: 'beverages', contact: 'Mike', phone: '555-0103', email: 'sales@bevdist.com' }
  ];
  
  sampleSuppliers.forEach(s => {
    suppliers.set(s.id, { ...s, tenant_id: tenantId, status: 'active' });
  });
}

// ============================================
// INVENTORY
// ============================================

app.get('/inventory', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { category, low_stock } = req.query;
    
    let items = Array.from(inventoryItems.values())
      .filter(i => i.tenant_id === tenantId);
    
    if (category) {
      items = items.filter(i => i.category === category);
    }
    if (low_stock === 'true') {
      items = items.filter(i => i.quantity <= i.reorder_level);
    }
    
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/inventory/:id', async (req, res) => {
  try {
    const item = inventoryItems.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const InventorySchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  unit: z.string(),
  quantity: z.number().min(0),
  reorder_level: z.number().min(0),
  cost_per_unit: z.number().min(0)
});

app.post('/inventory', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = InventorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const id = `inv-${Date.now()}`;
    const item = {
      id,
      tenant_id: tenantId,
      ...parsed.data,
      updated_at: new Date().toISOString()
    };
    
    inventoryItems.set(id, item);
    
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/inventory/:id', async (req, res) => {
  try {
    const item = inventoryItems.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    const { quantity, reorder_level, cost_per_unit } = req.body;
    
    if (quantity !== undefined) item.quantity = quantity;
    if (reorder_level !== undefined) item.reorder_level = reorder_level;
    if (cost_per_unit !== undefined) item.cost_per_unit = cost_per_unit;
    item.updated_at = new Date().toISOString();
    
    inventoryItems.set(req.params.id, item);
    
    // Check if low stock alert needed
    if (item.quantity <= item.reorder_level) {
      await publishEnvelope('hospitality.inventory.low_stock.v1', 1, {
        item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        reorder_level: item.reorder_level
      });
    }
    
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stock adjustment (add/remove)
app.post('/inventory/:id/adjust', async (req, res) => {
  try {
    const item = inventoryItems.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    const { adjustment, reason } = req.body; // adjustment can be positive or negative
    
    const oldQuantity = item.quantity;
    item.quantity = Math.max(0, item.quantity + adjustment);
    item.updated_at = new Date().toISOString();
    
    inventoryItems.set(req.params.id, item);
    
    await publishEnvelope('hospitality.inventory.adjusted.v1', 1, {
      item_id: item.id,
      name: item.name,
      old_quantity: oldQuantity,
      new_quantity: item.quantity,
      adjustment,
      reason
    });
    
    res.json({
      success: true,
      item,
      adjustment: {
        previous: oldQuantity,
        change: adjustment,
        current: item.quantity,
        reason
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PURCHASE ORDERS
// ============================================

app.get('/purchase-orders', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, supplier_id } = req.query;
    
    let orders = Array.from(purchaseOrders.values())
      .filter(o => o.tenant_id === tenantId);
    
    if (status) orders = orders.filter(o => o.status === status);
    if (supplier_id) orders = orders.filter(o => o.supplier_id === supplier_id);
    
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({ success: true, orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const POSchema = z.object({
  supplier_id: z.string(),
  items: z.array(z.object({
    inventory_id: z.string(),
    name: z.string(),
    quantity: z.number().min(1),
    unit_cost: z.number().min(0)
  })),
  expected_delivery: z.string().optional(),
  notes: z.string().optional()
});

app.post('/purchase-orders', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = POSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const poId = `PO-${++poCounter}`;
    
    const total = data.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
    const supplier = suppliers.get(data.supplier_id);
    
    const po = {
      id: poId,
      tenant_id: tenantId,
      supplier_id: data.supplier_id,
      supplier_name: supplier?.name || 'Unknown',
      items: data.items,
      total_amount: total,
      status: 'pending',
      expected_delivery: data.expected_delivery,
      notes: data.notes,
      created_at: new Date().toISOString()
    };
    
    purchaseOrders.set(poId, po);
    
    await publishEnvelope('hospitality.procurement.po_created.v1', 1, {
      po_id: poId,
      supplier_id: data.supplier_id,
      total: total
    });
    
    res.json({ success: true, purchase_order: po });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/purchase-orders/:id', async (req, res) => {
  try {
    const po = purchaseOrders.get(req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    
    const { status } = req.body; // pending, approved, ordered, received, cancelled
    
    const oldStatus = po.status;
    po.status = status;
    po.updated_at = new Date().toISOString();
    
    // If received, update inventory
    if (status === 'received' && oldStatus !== 'received') {
      for (const item of po.items) {
        const invItem = inventoryItems.get(item.inventory_id);
        if (invItem) {
          invItem.quantity += item.quantity;
          invItem.updated_at = new Date().toISOString();
          inventoryItems.set(item.inventory_id, invItem);
        }
      }
      po.received_at = new Date().toISOString();
    }
    
    purchaseOrders.set(req.params.id, po);
    
    await publishEnvelope('hospitality.procurement.po_updated.v1', 1, {
      po_id: req.params.id,
      old_status: oldStatus,
      new_status: status
    });
    
    res.json({ success: true, purchase_order: po });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SUPPLIERS
// ============================================

app.get('/suppliers', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const supplierList = Array.from(suppliers.values())
      .filter(s => s.tenant_id === tenantId);
    res.json({ success: true, suppliers: supplierList });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/suppliers', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, category, contact, phone, email, address } = req.body;
    
    const id = `sup-${Date.now()}`;
    const supplier = {
      id,
      tenant_id: tenantId,
      name,
      category,
      contact,
      phone,
      email,
      address,
      status: 'active',
      created_at: new Date().toISOString()
    };
    
    suppliers.set(id, supplier);
    
    res.json({ success: true, supplier });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// REPORTS
// ============================================

app.get('/reports/stock-value', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const items = Array.from(inventoryItems.values())
      .filter(i => i.tenant_id === tenantId);
    
    const byCategory = {};
    let totalValue = 0;
    
    items.forEach(item => {
      const value = item.quantity * item.cost_per_unit;
      totalValue += value;
      
      if (!byCategory[item.category]) {
        byCategory[item.category] = { items: 0, value: 0 };
      }
      byCategory[item.category].items++;
      byCategory[item.category].value += value;
    });
    
    res.json({
      success: true,
      report: {
        total_items: items.length,
        total_value: totalValue,
        by_category: byCategory,
        low_stock_count: items.filter(i => i.quantity <= i.reorder_level).length
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/reports/reorder', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const items = Array.from(inventoryItems.values())
      .filter(i => i.tenant_id === tenantId && i.quantity <= i.reorder_level);
    
    const reorderList = items.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      current_quantity: item.quantity,
      reorder_level: item.reorder_level,
      suggested_order: item.reorder_level * 2 - item.quantity,
      estimated_cost: (item.reorder_level * 2 - item.quantity) * item.cost_per_unit
    }));
    
    res.json({
      success: true,
      reorder_list: reorderList,
      total_estimated_cost: reorderList.reduce((sum, item) => sum + item.estimated_cost, 0)
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

const PORT = process.env.PORT || 8917;
app.listen(PORT, () => {
  console.log(`✅ Inventory & Procurement Service listening on ${PORT}`);
});
