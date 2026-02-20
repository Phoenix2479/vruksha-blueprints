const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8840;
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// DB Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Ensure Tables Exist
(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        po_number TEXT NOT NULL,
        supplier_id UUID NOT NULL,
        location_id UUID NOT NULL,
        status TEXT DEFAULT 'draft',
        expected_date TIMESTAMP,
        items JSONB DEFAULT '[]',
        total_cost NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS supplier_ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        supplier_id UUID NOT NULL,
        po_id UUID,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comments TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Procurement: Tables initialized');
  } catch (err) {
    console.error('❌ Procurement: Table init failed', err);
  } finally {
    client.release();
  }
})();

// NATS (Simple Mock for now if wrapper missing, else use real)
const publishEvent = async (subject, data) => {
  console.log(`[NATS] Publishing to ${subject}:`, JSON.stringify(data));
  // In real impl: nats.publish(subject, JSON.stringify(data));
};

function getTenantId(req) {
  return req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
}

// --- ROUTES ---

// 1. Create Purchase Order
const POSchema = z.object({
  supplier_id: z.string().uuid(),
  location_id: z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit_cost: z.number().nonnegative()
  })),
  expected_date: z.string().optional()
});

app.post('/purchase-orders', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { supplier_id, location_id, items, expected_date } = POSchema.parse(req.body);
    
    const poNumber = `PO-${Date.now()}`;
    const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

    const result = await pool.query(
      `INSERT INTO purchase_orders 
       (tenant_id, po_number, supplier_id, store_id, location_id, items, total, subtotal, expected_delivery_date)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $6, $7)
       RETURNING *`,
      [tenantId, poNumber, supplier_id, location_id, JSON.stringify(items), totalCost, expected_date || null]
    );

    const po = result.rows[0];
    await publishEvent('retail.procurement.po.created.v1', { po_id: po.id, po_number: poNumber, total_cost: totalCost });
    
    res.json({ success: true, po });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

// 2. Receive Shipment
app.post('/purchase-orders/:id/receive', async (req, res) => {
  try {
    const { id } = req.params;
    const { items_received } = req.body; // Array of { product_id, quantity, condition }
    
    // Update PO status
    const result = await pool.query(
      `UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'PO not found' });

    // Publish event for Inventory Service to consume
    await publishEvent('retail.procurement.shipment.received.v1', {
      po_id: id,
      location_id: result.rows[0].location_id || result.rows[0].store_id,
      items: items_received
    });

    res.json({ success: true, message: 'Shipment received and inventory update triggered' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Rate Supplier
app.post('/suppliers/:id/rate', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { rating, po_id, comments } = req.body;

    await pool.query(
      `INSERT INTO supplier_ratings (tenant_id, supplier_id, po_id, rating, comments)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, id, po_id, rating, comments]
    );

    res.json({ success: true, message: 'Rating recorded' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Calculate Landed Cost
app.post('/purchase-orders/:id/landed-cost', async (req, res) => {
  try {
    const { id } = req.params;
    const { freight, duties, handling } = req.body; // Costs

    const poRes = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    if (poRes.rows.length === 0) return res.status(404).json({ error: 'PO not found' });
    const po = poRes.rows[0];

    const totalProductCost = parseFloat(po.total || po.subtotal || po.total_cost || 0);
    const totalLanded = totalProductCost + (freight||0) + (duties||0) + (handling||0);
    const factor = totalProductCost > 0 ? totalLanded / totalProductCost : 1;

    // Distribute cost to items
    const itemsWithCost = po.items.map(item => ({
      ...item,
      landed_unit_cost: item.unit_cost * factor
    }));

    res.json({ success: true, total_landed_cost: totalLanded, items: itemsWithCost });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'procurement' });
});


// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`✅ Procurement service listening on port ${PORT}`);
});
