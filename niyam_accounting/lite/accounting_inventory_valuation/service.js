/**
 * Inventory Valuation - Lite Version (SQLite)
 * Port: 8904
 * FIFO/LIFO/Weighted Average costing for inventory
 * Split from fiscal_periods for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8904;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_inventory_valuation', mode: 'lite' });
});

// =============================================================================
// INVENTORY VALUATION
// =============================================================================

app.get('/api/inventory-valuation', (req, res) => {
  try {
    const data = query('SELECT * FROM acc_inventory_valuation ORDER BY product_name');
    const summary = get('SELECT COALESCE(SUM(total_value), 0) as total_inventory_value, COUNT(*) as total_products, COALESCE(SUM(total_qty), 0) as total_quantity FROM acc_inventory_valuation');
    res.json({ success: true, data: { items: data, summary } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/inventory-valuation/csv', (req, res) => {
  try {
    const data = query('SELECT * FROM acc_inventory_valuation ORDER BY product_name', []);
    sendCSV(res, data, 'inventory-valuation.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/inventory-valuation', (req, res) => {
  try {
    const { product_id, product_name, valuation_method, unit_cost, total_qty, account_id } = req.body;
    if (!product_id || !product_name) return res.status(400).json({ success: false, error: 'product_id and product_name required' });
    const id = uuidv4();
    const totalValue = (unit_cost || 0) * (total_qty || 0);
    run('INSERT INTO acc_inventory_valuation (id, product_id, product_name, valuation_method, unit_cost, total_qty, total_value, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, product_id, product_name, valuation_method || 'weighted_avg', unit_cost || 0, total_qty || 0, totalValue, account_id || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_inventory_valuation WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/inventory-transactions', (req, res) => {
  try {
    const { product_id, transaction_type, quantity, unit_cost, journal_entry_id, reference_id, reference_type } = req.body;
    if (!product_id || !transaction_type || !quantity) return res.status(400).json({ success: false, error: 'product_id, transaction_type, quantity required' });
    const id = uuidv4();
    const totalCost = (unit_cost || 0) * Math.abs(quantity);
    run('INSERT INTO acc_inventory_transactions (id, product_id, transaction_type, quantity, unit_cost, total_cost, journal_entry_id, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, product_id, transaction_type, quantity, unit_cost || 0, totalCost, journal_entry_id || null, reference_id || null, reference_type || null]);

    const val = get('SELECT * FROM acc_inventory_valuation WHERE product_id = ?', [product_id]);
    if (val) {
      const isInflow = ['purchase', 'return_in'].includes(transaction_type);
      const newQty = isInflow ? val.total_qty + Math.abs(quantity) : val.total_qty - Math.abs(quantity);
      const newValue = isInflow ? val.total_value + totalCost : val.total_value - (val.unit_cost * Math.abs(quantity));
      const newUnitCost = newQty > 0 ? newValue / newQty : 0;
      run('UPDATE acc_inventory_valuation SET total_qty = ?, total_value = ?, unit_cost = ?, last_updated = datetime(\'now\') WHERE product_id = ?',
        [Math.max(0, newQty), Math.max(0, newValue), Math.max(0, newUnitCost), product_id]);
    }

    res.status(201).json({ success: true, data: get('SELECT * FROM acc_inventory_transactions WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/inventory-valuation/:productId/history', (req, res) => {
  try {
    const data = query('SELECT * FROM acc_inventory_transactions WHERE product_id = ? ORDER BY created_at DESC', [req.params.productId]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/inventory-valuation/settings', (req, res) => {
  try {
    const { product_id, valuation_method } = req.body;
    if (!product_id || !valuation_method) return res.status(400).json({ success: false, error: 'product_id and valuation_method required' });
    run('UPDATE acc_inventory_valuation SET valuation_method = ?, last_updated = datetime(\'now\') WHERE product_id = ?', [valuation_method, product_id]);
    res.json({ success: true, data: get('SELECT * FROM acc_inventory_valuation WHERE product_id = ?', [product_id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// FIFO/LIFO COSTING
// =============================================================================

app.get('/api/inventory-valuation/methods', (req, res) => {
  try {
    res.json({ success: true, data: [
      { id: 'weighted_avg', name: 'Weighted Average', description: 'Average cost of all units in stock' },
      { id: 'fifo', name: 'FIFO (First In First Out)', description: 'Oldest inventory sold first' },
      { id: 'lifo', name: 'LIFO (Last In First Out)', description: 'Newest inventory sold first' },
    ]});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/inventory-valuation/calculate', (req, res) => {
  try {
    const { product_id, method, sale_quantity } = req.body;
    if (!product_id || !method) return res.status(400).json({ success: false, error: 'product_id and method required' });

    const txns = query('SELECT * FROM acc_inventory_transactions WHERE product_id = ? ORDER BY created_at ASC', [product_id]);
    const purchases = txns.filter(t => t.transaction_type === 'purchase' || t.quantity > 0);
    const qty = sale_quantity || 1;

    let cogs = 0, remaining = qty;
    if (method === 'fifo') {
      for (const p of purchases) {
        if (remaining <= 0) break;
        const available = Math.min(p.quantity, remaining);
        cogs += available * (p.unit_cost || 0);
        remaining -= available;
      }
    } else if (method === 'lifo') {
      for (let i = purchases.length - 1; i >= 0; i--) {
        if (remaining <= 0) break;
        const available = Math.min(purchases[i].quantity, remaining);
        cogs += available * (purchases[i].unit_cost || 0);
        remaining -= available;
      }
    } else {
      const totalCost = purchases.reduce((s, p) => s + (p.quantity * (p.unit_cost || 0)), 0);
      const totalQty = purchases.reduce((s, p) => s + p.quantity, 0);
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      cogs = qty * avgCost;
    }

    const totalQty = purchases.reduce((s, p) => s + p.quantity, 0);
    const totalCost = purchases.reduce((s, p) => s + (p.quantity * (p.unit_cost || 0)), 0);

    res.json({ success: true, data: { product_id, method, sale_quantity: qty, cogs: Math.round(cogs * 100) / 100, total_stock_qty: totalQty, total_stock_value: Math.round(totalCost * 100) / 100 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Inventory Valuation (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
