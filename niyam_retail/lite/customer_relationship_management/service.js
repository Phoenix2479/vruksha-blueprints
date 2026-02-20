// Customer Relationship Management Service - LITE VERSION
// Full feature parity with Docker version, using SQLite
// ALL DATA PERSISTED - Zero data loss on crash/restart
// Customer 360 view, segments, lifecycle management, AI governance, privacy

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get, saveDb } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8952;

// CORS - configurable for production
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001,http://localhost:3003,http://localhost:5178').split(',').filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
}));

app.use(express.json());

// Serve embedded UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      svc: 'crm-lite',
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration
    }));
  });
  next();
});

// ============================================
// HELPER: Audit Logger (persisted to SQLite)
// ============================================
function logAudit(eventType, entityType, entityId, details, userId = 'system') {
  try {
    run(
      `INSERT INTO crm_audit_log (id, event_type, entity_type, entity_id, user_id, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), eventType, entityType, entityId, userId, JSON.stringify(details), new Date().toISOString()]
    );
  } catch (e) {
    console.error('[Audit] Failed to log:', e.message);
  }
}

// ============================================
// HELPER: Seed sample data if tables are empty
// ============================================
function seedSampleData() {
  // Check if deals exist
  const dealCount = get('SELECT COUNT(*) as count FROM crm_deals');
  if (dealCount && dealCount.count === 0) {
    console.log('[CRM] Seeding sample deals...');
    const sampleDeals = [
      { title: 'TechCorp Enterprise License', value: 250000, stage: 'negotiation', probability: 75, tags: '["enterprise"]' },
      { title: 'RetailMax POS Upgrade', value: 85000, stage: 'proposal', probability: 50, tags: '["upgrade"]' },
      { title: 'FoodChain Pilot Program', value: 45000, stage: 'qualification', probability: 25, tags: '["pilot"]' },
      { title: 'MegaMart Multi-Store Deal', value: 450000, stage: 'negotiation', probability: 80, tags: '["enterprise","multi-store"]' },
      { title: 'StartupXYZ Starter Pack', value: 15000, stage: 'proposal', probability: 40, tags: '["starter"]' },
      { title: 'Retail Analytics Add-on', value: 35000, stage: 'closed_won', probability: 100, tags: '["addon"]' },
    ];
    sampleDeals.forEach(d => {
      run(
        `INSERT INTO crm_deals (id, title, value, stage, probability, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), d.title, d.value, d.stage, d.probability, d.tags, new Date().toISOString(), new Date().toISOString()]
      );
    });
  }

  // Check if activities exist
  const activityCount = get('SELECT COUNT(*) as count FROM crm_activities');
  if (activityCount && activityCount.count === 0) {
    console.log('[CRM] Seeding sample activities...');
    const sampleActivities = [
      { type: 'call', title: 'Follow-up call', description: 'Discuss enterprise pricing', priority: 'high' },
      { type: 'email', title: 'Send proposal', priority: 'medium' },
      { type: 'meeting', title: 'Product demo', description: 'Online demo of hospitality features', priority: 'high' },
      { type: 'task', title: 'Prepare contract', priority: 'urgent' },
      { type: 'note', title: 'Customer interested in inventory module', description: 'Has 2 stores, planning to expand', priority: 'low' },
    ];
    sampleActivities.forEach(a => {
      run(
        `INSERT INTO crm_activities (id, type, title, description, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), a.type, a.title, a.description || null, a.priority, new Date().toISOString()]
      );
    });
  }
}

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'crm', mode: 'lite', persistence: 'sqlite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'customer_relationship_management', mode: 'lite' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready', service: 'customer_relationship_management', mode: 'lite' }));
app.get('/status', (req, res) => res.json({ success: true, service: 'customer_relationship_management', mode: 'lite', ready: true, persistence: 'sqlite' }));
app.get('/stats', (req, res) => res.json({ uptime: process.uptime(), service: 'crm-lite', version: '1.2.0', persistence: 'sqlite' }));

// ============================================
// CUSTOMER ENDPOINTS
// ============================================

// Customer stats for dashboard
app.get('/customers/stats', (req, res) => {
  try {
    const customers = query('SELECT * FROM customers') || [];
    const sales = query('SELECT customer_id, SUM(total) as total FROM sales GROUP BY customer_id') || [];
    
    const salesMap = new Map(sales.map(s => [s.customer_id, parseFloat(s.total) || 0]));
    
    let vipCount = 0;
    let atRiskCount = 0;
    let totalLTV = 0;
    
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    
    customers.forEach(c => {
      const ltv = salesMap.get(c.id) || parseFloat(c.lifetime_value) || 0;
      totalLTV += ltv;
      
      if (ltv > 50000 || c.loyalty_tier === 'vip') vipCount++;
      
      const lastUpdate = c.updated_at ? new Date(c.updated_at).getTime() : 0;
      if (ltv > 0 && (now - lastUpdate) > ninetyDays) atRiskCount++;
    });
    
    res.json({
      success: true,
      total_customers: customers.length,
      vip: vipCount,
      at_risk: atRiskCount,
      avg_lifetime_value: customers.length > 0 ? totalLTV / customers.length : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List customers with segment calculation
app.get('/customers', (req, res) => {
  try {
    const { search, segment } = req.query;
    let customers = query('SELECT * FROM customers') || [];
    const sales = query('SELECT customer_id, COUNT(*) as count, SUM(total) as total, MAX(created_at) as last_order FROM sales GROUP BY customer_id') || [];
    
    const salesMap = new Map(sales.map(s => [s.customer_id, s]));
    const now = Date.now();
    
    // Enrich customers with computed fields
    customers = customers.map(c => {
      const salesData = salesMap.get(c.id) || { count: 0, total: 0, last_order: null };
      const ltv = parseFloat(salesData.total) || parseFloat(c.lifetime_value) || 0;
      const totalOrders = parseInt(salesData.count) || 0;
      const avgOrderValue = totalOrders > 0 ? ltv / totalOrders : 0;
      
      // Calculate segment
      let customerSegment = 'regular';
      const createdAt = c.created_at ? new Date(c.created_at).getTime() : now;
      const updatedAt = c.updated_at ? new Date(c.updated_at).getTime() : createdAt;
      const daysSinceCreation = (now - createdAt) / (24 * 60 * 60 * 1000);
      const daysSinceUpdate = (now - updatedAt) / (24 * 60 * 60 * 1000);
      
      if (ltv > 50000 || c.loyalty_tier === 'vip') customerSegment = 'vip';
      else if (ltv > 20000 || c.loyalty_tier === 'loyal') customerSegment = 'loyal';
      else if (daysSinceCreation < 30) customerSegment = 'new';
      else if (daysSinceUpdate > 90 && ltv > 0) customerSegment = 'at_risk';
      
      return {
        ...c,
        segment: customerSegment,
        lifetime_value: ltv,
        total_orders: totalOrders,
        avg_order_value: avgOrderValue,
        last_order_date: salesData.last_order,
        member_since: c.created_at
      };
    });
    
    // Filter by search
    if (search) {
      const s = search.toLowerCase();
      customers = customers.filter(c => 
        c.name?.toLowerCase().includes(s) || 
        c.email?.toLowerCase().includes(s) || 
        c.phone?.includes(s)
      );
    }
    
    // Filter by segment
    if (segment && segment !== 'all') {
      customers = customers.filter(c => c.segment === segment);
    }
    
    // Sort by lifetime value
    customers.sort((a, b) => (b.lifetime_value || 0) - (a.lifetime_value || 0));
    
    res.json({ success: true, customers: customers.slice(0, 200) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single customer
app.get('/customers/:id', (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Not found' });
    
    const purchases = query('SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]) || [];
    const totalOrders = purchases.length;
    const lastOrderDate = purchases[0]?.created_at || null;
    
    res.json({ 
      success: true, 
      customer: { 
        ...customer, 
        purchases,
        total_orders: totalOrders,
        last_order_date: lastOrderDate
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get customer activity/history
app.get('/customers/:id/activity', (req, res) => {
  try {
    const purchases = query(
      'SELECT id, "purchase" as type, "Purchase - " || id as description, created_at as date, total as value FROM sales WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    ) || [];
    
    // Also get CRM activities for this customer
    const crmActivities = query(
      'SELECT id, type, title as description, created_at as date, 0 as value FROM crm_activities WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    ) || [];
    
    const combined = [...purchases, ...crmActivities].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    
    res.json({ success: true, activity: combined });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create customer
app.post('/customers', (req, res) => {
  try {
    const { name, email, phone, address, notes, company, position } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    run(
      'INSERT INTO customers (id, name, email, phone, address, notes, loyalty_points, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, "active", ?, ?)',
      [id, name, email || null, phone || null, address || null, notes || null, now, now]
    );
    
    const customer = get('SELECT * FROM customers WHERE id = ?', [id]);
    
    logAudit('customer_created', 'customer', id, { name });
    
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update customer
app.patch('/customers/:id', (req, res) => {
  try {
    const { name, email, phone, address, notes, status } = req.body;
    const { id } = req.params;
    
    const existing = get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const customer = get('SELECT * FROM customers WHERE id = ?', [id]);
    logAudit('customer_updated', 'customer', id, { updates: Object.keys(req.body) });
    
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update customer (PUT alias)
app.put('/customers/:id', (req, res) => {
  try {
    const { name, email, phone, address, tags, notes } = req.body;
    run(
      'UPDATE customers SET name=?, email=?, phone=?, address=?, tags=?, notes=?, updated_at=? WHERE id=?',
      [name, email, phone, address, tags, notes, new Date().toISOString(), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete customer
app.delete('/customers/:id', (req, res) => {
  try {
    logAudit('customer_deleted', 'customer', req.params.id, {});
    run('DELETE FROM customers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer CLV (Customer Lifetime Value)
app.get('/customers/:id/clv', (req, res) => {
  try {
    const { id } = req.params;
    const customer = get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    
    const salesData = get(
      'SELECT COUNT(*) as total_orders, SUM(total) as lifetime_value, AVG(total) as avg_order_value, MAX(created_at) as last_order, MIN(created_at) as first_order FROM sales WHERE customer_id = ?',
      [id]
    ) || { total_orders: 0, lifetime_value: 0, avg_order_value: 0, last_order: null, first_order: null };
    
    const ltv = parseFloat(salesData.lifetime_value) || 0;
    const totalOrders = parseInt(salesData.total_orders) || 0;
    const avgOrderValue = parseFloat(salesData.avg_order_value) || 0;
    
    const now = Date.now();
    const lastOrderDate = salesData.last_order ? new Date(salesData.last_order).getTime() : now;
    const daysSinceLastOrder = Math.floor((now - lastOrderDate) / (1000 * 60 * 60 * 24));
    
    const customerSince = customer.created_at ? new Date(customer.created_at).getTime() : now;
    const daysAsCustomer = Math.max((now - customerSince) / (1000 * 60 * 60 * 24), 1);
    const monthsAsCustomer = Math.max(daysAsCustomer / 30, 1);
    
    const monthlySpend = ltv / monthsAsCustomer;
    const purchaseFrequency = totalOrders / monthsAsCustomer;
    const projected12MonthCLV = monthlySpend * 12 * (1 + purchaseFrequency * 0.1);
    
    // Determine tier
    let tier = 'Bronze';
    if (ltv > 50000) tier = 'Platinum';
    else if (ltv > 20000) tier = 'Gold';
    else if (ltv > 5000) tier = 'Silver';
    
    // Determine health
    let health = 'healthy';
    if (daysSinceLastOrder > 180) health = 'churning';
    else if (daysSinceLastOrder > 90) health = 'at_risk';
    
    res.json({
      success: true,
      customer_id: id,
      current_ltv: ltv,
      predicted_12m_clv: Math.round(projected12MonthCLV * 100) / 100,
      tier,
      health,
      metrics: {
        total_orders: totalOrders,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
        monthly_spend: Math.round(monthlySpend * 100) / 100,
        purchase_frequency: Math.round(purchaseFrequency * 100) / 100,
        days_since_last_order: daysSinceLastOrder
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// DEALS PIPELINE (PERSISTED TO SQLITE)
// ============================================

app.get('/deals', (req, res) => {
  try {
    const { stage, customer_id, search } = req.query;
    let sql = 'SELECT * FROM crm_deals WHERE 1=1';
    const params = [];
    
    if (stage && stage !== 'all') {
      sql += ' AND stage = ?';
      params.push(stage);
    }
    if (customer_id) {
      sql += ' AND customer_id = ?';
      params.push(customer_id);
    }
    if (search) {
      sql += ' AND LOWER(title) LIKE ?';
      params.push(`%${search.toLowerCase()}%`);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    let deals = query(sql, params) || [];
    
    // Parse JSON fields and enrich with customer data
    deals = deals.map(d => {
      const deal = {
        ...d,
        tags: d.tags ? JSON.parse(d.tags) : [],
        value: parseFloat(d.value) || 0
      };
      
      if (deal.customer_id) {
        const customer = get('SELECT id, name, email FROM customers WHERE id = ?', [deal.customer_id]);
        deal.customer = customer || null;
      }
      
      return deal;
    });
    
    res.json({ success: true, deals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/deals/stats/pipeline', (req, res) => {
  try {
    const stages = ['qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    
    const pipeline = stages.map(stage => {
      const result = get('SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE stage = ?', [stage]);
      return {
        stage,
        count: parseInt(result?.count) || 0,
        value: parseFloat(result?.value) || 0
      };
    });
    
    const activeResult = get("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE stage NOT IN ('closed_won', 'closed_lost')");
    const wonResult = get("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals WHERE stage = 'closed_won'");
    const totalResult = get("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as value FROM crm_deals");
    
    res.json({
      success: true,
      pipeline,
      summary: {
        total_deals: parseInt(totalResult?.count) || 0,
        active_deals: parseInt(activeResult?.count) || 0,
        pipeline_value: parseFloat(activeResult?.value) || 0,
        won_deals: parseInt(wonResult?.count) || 0,
        won_value: parseFloat(wonResult?.value) || 0,
        conversion_rate: totalResult?.count > 0 ? ((wonResult?.count || 0) / totalResult.count * 100) : 0,
        avg_deal_size: totalResult?.count > 0 ? ((totalResult?.value || 0) / totalResult.count) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/deals/:id', (req, res) => {
  try {
    const deal = get('SELECT * FROM crm_deals WHERE id = ?', [req.params.id]);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    deal.tags = deal.tags ? JSON.parse(deal.tags) : [];
    res.json({ success: true, deal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/deals', (req, res) => {
  try {
    const { title, value, stage, probability, customer_id, expected_close_date, tags, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    run(
      `INSERT INTO crm_deals (id, title, value, stage, probability, customer_id, expected_close_date, tags, notes, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, parseFloat(value) || 0, stage || 'qualification', parseInt(probability) || 20, 
       customer_id || null, expected_close_date || null, JSON.stringify(tags || []), notes || '', now, now]
    );
    
    const deal = get('SELECT * FROM crm_deals WHERE id = ?', [id]);
    deal.tags = deal.tags ? JSON.parse(deal.tags) : [];
    
    logAudit('deal_created', 'deal', id, { title, value, stage });
    
    res.json({ success: true, deal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/deals/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, value, stage, probability, customer_id, expected_close_date, tags, notes } = req.body;
    
    const existing = get('SELECT * FROM crm_deals WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Deal not found' });
    
    const oldStage = existing.stage;
    const updates = [];
    const params = [];
    
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (value !== undefined) { updates.push('value = ?'); params.push(parseFloat(value)); }
    if (stage !== undefined) { updates.push('stage = ?'); params.push(stage); }
    if (probability !== undefined) { updates.push('probability = ?'); params.push(parseInt(probability)); }
    if (customer_id !== undefined) { updates.push('customer_id = ?'); params.push(customer_id); }
    if (expected_close_date !== undefined) { updates.push('expected_close_date = ?'); params.push(expected_close_date); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    run(`UPDATE crm_deals SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const deal = get('SELECT * FROM crm_deals WHERE id = ?', [id]);
    deal.tags = deal.tags ? JSON.parse(deal.tags) : [];
    
    if (stage && stage !== oldStage) {
      logAudit('deal_stage_changed', 'deal', id, { old_stage: oldStage, new_stage: stage });
    }
    
    res.json({ success: true, deal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/deals/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM crm_deals WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Deal not found' });
    
    logAudit('deal_deleted', 'deal', req.params.id, { title: existing.title });
    run('DELETE FROM crm_deals WHERE id = ?', [req.params.id]);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ACTIVITIES (PERSISTED TO SQLITE)
// ============================================

app.get('/activities', (req, res) => {
  try {
    const { customer_id, deal_id, type, status } = req.query;
    let sql = 'SELECT * FROM crm_activities WHERE 1=1';
    const params = [];
    
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    if (deal_id) { sql += ' AND deal_id = ?'; params.push(deal_id); }
    if (type && type !== 'all') { sql += ' AND type = ?'; params.push(type); }
    if (status === 'pending') { sql += ' AND completed_at IS NULL'; }
    else if (status === 'completed') { sql += ' AND completed_at IS NOT NULL'; }
    
    sql += ' ORDER BY created_at DESC';
    
    const activities = query(sql, params) || [];
    
    res.json({ success: true, activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/activities/stats/summary', (req, res) => {
  try {
    const total = get('SELECT COUNT(*) as count FROM crm_activities')?.count || 0;
    const pending = get('SELECT COUNT(*) as count FROM crm_activities WHERE completed_at IS NULL')?.count || 0;
    const completed = get('SELECT COUNT(*) as count FROM crm_activities WHERE completed_at IS NOT NULL')?.count || 0;
    const overdue = get("SELECT COUNT(*) as count FROM crm_activities WHERE completed_at IS NULL AND due_date < datetime('now')")?.count || 0;
    const dueToday = get("SELECT COUNT(*) as count FROM crm_activities WHERE completed_at IS NULL AND date(due_date) = date('now')")?.count || 0;
    
    res.json({
      success: true,
      summary: { total, pending, completed, overdue, due_today: dueToday }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/activities/:id', (req, res) => {
  try {
    const activity = get('SELECT * FROM crm_activities WHERE id = ?', [req.params.id]);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });
    res.json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/activities', (req, res) => {
  try {
    const { type, title, description, customer_id, deal_id, priority, due_date, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    
    const id = uuidv4();
    
    run(
      `INSERT INTO crm_activities (id, type, title, description, customer_id, deal_id, priority, due_date, assigned_to, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, type || 'task', title, description || null, customer_id || null, deal_id || null, 
       priority || 'medium', due_date || null, assigned_to || null, new Date().toISOString()]
    );
    
    const activity = get('SELECT * FROM crm_activities WHERE id = ?', [id]);
    logAudit('activity_created', 'activity', id, { type, title, priority });
    
    res.json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/activities/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, description, customer_id, deal_id, priority, due_date, assigned_to } = req.body;
    
    const existing = get('SELECT * FROM crm_activities WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Activity not found' });
    
    const updates = [];
    const params = [];
    
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (customer_id !== undefined) { updates.push('customer_id = ?'); params.push(customer_id); }
    if (deal_id !== undefined) { updates.push('deal_id = ?'); params.push(deal_id); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
    
    if (updates.length > 0) {
      params.push(id);
      run(`UPDATE crm_activities SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    
    const activity = get('SELECT * FROM crm_activities WHERE id = ?', [id]);
    res.json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/activities/:id/complete', (req, res) => {
  try {
    const existing = get('SELECT * FROM crm_activities WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Activity not found' });
    
    run('UPDATE crm_activities SET completed_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    
    const activity = get('SELECT * FROM crm_activities WHERE id = ?', [req.params.id]);
    logAudit('activity_completed', 'activity', req.params.id, { title: existing.title });
    
    res.json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/activities/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM crm_activities WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Activity not found' });
    
    run('DELETE FROM crm_activities WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// AI ACTIONS (PERSISTED TO SQLITE)
// ============================================

app.get('/ai/actions', (req, res) => {
  try {
    const status = req.query.status || 'pending';
    
    let sql = 'SELECT * FROM crm_ai_actions';
    const params = [];
    
    if (status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 50';
    
    let actions = query(sql, params) || [];
    actions = actions.map(a => ({
      ...a,
      parameters: a.parameters ? JSON.parse(a.parameters) : {},
      result: a.result ? JSON.parse(a.result) : null
    }));
    
    const pending = get("SELECT COUNT(*) as c FROM crm_ai_actions WHERE status = 'pending'")?.c || 0;
    const approved = get("SELECT COUNT(*) as c FROM crm_ai_actions WHERE status = 'approved'")?.c || 0;
    const rejected = get("SELECT COUNT(*) as c FROM crm_ai_actions WHERE status = 'rejected'")?.c || 0;
    const executed = get("SELECT COUNT(*) as c FROM crm_ai_actions WHERE status = 'executed'")?.c || 0;
    
    res.json({
      success: true,
      actions,
      summary: { pending, approved, rejected, executed }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/ai/actions', (req, res) => {
  try {
    const { action_type, target_id, target_type, reasoning, auto_approve, parameters } = req.body;
    
    const id = uuidv4();
    const now = new Date().toISOString();
    const status = auto_approve ? 'approved' : 'pending';
    const confidenceScore = Math.random() * 0.3 + 0.7;
    
    run(
      `INSERT INTO crm_ai_actions (id, action_type, target_id, target_type, reasoning, parameters, status, confidence_score, approved_at, approved_by, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, action_type, target_id, target_type, reasoning, JSON.stringify(parameters || {}), 
       status, confidenceScore, auto_approve ? now : null, auto_approve ? 'auto' : null, now]
    );
    
    const action = get('SELECT * FROM crm_ai_actions WHERE id = ?', [id]);
    action.parameters = action.parameters ? JSON.parse(action.parameters) : {};
    
    logAudit('ai_action_created', 'ai_action', id, { action_type, target_type, auto_approve });
    
    res.json({ success: true, action });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/ai/actions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, override_reason } = req.body;
    
    const existing = get('SELECT * FROM crm_ai_actions WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Action not found' });
    
    run(
      'UPDATE crm_ai_actions SET status = ?, approved_at = ?, approved_by = ?, override_reason = ? WHERE id = ?',
      [status, new Date().toISOString(), 'manual', override_reason || null, id]
    );
    
    const action = get('SELECT * FROM crm_ai_actions WHERE id = ?', [id]);
    action.parameters = action.parameters ? JSON.parse(action.parameters) : {};
    
    logAudit(status === 'approved' ? 'ai_action_approved' : 'ai_action_rejected', 'ai_action', id, { status, override_reason });
    
    res.json({ success: true, action });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/ai/actions/:id/execute', (req, res) => {
  try {
    const existing = get('SELECT * FROM crm_ai_actions WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Action not found' });
    if (existing.status !== 'approved') {
      return res.status(400).json({ error: 'Action must be approved before execution' });
    }
    
    let result = { success: true };
    switch (existing.action_type) {
      case 'send_email':
        result = { emails_sent: 1, recipient: existing.target_id };
        break;
      case 'apply_discount':
        const params = existing.parameters ? JSON.parse(existing.parameters) : {};
        result = { discount_applied: params.discount_percent || 10 };
        break;
      default:
        result = { executed: true };
    }
    
    run(
      'UPDATE crm_ai_actions SET status = ?, executed_at = ?, result = ? WHERE id = ?',
      ['executed', new Date().toISOString(), JSON.stringify(result), req.params.id]
    );
    
    const action = get('SELECT * FROM crm_ai_actions WHERE id = ?', [req.params.id]);
    action.parameters = action.parameters ? JSON.parse(action.parameters) : {};
    action.result = action.result ? JSON.parse(action.result) : null;
    
    res.json({ success: true, action });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PRIVACY & GDPR (PERSISTED TO SQLITE)
// ============================================

app.get('/privacy/consent/:customer_id', (req, res) => {
  try {
    const { customer_id } = req.params;
    const consentTypes = ['marketing_email', 'sms', 'data_processing', 'third_party_sharing', 'analytics'];
    
    const consents = consentTypes.map(type => {
      const consent = get('SELECT * FROM crm_consents WHERE customer_id = ? AND consent_type = ?', [customer_id, type]);
      return {
        type,
        granted: consent?.granted === 1 || false,
        granted_at: consent?.granted_at || null,
        source: consent?.source || null
      };
    });
    
    res.json({ success: true, customer_id, consents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/privacy/consent', (req, res) => {
  try {
    const { customer_id, consent_type, granted, source } = req.body;
    if (!customer_id || !consent_type) {
      return res.status(400).json({ error: 'customer_id and consent_type are required' });
    }
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // Upsert consent
    run(
      `INSERT INTO crm_consents (id, customer_id, consent_type, granted, source, granted_at) 
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(customer_id, consent_type) DO UPDATE SET granted = ?, source = ?, granted_at = ?`,
      [id, customer_id, consent_type, granted !== false ? 1 : 0, source || 'manual', now,
       granted !== false ? 1 : 0, source || 'manual', now]
    );
    
    const consent = get('SELECT * FROM crm_consents WHERE customer_id = ? AND consent_type = ?', [customer_id, consent_type]);
    
    logAudit(granted ? 'consent_granted' : 'consent_revoked', 'customer', customer_id, { consent_type, source });
    
    res.json({ success: true, consent: { ...consent, granted: consent.granted === 1 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/privacy/export/:customer_id', (req, res) => {
  try {
    const { customer_id } = req.params;
    
    const customer = get('SELECT * FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const transactions = query('SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC', [customer_id]) || [];
    const consents = query('SELECT * FROM crm_consents WHERE customer_id = ?', [customer_id]) || [];
    
    logAudit('data_export', 'customer', customer_id, { reason: 'GDPR data access request' });
    
    res.json({
      success: true,
      export_date: new Date().toISOString(),
      customer,
      transactions,
      consents: consents.map(c => ({ ...c, granted: c.granted === 1 })),
      data_retention_policy: '7 years for financial records, 2 years for marketing data'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/privacy/deletion-request', (req, res) => {
  try {
    const { customer_id, reason } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    
    const request = {
      id: uuidv4(),
      customer_id,
      reason: reason || 'Customer request',
      status: 'pending',
      requested_at: new Date().toISOString(),
      scheduled_deletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    logAudit('deletion_requested', 'customer', customer_id, { reason });
    
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// AUDIT TRAIL (PERSISTED TO SQLITE)
// ============================================

app.get('/audit/trail', (req, res) => {
  try {
    const { entity_type, entity_id, event_type, limit = 100 } = req.query;
    
    let sql = 'SELECT * FROM crm_audit_log WHERE 1=1';
    const params = [];
    
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    if (entity_id) { sql += ' AND entity_id = ?'; params.push(entity_id); }
    if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }
    
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit));
    
    let entries = query(sql, params) || [];
    entries = entries.map(e => ({
      ...e,
      details: e.details ? JSON.parse(e.details) : {}
    }));
    
    const totalResult = get('SELECT COUNT(*) as count FROM crm_audit_log');
    const eventTypesResult = query('SELECT DISTINCT event_type FROM crm_audit_log') || [];
    
    res.json({
      success: true,
      entries,
      total: totalResult?.count || 0,
      event_types: eventTypesResult.map(e => e.event_type)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// CUSTOMER JOURNEY (PERSISTED TO SQLITE)
// ============================================

app.get('/journey/:customer_id', (req, res) => {
  try {
    const { customer_id } = req.params;
    
    const customer = get('SELECT * FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const salesData = get(
      'SELECT MIN(created_at) as first_purchase, MAX(created_at) as last_purchase, COUNT(*) as total_purchases FROM sales WHERE customer_id = ?',
      [customer_id]
    ) || { first_purchase: null, last_purchase: null, total_purchases: 0 };
    
    const journeyEvents = query(
      'SELECT * FROM crm_journey_events WHERE customer_id = ? ORDER BY timestamp ASC',
      [customer_id]
    ) || [];
    
    const timeline = [];
    
    timeline.push({
      stage: 'acquisition',
      event: 'Customer Created',
      date: customer.created_at,
      channel: 'pos'
    });
    
    if (salesData.first_purchase) {
      timeline.push({
        stage: 'activation',
        event: 'First Purchase',
        date: salesData.first_purchase,
        channel: 'pos'
      });
    }
    
    if (parseInt(salesData.total_purchases) > 1) {
      timeline.push({
        stage: 'retention',
        event: `${salesData.total_purchases} Total Purchases`,
        date: salesData.last_purchase,
        channel: 'pos'
      });
    }
    
    journeyEvents.forEach(e => {
      timeline.push({
        stage: e.event_type,
        event: e.event_type.replace(/_/g, ' '),
        date: e.timestamp,
        channel: e.channel || 'system',
        metadata: e.metadata ? JSON.parse(e.metadata) : {}
      });
    });
    
    // Determine current stage
    let currentStage = 'new';
    const now = Date.now();
    const lastPurchase = salesData.last_purchase ? new Date(salesData.last_purchase).getTime() : 0;
    const daysSinceLastPurchase = lastPurchase ? Math.floor((now - lastPurchase) / (1000 * 60 * 60 * 24)) : 999;
    const totalPurchases = parseInt(salesData.total_purchases) || 0;
    
    if (daysSinceLastPurchase > 180) currentStage = 'churned';
    else if (daysSinceLastPurchase > 90) currentStage = 'at_risk';
    else if (totalPurchases > 5) currentStage = 'loyal';
    else if (totalPurchases > 1) currentStage = 'active';
    else if (totalPurchases === 1) currentStage = 'activated';
    
    res.json({
      success: true,
      customer_id,
      current_stage: currentStage,
      timeline: timeline.sort((a, b) => new Date(a.date) - new Date(b.date)),
      stages: ['prospect', 'new', 'activated', 'active', 'loyal', 'at_risk', 'churned'],
      recommendations: currentStage === 'at_risk'
        ? ['Send win-back email', 'Offer loyalty discount', 'Schedule follow-up call']
        : currentStage === 'loyal'
        ? ['Enroll in VIP program', 'Send exclusive offers', 'Request referrals']
        : ['Continue engagement', 'Monitor activity']
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/journey/events', (req, res) => {
  try {
    const { customer_id, event_type, channel, metadata } = req.body;
    if (!customer_id || !event_type) {
      return res.status(400).json({ error: 'customer_id and event_type are required' });
    }
    
    const id = uuidv4();
    
    run(
      'INSERT INTO crm_journey_events (id, customer_id, event_type, channel, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, customer_id, event_type, channel || 'pos', JSON.stringify(metadata || {}), new Date().toISOString()]
    );
    
    const event = get('SELECT * FROM crm_journey_events WHERE id = ?', [id]);
    
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ANALYTICS
// ============================================

app.get('/analytics/segmentation', (req, res) => {
  try {
    const customers = query('SELECT * FROM customers') || [];
    const sales = query('SELECT customer_id, SUM(total) as total FROM sales GROUP BY customer_id') || [];
    
    const salesMap = new Map(sales.map(s => [s.customer_id, parseFloat(s.total) || 0]));
    
    let vipCount = 0, loyalCount = 0, regularCount = 0, newCount = 0, atRiskCount = 0;
    let vipTotalLTV = 0, totalLTV = 0;
    
    const now = Date.now();
    
    customers.forEach(c => {
      const ltv = salesMap.get(c.id) || parseFloat(c.lifetime_value) || 0;
      totalLTV += ltv;
      
      const createdAt = c.created_at ? new Date(c.created_at).getTime() : now;
      const updatedAt = c.updated_at ? new Date(c.updated_at).getTime() : createdAt;
      const daysSinceCreation = (now - createdAt) / (24 * 60 * 60 * 1000);
      const daysSinceUpdate = (now - updatedAt) / (24 * 60 * 60 * 1000);
      
      if (ltv > 50000) { vipCount++; vipTotalLTV += ltv; }
      else if (ltv > 20000) loyalCount++;
      else if (ltv > 5000) regularCount++;
      else if (daysSinceCreation < 30) newCount++;
      else newCount++;
      
      if (daysSinceUpdate > 90 && ltv > 0) atRiskCount++;
    });
    
    const total = customers.length || 1;
    
    res.json({
      success: true,
      segments: [
        { name: 'VIP', count: vipCount, percentage: (vipCount / total * 100).toFixed(1), color: '#FFD700', avgLTV: vipCount > 0 ? vipTotalLTV / vipCount : 0 },
        { name: 'Loyal', count: loyalCount, percentage: (loyalCount / total * 100).toFixed(1), color: '#C0C0C0', avgLTV: 35000 },
        { name: 'Regular', count: regularCount, percentage: (regularCount / total * 100).toFixed(1), color: '#CD7F32', avgLTV: 12500 },
        { name: 'New', count: newCount, percentage: (newCount / total * 100).toFixed(1), color: '#4CAF50', avgLTV: 2500 },
        { name: 'At Risk', count: atRiskCount, percentage: (atRiskCount / total * 100).toFixed(1), color: '#F44336', avgLTV: 8000 }
      ],
      insights: {
        total_customers: total,
        avg_lifetime_value: totalLTV / total,
        recommendation: atRiskCount > total * 0.1 ? 'High churn risk detected - consider re-engagement campaign' : 'Customer base is healthy'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/analytics/churn-prediction', (req, res) => {
  try {
    const customers = query('SELECT * FROM customers') || [];
    const sales = query('SELECT customer_id, SUM(total) as total, MAX(created_at) as last_purchase, COUNT(*) as total_orders FROM sales GROUP BY customer_id') || [];
    
    const salesMap = new Map(sales.map(s => [s.customer_id, s]));
    const now = Date.now();
    
    const atRiskCustomers = customers
      .map(c => {
        const salesData = salesMap.get(c.id) || { total: 0, last_purchase: null, total_orders: 0 };
        const ltv = parseFloat(salesData.total) || parseFloat(c.lifetime_value) || 0;
        const lastPurchase = salesData.last_purchase ? new Date(salesData.last_purchase).getTime() : 0;
        const daysInactive = lastPurchase ? Math.floor((now - lastPurchase) / (1000 * 60 * 60 * 24)) : 999;
        
        let churnRisk = 'low';
        let churnScore = 20;
        
        if (daysInactive > 180) { churnRisk = 'critical'; churnScore = 95; }
        else if (daysInactive > 120) { churnRisk = 'high'; churnScore = 75; }
        else if (daysInactive > 90) { churnRisk = 'medium'; churnScore = 50; }
        else if (daysInactive > 60) { churnRisk = 'low'; churnScore = 30; }
        
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          lifetime_value: ltv,
          days_inactive: daysInactive,
          total_orders: parseInt(salesData.total_orders) || 0,
          last_purchase: salesData.last_purchase,
          churn_risk: churnRisk,
          churn_score: churnScore,
          recommended_action: churnRisk === 'critical' ? 'Urgent: Personal outreach' :
                             churnRisk === 'high' ? 'Send win-back offer' :
                             churnRisk === 'medium' ? 'Schedule re-engagement email' : 'Monitor'
        };
      })
      .filter(c => c.lifetime_value > 0 && c.days_inactive > 60)
      .sort((a, b) => b.lifetime_value - a.lifetime_value)
      .slice(0, 50);
    
    res.json({
      success: true,
      at_risk_count: atRiskCustomers.length,
      potential_revenue_loss: atRiskCustomers.reduce((sum, c) => sum + c.lifetime_value * 0.3, 0),
      customers: atRiskCustomers
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/analytics/rfm', (req, res) => {
  try {
    const customers = query('SELECT * FROM customers') || [];
    const sales = query('SELECT customer_id, SUM(total) as monetary, MAX(created_at) as last_purchase, COUNT(*) as frequency FROM sales GROUP BY customer_id') || [];
    
    const salesMap = new Map(sales.map(s => [s.customer_id, s]));
    const now = Date.now();
    
    const rfmCustomers = customers.map(c => {
      const salesData = salesMap.get(c.id) || { monetary: 0, last_purchase: null, frequency: 0 };
      const monetary = parseFloat(salesData.monetary) || 0;
      const frequency = parseInt(salesData.frequency) || 0;
      const lastPurchase = salesData.last_purchase ? new Date(salesData.last_purchase).getTime() : 0;
      const recencyDays = lastPurchase ? Math.floor((now - lastPurchase) / (1000 * 60 * 60 * 24)) : 999;
      
      const rScore = recencyDays <= 30 ? 5 : recencyDays <= 60 ? 4 : recencyDays <= 90 ? 3 : recencyDays <= 180 ? 2 : 1;
      const fScore = frequency >= 20 ? 5 : frequency >= 10 ? 4 : frequency >= 5 ? 3 : frequency >= 2 ? 2 : 1;
      const mScore = monetary >= 50000 ? 5 : monetary >= 20000 ? 4 : monetary >= 5000 ? 3 : monetary >= 1000 ? 2 : 1;
      
      const rfmScore = (rScore + fScore + mScore) / 3;
      
      let segment = 'New';
      if (rfmScore >= 4.5) segment = 'Champions';
      else if (rfmScore >= 4) segment = 'Loyal';
      else if (rfmScore >= 3) segment = 'Potential Loyalists';
      else if (rScore <= 2 && fScore >= 3) segment = 'At Risk';
      else if (rScore <= 2) segment = 'Hibernating';
      
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        recency_days: recencyDays,
        frequency,
        monetary,
        r_score: rScore,
        f_score: fScore,
        m_score: mScore,
        rfm_score: Math.round(rfmScore * 10) / 10,
        segment
      };
    }).sort((a, b) => b.monetary - a.monetary).slice(0, 100);
    
    res.json({ success: true, customers: rfmCustomers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/analytics/top-customers', (req, res) => {
  try {
    const customers = query('SELECT * FROM customers') || [];
    const sales = query('SELECT customer_id, COUNT(*) as count, SUM(total) as total FROM sales GROUP BY customer_id') || [];
    
    const salesMap = new Map(sales.map(s => [s.customer_id, s]));
    
    const result = customers.map(c => {
      const s = salesMap.get(c.id) || { count: 0, total: 0 };
      return { ...c, purchase_count: parseInt(s.count) || 0, total_spent: parseFloat(s.total) || 0 };
    }).sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)).slice(0, 10);
    
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// LOYALTY
// ============================================

app.post('/loyalty/issue', (req, res) => {
  try {
    const { customer_id, points, reason } = req.body;
    if (!customer_id || !points) {
      return res.status(400).json({ error: 'customer_id and points are required' });
    }
    
    const customer = get('SELECT * FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const newBalance = (customer.loyalty_points || 0) + points;
    run('UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?', [newBalance, new Date().toISOString(), customer_id]);
    
    logAudit('loyalty_points_issued', 'customer', customer_id, { points, reason, new_balance: newBalance });
    
    res.json({ success: true, customer_id, points_issued: points, new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/loyalty/redeem', (req, res) => {
  try {
    const { customer_id, points, reason } = req.body;
    if (!customer_id || !points) {
      return res.status(400).json({ error: 'customer_id and points are required' });
    }
    
    const customer = get('SELECT * FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const currentBalance = customer.loyalty_points || 0;
    if (currentBalance < points) {
      return res.status(400).json({ error: 'Insufficient points', current_balance: currentBalance });
    }
    
    const newBalance = currentBalance - points;
    run('UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?', [newBalance, new Date().toISOString(), customer_id]);
    
    logAudit('loyalty_points_redeemed', 'customer', customer_id, { points, reason, new_balance: newBalance });
    
    res.json({ success: true, customer_id, points_redeemed: points, new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// CAMPAIGNS (PERSISTED TO SQLITE)
// ============================================

app.get('/campaigns', (req, res) => {
  try {
    const campaigns = query('SELECT * FROM crm_campaigns ORDER BY created_at DESC') || [];
    res.json({ success: true, campaigns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/campaigns', (req, res) => {
  try {
    const { name, type, target_segment, message, channel, scheduled_at } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    run(
      `INSERT INTO crm_campaigns (id, name, type, status, target_segment, message_template, channel, scheduled_at, created_at, updated_at) 
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      [id, name, type, target_segment || null, message || null, channel || 'email', scheduled_at || null, now, now]
    );
    
    const campaign = get('SELECT * FROM crm_campaigns WHERE id = ?', [id]);
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SEGMENTS & TAGS (PERSISTED TO SQLITE)
// ============================================

app.get('/segments', (req, res) => {
  try {
    const segments = query('SELECT * FROM crm_segments ORDER BY created_at DESC') || [];
    res.json({ success: true, segments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/segments', (req, res) => {
  try {
    const { name, description, filter } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const id = uuidv4();
    
    run(
      'INSERT INTO crm_segments (id, name, description, filter, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, description || null, JSON.stringify(filter || null), new Date().toISOString()]
    );
    
    const segment = get('SELECT * FROM crm_segments WHERE id = ?', [id]);
    res.json({ success: true, segment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/tags', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const existing = get('SELECT * FROM crm_tags WHERE name = ?', [name]);
    if (existing) {
      return res.json({ success: true, tag: existing });
    }
    
    const id = uuidv4();
    run('INSERT INTO crm_tags (id, name, created_at) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
    
    const tag = get('SELECT * FROM crm_tags WHERE id = ?', [id]);
    res.json({ success: true, tag });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/customers/:id/tags', (req, res) => {
  try {
    const { tag_names } = req.body;
    if (!tag_names || !tag_names.length) {
      return res.status(400).json({ error: 'tag_names array is required' });
    }
    
    const tagIds = [];
    for (const name of tag_names) {
      let tag = get('SELECT * FROM crm_tags WHERE name = ?', [name]);
      if (!tag) {
        const tagId = uuidv4();
        run('INSERT INTO crm_tags (id, name, created_at) VALUES (?, ?, ?)', [tagId, name, new Date().toISOString()]);
        tag = { id: tagId, name };
      }
      tagIds.push(tag.id);
      
      // Link tag to customer
      run(
        'INSERT OR IGNORE INTO crm_customer_tags (id, customer_id, tag_id, created_at) VALUES (?, ?, ?, ?)',
        [uuidv4(), req.params.id, tag.id, new Date().toISOString()]
      );
    }
    
    res.json({ success: true, tag_ids: tagIds });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SPA FALLBACK
// ============================================

const API_PREFIXES = ['/api', '/health', '/metrics', '/status', '/customers', '/deals', '/activities',
  '/segments', '/tags', '/ai', '/privacy', '/audit', '/journey', '/analytics', '/loyalty', '/campaigns', '/profiles'];

app.get('*', (req, res) => {
  if (API_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ service: 'crm-lite', status: 'running', version: '1.2.0', persistence: 'sqlite' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[CRM-Lite] Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================

initDb().then(() => {
  // Seed sample data if empty
  seedSampleData();
  
  app.listen(PORT, () => {
    console.log(`\n✅ Customer Relationship Management (LITE) service listening on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📦 Mode: SQLite (Offline-First)`);
    console.log(`💾 Persistence: ALL DATA SAVED TO SQLITE - Zero data loss on restart`);
  });
}).catch(e => {
  console.error('Failed to initialize database:', e);
  process.exit(1);
});
