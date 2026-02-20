// Business logic / DB queries for Purchase Orders

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

// --- List POs ---

async function listPurchaseOrders(tenantId, filters) {
  const { status, vendor_id, from_date, to_date } = filters;
  let sql = 'SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE po.tenant_id = $1';
  const params = [tenantId]; let idx = 2;
  if (status) { sql += ` AND po.status = $${idx++}`; params.push(status); }
  if (vendor_id) { sql += ` AND po.vendor_id = $${idx++}`; params.push(vendor_id); }
  if (from_date) { sql += ` AND po.order_date >= $${idx++}`; params.push(from_date); }
  if (to_date) { sql += ` AND po.order_date <= $${idx++}`; params.push(to_date); }
  sql += ' ORDER BY po.created_at DESC';
  const r = await query(sql, params);
  return r.rows;
}

async function listPendingPurchaseOrders(tenantId) {
  const r = await query(
    `SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po
     LEFT JOIN acc_vendors v ON po.vendor_id = v.id
     WHERE po.tenant_id = $1 AND po.status IN ('approved','partially_received')
     ORDER BY po.expected_date ASC`, [tenantId]);
  return r.rows;
}

async function listPurchaseOrdersCsv(tenantId) {
  const r = await query('SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE po.tenant_id = $1 ORDER BY po.created_at DESC', [tenantId]);
  return r.rows;
}

async function getPurchaseOrdersReport(tenantId) {
  const byStatus = await query('SELECT status, COUNT(*) as count, SUM(total) as total FROM acc_purchase_orders WHERE tenant_id = $1 GROUP BY status', [tenantId]);
  const byVendor = await query('SELECT v.name as vendor_name, COUNT(*) as po_count, SUM(po.total) as total FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE po.tenant_id = $1 GROUP BY v.name ORDER BY total DESC LIMIT 20', [tenantId]);
  return { by_status: byStatus.rows, by_vendor: byVendor.rows };
}

// --- Create PO ---

async function createPurchaseOrder(tenantId, body) {
  const { vendor_id, order_date, expected_date, items, notes } = body;
  const poNum = `PO-${Date.now().toString(36).toUpperCase()}`;
  const subtotal = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0)), 0);
  const tax = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0) * ((i.tax_rate || 0) / 100)), 0);
  const total = subtotal + tax;
  const r = await query(
    `INSERT INTO acc_purchase_orders (tenant_id, po_number, vendor_id, order_date, expected_date, items, subtotal, tax, total, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [tenantId, poNum, vendor_id, order_date || new Date().toISOString().split('T')[0], expected_date || null, JSON.stringify(items), subtotal, tax, total, notes || null]);
  return r.rows[0];
}

// --- Get PO ---

async function getPurchaseOrder(tenantId, id) {
  const r = await query('SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE po.tenant_id = $1 AND po.id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const receipts = await query('SELECT * FROM acc_po_receipts WHERE tenant_id = $1 AND po_id = $2 ORDER BY created_at DESC', [tenantId, id]);
  return { ...r.rows[0], receipts: receipts.rows };
}

// --- Update PO ---

async function updatePurchaseOrder(tenantId, id, body) {
  const po = await query('SELECT * FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!po.rows.length) return { error: 'not_found' };
  if (po.rows[0].status !== 'draft') return { error: 'not_draft' };
  const { vendor_id, order_date, expected_date, items, notes } = body;
  let subtotal = parseFloat(po.rows[0].subtotal), tax = parseFloat(po.rows[0].tax), total = parseFloat(po.rows[0].total);
  if (items) {
    subtotal = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0)), 0);
    tax = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0) * ((i.tax_rate || 0) / 100)), 0);
    total = subtotal + tax;
  }
  await query(
    `UPDATE acc_purchase_orders SET vendor_id = COALESCE($1, vendor_id), order_date = COALESCE($2, order_date),
     expected_date = COALESCE($3, expected_date), items = COALESCE($4, items), subtotal = $5, tax = $6, total = $7,
     notes = COALESCE($8, notes), updated_at = NOW() WHERE tenant_id = $9 AND id = $10`,
    [vendor_id, order_date, expected_date, items ? JSON.stringify(items) : null, subtotal, tax, total, notes, tenantId, id]);
  const r = await query('SELECT * FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// --- Submit ---

async function submitPurchaseOrder(tenantId, id) {
  await query(`UPDATE acc_purchase_orders SET status = 'pending_approval', updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND status = 'draft'`, [tenantId, id]);
  const r = await query('SELECT * FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// --- Approve ---

async function approvePurchaseOrder(tenantId, id, approvedBy) {
  await query(`UPDATE acc_purchase_orders SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE tenant_id = $2 AND id = $3 AND status = 'pending_approval'`,
    [approvedBy || 'admin', tenantId, id]);
  const r = await query('SELECT * FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// --- Receive ---

async function receivePurchaseOrder(tenantId, id, body) {
  const { items_received, received_by, notes } = body;
  const po = await query('SELECT * FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!po.rows.length) return null;
  await query(
    `INSERT INTO acc_po_receipts (tenant_id, po_id, receipt_date, items_received, received_by, notes) VALUES ($1,$2,NOW(),$3,$4,$5)`,
    [tenantId, id, JSON.stringify(items_received || []), received_by || null, notes || null]);
  const poItems = po.rows[0].items || [];
  const allReceipts = await query('SELECT items_received FROM acc_po_receipts WHERE tenant_id = $1 AND po_id = $2', [tenantId, id]);
  const totalReceived = {};
  for (const r of allReceipts.rows) {
    for (const item of (r.items_received || [])) {
      totalReceived[item.product_id || item.id] = (totalReceived[item.product_id || item.id] || 0) + (item.quantity || 0);
    }
  }
  const allFulfilled = (Array.isArray(poItems) ? poItems : []).every(i => (totalReceived[i.product_id || i.id] || 0) >= (i.quantity || 0));
  const newStatus = allFulfilled ? 'received' : 'partially_received';
  await query('UPDATE acc_purchase_orders SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [newStatus, tenantId, id]);
  return { po_status: newStatus };
}

// --- Convert to Bill ---

async function convertToBill(tenantId, id) {
  const po = await query('SELECT * FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!po.rows.length) return null;
  const p = po.rows[0];
  const billNum = `BILL-${Date.now().toString(36).toUpperCase()}`;
  const r = await query(
    `INSERT INTO acc_bills (tenant_id, bill_number, vendor_id, bill_date, due_date, items, subtotal, tax_amount, total_amount, status)
     VALUES ($1,$2,$3,NOW(),NOW() + INTERVAL '30 days',$4,$5,$6,$7,'draft') RETURNING id, bill_number`,
    [tenantId, billNum, p.vendor_id, p.items, p.subtotal, p.tax, p.total]);
  await query('UPDATE acc_purchase_orders SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', ['billed', tenantId, id]);
  return { bill_id: r.rows[0].id, bill_number: r.rows[0].bill_number };
}

// --- Receipts ---

async function listReceipts(tenantId, poId) {
  const r = await query('SELECT * FROM acc_po_receipts WHERE tenant_id = $1 AND po_id = $2 ORDER BY created_at DESC', [tenantId, poId]);
  return r.rows;
}

// --- Delete ---

async function deletePurchaseOrder(tenantId, id) {
  const po = await query('SELECT status FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (po.rows.length && po.rows[0].status !== 'draft') return { error: 'not_draft' };
  await query('DELETE FROM acc_po_receipts WHERE tenant_id = $1 AND po_id = $2', [tenantId, id]);
  await query('DELETE FROM acc_purchase_orders WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return { success: true };
}

// --- Vendors ---

async function listVendors(tenantId) {
  const r = await query('SELECT * FROM acc_vendors WHERE tenant_id = $1 AND is_active = true ORDER BY name', [tenantId]);
  return r.rows;
}

module.exports = {
  listPurchaseOrders,
  listPendingPurchaseOrders,
  listPurchaseOrdersCsv,
  getPurchaseOrdersReport,
  createPurchaseOrder,
  getPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrder,
  convertToBill,
  listReceipts,
  deletePurchaseOrder,
  listVendors
};
