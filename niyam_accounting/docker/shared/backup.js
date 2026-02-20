/**
 * Data Backup & Restore Utility (Postgres version)
 * Creates encrypted JSON backups of all accounting data per tenant
 */
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.NIYAM_BACKUP_KEY || 'niyam-accounting-backup-key-2026';

const ALL_TABLES = [
  'acc_account_types', 'acc_accounts', 'acc_journal_entries', 'acc_journal_lines',
  'acc_ledger_entries', 'acc_fiscal_years', 'acc_fiscal_periods', 'acc_tax_codes',
  'acc_tax_transactions', 'acc_vendors', 'acc_bills', 'acc_bill_lines', 'acc_bill_payments',
  'acc_customers', 'acc_invoices', 'acc_invoice_lines', 'acc_invoice_payments',
  'acc_bank_accounts', 'acc_bank_transactions', 'acc_budgets', 'acc_budget_lines',
  'acc_cost_centers', 'acc_integration_events', 'acc_tds_transactions', 'acc_gst_returns',
  'acc_account_mappings', 'acc_company_settings', 'acc_vouchers', 'acc_voucher_lines',
  'acc_recurring_templates', 'acc_recurring_template_lines', 'acc_recurring_log',
  'acc_audit_log', 'acc_currencies', 'acc_exchange_rates', 'acc_companies', 'acc_branches',
  'acc_ewaybills', 'acc_inventory_valuation', 'acc_inventory_transactions', 'acc_payment_links',
  'acc_users', 'acc_roles', 'acc_user_roles'
];

async function createBackup(queryFn, tenantId) {
  const backup = {
    version: '2.0',
    created_at: new Date().toISOString(),
    tenant_id: tenantId,
    tables: {}
  };

  for (const table of ALL_TABLES) {
    try {
      const result = await queryFn(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      backup.tables[table] = result.rows;
    } catch (e) {
      backup.tables[table] = [];
    }
  }

  const jsonStr = JSON.stringify(backup);
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    content: iv.toString('hex') + ':' + encrypted,
    tables: Object.keys(backup.tables).length,
    created_at: backup.created_at
  };
}

async function restoreBackup(encryptedContent, queryFn, tenantId) {
  const [ivHex, encrypted] = encryptedContent.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const backup = JSON.parse(decrypted);
  let restored = 0;

  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!rows || rows.length === 0) continue;
    try {
      await queryFn(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      for (const row of rows) {
        row.tenant_id = tenantId;
        const cols = Object.keys(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
        const vals = cols.map(c => row[c]);
        await queryFn(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
        restored++;
      }
    } catch (e) {
      console.error(`[Backup] Restore ${table} failed:`, e.message);
    }
  }

  return { success: true, tables: Object.keys(backup.tables).length, records: restored, backup_date: backup.created_at };
}

module.exports = { createBackup, restoreBackup, ALL_TABLES };
