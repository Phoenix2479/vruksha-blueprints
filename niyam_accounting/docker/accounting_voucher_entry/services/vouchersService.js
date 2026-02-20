// Voucher Entry Service - Business logic + DB queries
// Handles vouchers, recurring templates, reference lookups, exports

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

const VOUCHER_TYPES = [
  { type: 'sales', label: 'Sales', shortcut: 'F8', dr: 'AR/Cash', cr: 'Revenue + GST' },
  { type: 'purchase', label: 'Purchase', shortcut: 'F9', dr: 'Expense + GST ITC', cr: 'AP/Cash' },
  { type: 'payment', label: 'Payment', shortcut: 'F5', dr: 'Expense/AP', cr: 'Cash/Bank' },
  { type: 'receipt', label: 'Receipt', shortcut: 'F6', dr: 'Cash/Bank', cr: 'Revenue/AR' },
  { type: 'contra', label: 'Contra', shortcut: 'F4', dr: 'Cash/Bank', cr: 'Bank/Cash' },
  { type: 'journal', label: 'Journal', shortcut: 'F7', dr: 'Custom', cr: 'Custom' }
];

// ─── Voucher Types ──────────────────────────────────────────────────

function getVoucherTypes() {
  return VOUCHER_TYPES;
}

// ─── Vouchers ───────────────────────────────────────────────────────

async function listVouchers(tenantId, filters) {
  const { type, status, from_date, to_date, limit: lim } = filters;
  let sql = 'SELECT * FROM acc_vouchers WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;
  if (type) { sql += ` AND voucher_type = $${idx++}`; params.push(type); }
  if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
  if (from_date) { sql += ` AND voucher_date >= $${idx++}`; params.push(from_date); }
  if (to_date) { sql += ` AND voucher_date <= $${idx++}`; params.push(to_date); }
  sql += ' ORDER BY voucher_date DESC, created_at DESC';
  if (lim) { sql += ` LIMIT $${idx++}`; params.push(parseInt(lim)); }
  const r = await query(sql, params);
  return r.rows;
}

async function getVoucher(tenantId, id) {
  const r = await query('SELECT * FROM acc_vouchers WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const lines = await query('SELECT * FROM acc_voucher_lines WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_number', [tenantId, id]);
  return { ...r.rows[0], lines: lines.rows };
}

async function createVoucher(tenantId, data) {
  const { voucher_type, voucher_date, party_id, party_type, amount, narration, reference, lines } = data;
  const vNum = `${voucher_type.toUpperCase().slice(0,3)}-${Date.now().toString(36).toUpperCase()}`;
  const r = await query(
    `INSERT INTO acc_vouchers (tenant_id, voucher_number, voucher_type, voucher_date, party_id, party_type, amount, narration, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, vNum, voucher_type, voucher_date, party_id || null, party_type || null, amount || 0, narration || null, reference || null]
  );
  const voucher = r.rows[0];
  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await query(
        `INSERT INTO acc_voucher_lines (tenant_id, voucher_id, line_number, account_id, amount, dr_cr, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, voucher.id, i + 1, l.account_id, l.amount || 0, l.dr_cr || 'dr', l.description || null]
      );
    }
  }
  return voucher;
}

async function postVoucher(tenantId, id) {
  const v = await query('SELECT * FROM acc_vouchers WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!v.rows.length) return { notFound: true };
  if (v.rows[0].status !== 'draft') return { notDraft: true };
  const lines = await query('SELECT * FROM acc_voucher_lines WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_number', [tenantId, id]);
  if (!lines.rows.length) return { noLines: true };
  const totalDr = lines.rows.filter(l => l.dr_cr === 'dr').reduce((s, l) => s + parseFloat(l.amount), 0);
  const totalCr = lines.rows.filter(l => l.dr_cr === 'cr').reduce((s, l) => s + parseFloat(l.amount), 0);
  if (Math.abs(totalDr - totalCr) > 0.01) return { unbalanced: true, totalDr, totalCr };

  const jeNum = `JE-${Date.now().toString(36).toUpperCase()}`;
  const je = await query(
    `INSERT INTO acc_journal_entries (tenant_id, entry_number, entry_date, description, status, total_debit, total_credit, source)
     VALUES ($1,$2,$3,$4,'posted',$5,$6,'voucher') RETURNING *`,
    [tenantId, jeNum, v.rows[0].voucher_date, v.rows[0].narration || `Voucher ${v.rows[0].voucher_number}`, totalDr, totalCr]
  );
  for (const l of lines.rows) {
    await query(
      `INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, je.rows[0].id, l.account_id, l.dr_cr === 'dr' ? l.amount : 0, l.dr_cr === 'cr' ? l.amount : 0, l.description]
    );
  }
  await query('UPDATE acc_vouchers SET status = $1, journal_entry_id = $2, updated_at = NOW() WHERE tenant_id = $3 AND id = $4',
    ['posted', je.rows[0].id, tenantId, id]);
  return { voucher_id: id, journal_entry_id: je.rows[0].id };
}

async function voidVoucher(tenantId, id) {
  await query('UPDATE acc_vouchers SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', ['void', tenantId, id]);
}

// ─── Recurring Templates ────────────────────────────────────────────

async function listRecurring(tenantId) {
  const r = await query('SELECT * FROM acc_recurring_templates WHERE tenant_id = $1 ORDER BY next_run_date', [tenantId]);
  return r.rows;
}

async function getRecurring(tenantId, id) {
  const r = await query('SELECT * FROM acc_recurring_templates WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const lines = await query('SELECT * FROM acc_recurring_template_lines WHERE tenant_id = $1 AND template_id = $2 ORDER BY line_number', [tenantId, id]);
  return { ...r.rows[0], lines: lines.rows };
}

async function createRecurring(tenantId, data) {
  const { name, voucher_type, frequency, day_of_month, start_date, end_date, amount, narration, auto_post, lines } = data;
  const r = await query(
    `INSERT INTO acc_recurring_templates (tenant_id, name, voucher_type, frequency, day_of_month, start_date, end_date, next_run_date, amount, narration, auto_post)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [tenantId, name, voucher_type, frequency, day_of_month || 1, start_date, end_date || null, start_date, amount || 0, narration || null, auto_post || false]
  );
  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await query(
        `INSERT INTO acc_recurring_template_lines (tenant_id, template_id, line_number, account_id, amount, dr_cr, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, r.rows[0].id, i + 1, l.account_id, l.amount || 0, l.dr_cr || 'dr', l.description || null]
      );
    }
  }
  return r.rows[0];
}

async function updateRecurring(tenantId, id, data) {
  const { name, frequency, day_of_month, end_date, amount, narration, auto_post } = data;
  await query(
    `UPDATE acc_recurring_templates SET name = COALESCE($1, name), frequency = COALESCE($2, frequency),
     day_of_month = COALESCE($3, day_of_month), end_date = COALESCE($4, end_date),
     amount = COALESCE($5, amount), narration = COALESCE($6, narration), auto_post = COALESCE($7, auto_post),
     updated_at = NOW() WHERE tenant_id = $8 AND id = $9`,
    [name, frequency, day_of_month, end_date, amount, narration, auto_post, tenantId, id]
  );
  const r = await query('SELECT * FROM acc_recurring_templates WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function deleteRecurring(tenantId, id) {
  await query('DELETE FROM acc_recurring_template_lines WHERE tenant_id = $1 AND template_id = $2', [tenantId, id]);
  await query('DELETE FROM acc_recurring_templates WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
}

async function pauseRecurring(tenantId, id) {
  const r = await query('SELECT is_active FROM acc_recurring_templates WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const newState = !r.rows[0].is_active;
  await query('UPDATE acc_recurring_templates SET is_active = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [newState, tenantId, id]);
  return { is_active: newState };
}

async function runRecurring(tenantId) {
  const today = new Date().toISOString().split('T')[0];
  const due = await query('SELECT * FROM acc_recurring_templates WHERE tenant_id = $1 AND is_active = true AND next_run_date <= $2', [tenantId, today]);
  const results = [];
  for (const tmpl of due.rows) {
    const vNum = `${tmpl.voucher_type.toUpperCase().slice(0,3)}-${Date.now().toString(36).toUpperCase()}`;
    const v = await query(
      `INSERT INTO acc_vouchers (tenant_id, voucher_number, voucher_type, voucher_date, amount, narration, status)
       VALUES ($1,$2,$3,$4,$5,$6,'draft') RETURNING *`,
      [tenantId, vNum, tmpl.voucher_type, today, tmpl.amount, tmpl.narration]
    );
    const lines = await query('SELECT * FROM acc_recurring_template_lines WHERE tenant_id = $1 AND template_id = $2', [tenantId, tmpl.id]);
    for (const l of lines.rows) {
      await query(
        `INSERT INTO acc_voucher_lines (tenant_id, voucher_id, line_number, account_id, amount, dr_cr, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, v.rows[0].id, l.line_number, l.account_id, l.amount, l.dr_cr, l.description]
      );
    }
    await query(`INSERT INTO acc_recurring_log (tenant_id, template_id, generated_voucher_id, generated_date, status) VALUES ($1,$2,$3,$4,'success')`,
      [tenantId, tmpl.id, v.rows[0].id, today]);
    let nextDate = new Date(tmpl.next_run_date);
    if (tmpl.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    else if (tmpl.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    else if (tmpl.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    else if (tmpl.frequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
    else if (tmpl.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
    await query('UPDATE acc_recurring_templates SET next_run_date = $1, last_run_date = $2, run_count = run_count + 1, updated_at = NOW() WHERE id = $3',
      [nextDate.toISOString().split('T')[0], today, tmpl.id]);
    results.push({ template_id: tmpl.id, voucher_id: v.rows[0].id });
  }
  return { processed: results.length, results };
}

async function getRecurringHistory(tenantId, id) {
  const r = await query('SELECT * FROM acc_recurring_log WHERE tenant_id = $1 AND template_id = $2 ORDER BY generated_date DESC', [tenantId, id]);
  return r.rows;
}

// ─── Reference lookups ──────────────────────────────────────────────

async function listAccounts(tenantId) {
  const r = await query(
    `SELECT a.id, a.account_code, a.account_name, t.category
     FROM acc_accounts a LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE a.tenant_id = $1 AND a.is_active = true AND a.is_header = false ORDER BY a.account_code`, [tenantId]);
  return r.rows;
}

async function listParties(tenantId) {
  const customers = await query('SELECT id, code, name, \'customer\' as party_type FROM acc_customers WHERE tenant_id = $1', [tenantId]);
  const vendors = await query('SELECT id, code, name, \'vendor\' as party_type FROM acc_vendors WHERE tenant_id = $1', [tenantId]);
  return [...customers.rows, ...vendors.rows];
}

// ─── Export ─────────────────────────────────────────────────────────

async function listVouchersForExport(tenantId) {
  const r = await query('SELECT * FROM acc_vouchers WHERE tenant_id = $1 ORDER BY voucher_date DESC', [tenantId]);
  return r.rows;
}

module.exports = {
  getVoucherTypes,
  listVouchers,
  getVoucher,
  createVoucher,
  postVoucher,
  voidVoucher,
  listRecurring,
  getRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  pauseRecurring,
  runRecurring,
  getRecurringHistory,
  listAccounts,
  listParties,
  listVouchersForExport
};
