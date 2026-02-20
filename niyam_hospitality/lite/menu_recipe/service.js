/**
 * Menu & Recipe Management Service - Niyam Hospitality (Max Lite)
 * Menu items, recipes, modifiers, pricing, availability
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8929;
const SERVICE_NAME = 'menu_recipe';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, outlet_id TEXT,
    menu_type TEXT DEFAULT 'regular', available_from TEXT, available_to TEXT,
    day_of_week TEXT, is_active INTEGER DEFAULT 1, display_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS menu_sections (
    id TEXT PRIMARY KEY, menu_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
    display_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS modifier_groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, selection_type TEXT DEFAULT 'single',
    min_selections INTEGER DEFAULT 0, max_selections INTEGER DEFAULT 1,
    is_required INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS modifiers (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL, name TEXT NOT NULL,
    price_adjustment REAL DEFAULT 0, is_default INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS menu_item_modifiers (
    id TEXT PRIMARY KEY, menu_item_id TEXT NOT NULL, modifier_group_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(menu_item_id, modifier_group_id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS menu_item_availability (
    id TEXT PRIMARY KEY, menu_item_id TEXT NOT NULL, day_of_week TEXT,
    start_time TEXT, end_time TEXT, is_available INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS price_tiers (
    id TEXT PRIMARY KEY, menu_item_id TEXT NOT NULL, tier_name TEXT NOT NULL,
    price REAL NOT NULL, valid_from TEXT, valid_to TEXT, day_of_week TEXT,
    start_time TEXT, end_time TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// MENUS
app.get('/menus', async (req, res) => {
  try {
    await ensureTables();
    const { outlet_id, type, active_only } = req.query;
    let sql = `SELECT * FROM menus WHERE 1=1`;
    const params = [];
    if (outlet_id) { sql += ` AND outlet_id = ?`; params.push(outlet_id); }
    if (type) { sql += ` AND menu_type = ?`; params.push(type); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY display_order, name`;
    res.json({ success: true, menus: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/menus/:id', async (req, res) => {
  try {
    await ensureTables();
    const menu = get(`SELECT * FROM menus WHERE id = ?`, [req.params.id]);
    if (!menu) return res.status(404).json({ success: false, error: 'Menu not found' });
    const sections = query(`SELECT * FROM menu_sections WHERE menu_id = ? ORDER BY display_order`, [req.params.id]);
    for (const section of sections) {
      section.items = query(`SELECT * FROM menu_items WHERE category_id = ? AND active = 1 ORDER BY name`, [section.id]);
    }
    res.json({ success: true, menu: { ...menu, sections } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/menus', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, outlet_id, menu_type, available_from, available_to, day_of_week } = req.body;
    const id = generateId();
    run(`INSERT INTO menus (id, name, description, outlet_id, menu_type, available_from, available_to, day_of_week, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, outlet_id, menu_type || 'regular', available_from, available_to, day_of_week, timestamp()]);
    res.json({ success: true, menu: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SECTIONS
app.post('/menus/:menuId/sections', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, display_order } = req.body;
    const id = generateId();
    run(`INSERT INTO menu_sections (id, menu_id, name, description, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.params.menuId, name, description, display_order || 0, timestamp()]);
    res.json({ success: true, section: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// MENU ITEMS (uses shared menu_items table)
app.get('/items', async (req, res) => {
  try {
    await ensureTables();
    const { category, search, active_only } = req.query;
    let sql = `SELECT mi.*, mc.name as category_name FROM menu_items mi LEFT JOIN menu_categories mc ON mi.category_id = mc.id WHERE 1=1`;
    const params = [];
    if (category) { sql += ` AND mi.category_id = ?`; params.push(category); }
    if (search) { sql += ` AND mi.name LIKE ?`; params.push(`%${search}%`); }
    if (active_only === 'true') { sql += ` AND mi.active = 1`; }
    sql += ` ORDER BY mc.name, mi.name`;
    res.json({ success: true, items: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/items/:id', async (req, res) => {
  try {
    await ensureTables();
    const item = get(`SELECT * FROM menu_items WHERE id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    
    // Get modifiers
    const modifierGroups = query(`
      SELECT mg.* FROM modifier_groups mg
      JOIN menu_item_modifiers mim ON mg.id = mim.modifier_group_id
      WHERE mim.menu_item_id = ?
    `, [req.params.id]);
    for (const group of modifierGroups) {
      group.modifiers = query(`SELECT * FROM modifiers WHERE group_id = ? AND is_active = 1 ORDER BY display_order`, [group.id]);
    }
    
    // Get availability
    const availability = query(`SELECT * FROM menu_item_availability WHERE menu_item_id = ?`, [req.params.id]);
    
    // Get price tiers
    const priceTiers = query(`SELECT * FROM price_tiers WHERE menu_item_id = ?`, [req.params.id]);
    
    res.json({ success: true, item: { ...item, modifier_groups: modifierGroups, availability, price_tiers: priceTiers } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/items', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, category_id, price, cost, tax_rate, preparation_time, allergens, dietary_flags, image_url } = req.body;
    const id = generateId();
    run(`INSERT INTO menu_items (id, category_id, name, description, price, cost, tax_rate, preparation_time, allergens, dietary_flags, image_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, category_id, name, description, price || 0, cost || 0, tax_rate || 0, preparation_time || 15, allergens, dietary_flags, image_url, timestamp()]);
    res.json({ success: true, item: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/items/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, category_id, price, cost, tax_rate, preparation_time, allergens, dietary_flags, image_url, active } = req.body;
    run(`UPDATE menu_items SET name = COALESCE(?, name), description = COALESCE(?, description), category_id = COALESCE(?, category_id), price = COALESCE(?, price), cost = COALESCE(?, cost), tax_rate = COALESCE(?, tax_rate), preparation_time = COALESCE(?, preparation_time), allergens = COALESCE(?, allergens), dietary_flags = COALESCE(?, dietary_flags), image_url = COALESCE(?, image_url), active = COALESCE(?, active), updated_at = ? WHERE id = ?`,
      [name, description, category_id, price, cost, tax_rate, preparation_time, allergens, dietary_flags, image_url, active, timestamp(), req.params.id]);
    res.json({ success: true, message: 'Item updated' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// MODIFIER GROUPS
app.get('/modifier-groups', async (req, res) => {
  try {
    await ensureTables();
    const groups = query(`SELECT * FROM modifier_groups ORDER BY name`);
    for (const g of groups) { g.modifiers = query(`SELECT * FROM modifiers WHERE group_id = ? ORDER BY display_order`, [g.id]); }
    res.json({ success: true, modifier_groups: groups });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/modifier-groups', async (req, res) => {
  try {
    await ensureTables();
    const { name, selection_type, min_selections, max_selections, is_required } = req.body;
    const id = generateId();
    run(`INSERT INTO modifier_groups (id, name, selection_type, min_selections, max_selections, is_required, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, selection_type || 'single', min_selections || 0, max_selections || 1, is_required ? 1 : 0, timestamp()]);
    res.json({ success: true, modifier_group: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/modifier-groups/:groupId/modifiers', async (req, res) => {
  try {
    await ensureTables();
    const { name, price_adjustment, is_default, display_order } = req.body;
    const id = generateId();
    run(`INSERT INTO modifiers (id, group_id, name, price_adjustment, is_default, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.groupId, name, price_adjustment || 0, is_default ? 1 : 0, display_order || 0, timestamp()]);
    res.json({ success: true, modifier: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Assign modifiers to item
app.post('/items/:itemId/modifiers', async (req, res) => {
  try {
    await ensureTables();
    const { modifier_group_ids } = req.body;
    for (const groupId of modifier_group_ids || []) {
      try {
        run(`INSERT INTO menu_item_modifiers (id, menu_item_id, modifier_group_id, created_at) VALUES (?, ?, ?, ?)`,
          [generateId(), req.params.itemId, groupId, timestamp()]);
      } catch (e) { /* duplicate */ }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AVAILABILITY
app.post('/items/:itemId/availability', async (req, res) => {
  try {
    await ensureTables();
    const { day_of_week, start_time, end_time, is_available } = req.body;
    const id = generateId();
    run(`INSERT INTO menu_item_availability (id, menu_item_id, day_of_week, start_time, end_time, is_available, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.itemId, day_of_week, start_time, end_time, is_available ? 1 : 0, timestamp()]);
    res.json({ success: true, availability: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PRICE TIERS
app.post('/items/:itemId/price-tiers', async (req, res) => {
  try {
    await ensureTables();
    const { tier_name, price, valid_from, valid_to, day_of_week, start_time, end_time } = req.body;
    const id = generateId();
    run(`INSERT INTO price_tiers (id, menu_item_id, tier_name, price, valid_from, valid_to, day_of_week, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.itemId, tier_name, price, valid_from, valid_to, day_of_week, start_time, end_time, timestamp()]);
    res.json({ success: true, price_tier: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Get effective price for item
app.get('/items/:itemId/price', async (req, res) => {
  try {
    await ensureTables();
    const item = get(`SELECT price FROM menu_items WHERE id = ?`, [req.params.itemId]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.toTimeString().slice(0, 5);
    const today = now.toISOString().split('T')[0];
    
    // Check for active price tier
    const tier = get(`
      SELECT * FROM price_tiers WHERE menu_item_id = ?
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_to IS NULL OR valid_to >= ?)
        AND (day_of_week IS NULL OR day_of_week LIKE ?)
        AND (start_time IS NULL OR start_time <= ?)
        AND (end_time IS NULL OR end_time >= ?)
      ORDER BY price ASC LIMIT 1
    `, [req.params.itemId, today, today, `%${dayOfWeek}%`, currentTime, currentTime]);
    
    res.json({ success: true, price: tier ? tier.price : item.price, tier: tier?.tier_name || 'standard' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 86'd items (out of stock)
app.post('/items/:id/86', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE menu_items SET active = 0, updated_at = ? WHERE id = ?`, [timestamp(), req.params.id]);
    res.json({ success: true, message: 'Item 86\'d' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/items/:id/un86', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE menu_items SET active = 1, updated_at = ? WHERE id = ?`, [timestamp(), req.params.id]);
    res.json({ success: true, message: 'Item back in stock' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
