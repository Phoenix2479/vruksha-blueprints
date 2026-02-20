// Business logic / DB queries for Inventory Valuation

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

// --- Valuation Items ---

async function listValuationItems(tenantId, filters) {
  const { method, category } = filters;
  let sql = 'SELECT * FROM acc_inventory_valuation WHERE tenant_id = $1';
  const params = [tenantId]; let idx = 2;
  if (method) { sql += ` AND costing_method = $${idx++}`; params.push(method); }
  if (category) { sql += ` AND category = $${idx++}`; params.push(category); }
  sql += ' ORDER BY item_name';
  const r = await query(sql, params);
  return r.rows;
}

async function listValuationItemsCsv(tenantId) {
  const r = await query('SELECT * FROM acc_inventory_valuation WHERE tenant_id = $1 ORDER BY item_name', [tenantId]);
  return r.rows;
}

async function createValuationItem(tenantId, body) {
  const { item_code, item_name, category, costing_method, unit, opening_qty, opening_rate, min_stock, max_stock } = body;
  const code = item_code || `INV-${Date.now().toString(36).toUpperCase()}`;
  const oQty = opening_qty || 0; const oRate = opening_rate || 0;
  const r = await query(
    `INSERT INTO acc_inventory_valuation (tenant_id, item_code, item_name, category, costing_method, unit, current_qty, current_rate, current_value, opening_qty, opening_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [tenantId, code, item_name, category || null, costing_method || 'weighted_average', unit || 'nos', oQty, oRate, oQty * oRate, oQty, oRate]);
  return r.rows[0];
}

async function getValuationItem(tenantId, id) {
  const r = await query('SELECT * FROM acc_inventory_valuation WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  return r.rows[0];
}

async function updateValuationItem(tenantId, id, body) {
  const { item_name, category, costing_method, unit, min_stock, max_stock } = body;
  await query(
    `UPDATE acc_inventory_valuation SET item_name = COALESCE($1,item_name), category = COALESCE($2,category),
     costing_method = COALESCE($3,costing_method), unit = COALESCE($4,unit), min_stock = COALESCE($5,min_stock),
     max_stock = COALESCE($6,max_stock), updated_at = NOW() WHERE tenant_id = $7 AND id = $8`,
    [item_name, category, costing_method, unit, min_stock, max_stock, tenantId, id]);
  const r = await query('SELECT * FROM acc_inventory_valuation WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// --- Transactions ---

async function listTransactions(tenantId, itemId) {
  const r = await query('SELECT * FROM acc_inventory_transactions WHERE tenant_id = $1 AND item_id = $2 ORDER BY transaction_date DESC, created_at DESC', [tenantId, itemId]);
  return r.rows;
}

async function createTransaction(tenantId, itemId, body) {
  const { type, quantity, unit_cost, reference, notes, transaction_date } = body;

  const item = await query('SELECT * FROM acc_inventory_valuation WHERE tenant_id = $1 AND id = $2', [tenantId, itemId]);
  if (!item.rows.length) return null;
  const it = item.rows[0];
  const qty = parseFloat(quantity); const cost = parseFloat(unit_cost) || 0;
  let newQty, newRate, newValue;
  const method = it.costing_method || 'weighted_average';

  if (type === 'purchase' || type === 'in') {
    newQty = parseFloat(it.current_qty) + qty;
    if (method === 'weighted_average') {
      newValue = (parseFloat(it.current_value) || 0) + (qty * cost);
      newRate = newQty > 0 ? newValue / newQty : 0;
    } else {
      newRate = cost;
      newValue = newQty * newRate;
    }
  } else {
    newQty = Math.max(0, parseFloat(it.current_qty) - qty);
    if (method === 'fifo') {
      const fifoTxns = await query("SELECT * FROM acc_inventory_transactions WHERE tenant_id = $1 AND item_id = $2 AND type IN ('purchase','in') AND remaining_qty > 0 ORDER BY transaction_date ASC", [tenantId, itemId]);
      let remaining = qty; let costOfGoods = 0;
      for (const f of fifoTxns.rows) {
        const take = Math.min(remaining, parseFloat(f.remaining_qty));
        costOfGoods += take * parseFloat(f.unit_cost);
        await query('UPDATE acc_inventory_transactions SET remaining_qty = remaining_qty - $1 WHERE id = $2', [take, f.id]);
        remaining -= take;
        if (remaining <= 0) break;
      }
      newRate = qty > 0 ? costOfGoods / qty : 0;
    } else if (method === 'lifo') {
      const lifoTxns = await query("SELECT * FROM acc_inventory_transactions WHERE tenant_id = $1 AND item_id = $2 AND type IN ('purchase','in') AND remaining_qty > 0 ORDER BY transaction_date DESC", [tenantId, itemId]);
      let remaining = qty; let costOfGoods = 0;
      for (const f of lifoTxns.rows) {
        const take = Math.min(remaining, parseFloat(f.remaining_qty));
        costOfGoods += take * parseFloat(f.unit_cost);
        await query('UPDATE acc_inventory_transactions SET remaining_qty = remaining_qty - $1 WHERE id = $2', [take, f.id]);
        remaining -= take;
        if (remaining <= 0) break;
      }
      newRate = qty > 0 ? costOfGoods / qty : 0;
    } else {
      newRate = parseFloat(it.current_rate);
    }
    newValue = newQty * (method === 'weighted_average' ? parseFloat(it.current_rate) : newRate);
  }

  const txn = await query(
    `INSERT INTO acc_inventory_transactions (tenant_id, item_id, type, quantity, unit_cost, total_cost, transaction_date, reference, notes, remaining_qty, running_qty, running_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [tenantId, itemId, type, qty, cost, qty * cost, transaction_date || new Date().toISOString().split('T')[0], reference, notes,
     (type === 'purchase' || type === 'in') ? qty : 0, newQty, newValue]);
  await query('UPDATE acc_inventory_valuation SET current_qty = $1, current_rate = $2, current_value = $3, updated_at = NOW() WHERE tenant_id = $4 AND id = $5',
    [newQty, newRate, newValue, tenantId, itemId]);
  return txn.rows[0];
}

// --- History ---

async function getItemHistory(tenantId, itemId) {
  const r = await query(
    `SELECT transaction_date, type, quantity, unit_cost, running_qty, running_value FROM acc_inventory_transactions
     WHERE tenant_id = $1 AND item_id = $2 ORDER BY transaction_date ASC, created_at ASC`, [tenantId, itemId]);
  return r.rows;
}

// --- Methods ---

function getCostingMethods() {
  return [
    { id: 'fifo', name: 'FIFO', description: 'First In, First Out' },
    { id: 'lifo', name: 'LIFO', description: 'Last In, First Out' },
    { id: 'weighted_average', name: 'Weighted Average', description: 'Weighted average cost' }
  ];
}

// --- Settings ---

async function getSettings(tenantId) {
  const r = await query(`SELECT key, value FROM acc_company_settings WHERE tenant_id = $1 AND key LIKE 'inventory_%'`, [tenantId]);
  const settings = {};
  r.rows.forEach(row => { settings[row.key] = row.value; });
  return { default_method: settings.inventory_default_method || 'weighted_average', ...settings };
}

async function updateSettings(tenantId, body) {
  for (const [k, v] of Object.entries(body)) {
    const key = k.startsWith('inventory_') ? k : `inventory_${k}`;
    await query(
      `INSERT INTO acc_company_settings (tenant_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
      [tenantId, key, typeof v === 'string' ? v : JSON.stringify(v)]);
  }
}

// --- Calculate ---

async function calculateValuation(tenantId, itemId) {
  const item = await query('SELECT * FROM acc_inventory_valuation WHERE tenant_id = $1 AND id = $2', [tenantId, itemId]);
  if (!item.rows.length) return null;
  const txns = await query("SELECT * FROM acc_inventory_transactions WHERE tenant_id = $1 AND item_id = $2 ORDER BY transaction_date ASC", [tenantId, itemId]);
  return { item: item.rows[0], transactions: txns.rows.length, current_qty: item.rows[0].current_qty, current_value: item.rows[0].current_value };
}

module.exports = {
  listValuationItems,
  listValuationItemsCsv,
  createValuationItem,
  getValuationItem,
  updateValuationItem,
  listTransactions,
  createTransaction,
  getItemHistory,
  getCostingMethods,
  getSettings,
  updateSettings,
  calculateValuation
};
