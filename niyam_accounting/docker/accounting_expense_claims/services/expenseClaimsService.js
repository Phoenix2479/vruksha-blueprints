// Business logic / DB queries for Expense Claims

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

// --- Categories ---

async function listCategories(tenantId) {
  const r = await query('SELECT * FROM acc_expense_categories WHERE tenant_id = $1 ORDER BY name', [tenantId]);
  return r.rows;
}

async function createCategory(tenantId, body) {
  const { name, gl_account_id, requires_receipt, max_amount } = body;
  const r = await query(
    'INSERT INTO acc_expense_categories (tenant_id, name, gl_account_id, requires_receipt, max_amount) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [tenantId, name, gl_account_id || null, requires_receipt || false, max_amount || null]);
  return r.rows[0];
}

async function updateCategory(tenantId, id, body) {
  const { name, gl_account_id, requires_receipt, max_amount, active } = body;
  await query(
    `UPDATE acc_expense_categories SET name = COALESCE($1,name), gl_account_id = COALESCE($2,gl_account_id),
     requires_receipt = COALESCE($3,requires_receipt), max_amount = COALESCE($4,max_amount), active = COALESCE($5,active)
     WHERE tenant_id = $6 AND id = $7`,
    [name, gl_account_id, requires_receipt, max_amount, active, tenantId, id]);
  const r = await query('SELECT * FROM acc_expense_categories WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// --- Claims ---

async function listClaims(tenantId, filters) {
  const { status, employee_id } = filters;
  let sql = 'SELECT * FROM acc_expense_claims WHERE tenant_id = $1';
  const params = [tenantId]; let idx = 2;
  if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
  if (employee_id) { sql += ` AND employee_id = $${idx++}`; params.push(employee_id); }
  sql += ' ORDER BY created_at DESC';
  const r = await query(sql, params);
  return r.rows;
}

async function listClaimsCsv(tenantId) {
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows;
}

async function getClaimsSummary(tenantId) {
  const byStatus = await query('SELECT status, COUNT(*) as count, SUM(total) as total FROM acc_expense_claims WHERE tenant_id = $1 GROUP BY status', [tenantId]);
  const byCategory = await query(
    `SELECT el.category, COUNT(*) as count, SUM(el.amount) as total FROM acc_expense_lines el
     JOIN acc_expense_claims ec ON el.claim_id = ec.id WHERE ec.tenant_id = $1 GROUP BY el.category ORDER BY total DESC`, [tenantId]);
  return { by_status: byStatus.rows, by_category: byCategory.rows };
}

async function createClaim(tenantId, body) {
  const { employee_id, employee_name, claim_date, notes, lines } = body;
  const claimNum = `EXP-${Date.now().toString(36).toUpperCase()}`;
  const total = (lines || []).reduce((s, l) => s + (l.amount || 0) + (l.tax || 0), 0);
  const r = await query(
    `INSERT INTO acc_expense_claims (tenant_id, claim_number, employee_id, employee_name, claim_date, total, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, claimNum, employee_id || null, employee_name, claim_date || new Date().toISOString().split('T')[0], total, notes || null]);
  if (Array.isArray(lines)) {
    for (const l of lines) {
      await query(
        `INSERT INTO acc_expense_lines (tenant_id, claim_id, expense_date, category, description, amount, tax, receipt_url, project_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, r.rows[0].id, l.expense_date || null, l.category || null, l.description || null, l.amount || 0, l.tax || 0, l.receipt_url || null, l.project_id || null]);
    }
  }
  return r.rows[0];
}

async function getClaim(tenantId, id) {
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const lines = await query('SELECT * FROM acc_expense_lines WHERE tenant_id = $1 AND claim_id = $2 ORDER BY created_at', [tenantId, id]);
  return { ...r.rows[0], lines: lines.rows };
}

async function updateClaim(tenantId, id, body) {
  const { employee_name, claim_date, notes } = body;
  await query(`UPDATE acc_expense_claims SET employee_name = COALESCE($1,employee_name), claim_date = COALESCE($2,claim_date), notes = COALESCE($3,notes), updated_at = NOW() WHERE tenant_id = $4 AND id = $5 AND status = 'draft'`,
    [employee_name, claim_date, notes, tenantId, id]);
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function submitClaim(tenantId, id) {
  await query(`UPDATE acc_expense_claims SET status = 'submitted', updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND status = 'draft'`, [tenantId, id]);
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function approveClaim(tenantId, id, approvedBy) {
  await query(`UPDATE acc_expense_claims SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE tenant_id = $2 AND id = $3 AND status = 'submitted'`,
    [approvedBy || 'admin', tenantId, id]);
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function rejectClaim(tenantId, id, reason) {
  await query(`UPDATE acc_expense_claims SET status = 'rejected', notes = COALESCE($1, notes), updated_at = NOW() WHERE tenant_id = $2 AND id = $3 AND status = 'submitted'`,
    [reason, tenantId, id]);
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function addLine(tenantId, claimId, body) {
  const { expense_date, category, description, amount, tax, receipt_url, project_id } = body;
  const r = await query(
    'INSERT INTO acc_expense_lines (tenant_id, claim_id, expense_date, category, description, amount, tax, receipt_url, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [tenantId, claimId, expense_date, category, description, amount || 0, tax || 0, receipt_url, project_id]);
  const total = await query('SELECT SUM(amount + tax) as total FROM acc_expense_lines WHERE tenant_id = $1 AND claim_id = $2', [tenantId, claimId]);
  await query('UPDATE acc_expense_claims SET total = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [total.rows[0].total || 0, tenantId, claimId]);
  return r.rows[0];
}

async function deleteLine(tenantId, claimId, lineId) {
  await query('DELETE FROM acc_expense_lines WHERE tenant_id = $1 AND id = $2 AND claim_id = $3', [tenantId, lineId, claimId]);
  const total = await query('SELECT COALESCE(SUM(amount + tax), 0) as total FROM acc_expense_lines WHERE tenant_id = $1 AND claim_id = $2', [tenantId, claimId]);
  await query('UPDATE acc_expense_claims SET total = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [total.rows[0].total, tenantId, claimId]);
}

async function payClaim(tenantId, id) {
  await query(`UPDATE acc_expense_claims SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND status = 'approved'`, [tenantId, id]);
  const r = await query('SELECT * FROM acc_expense_claims WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  listClaims,
  listClaimsCsv,
  getClaimsSummary,
  createClaim,
  getClaim,
  updateClaim,
  submitClaim,
  approveClaim,
  rejectClaim,
  addLine,
  deleteLine,
  payClaim
};
