/**
 * Data Backup & Restore Utility
 * Creates encrypted JSON backups of all accounting data
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKUP_DIR = path.join(os.homedir(), '.niyam', 'data', 'accounting', 'backups');
const ENCRYPTION_KEY = process.env.NIYAM_BACKUP_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const ALL_TABLES = [
  'acc_account_types', 'acc_accounts', 'acc_journal_entries', 'acc_journal_lines',
  'acc_ledger_entries', 'acc_fiscal_years', 'acc_fiscal_periods', 'acc_tax_codes',
  'acc_tax_transactions', 'acc_vendors', 'acc_bills', 'acc_bill_lines', 'acc_bill_payments',
  'acc_customers', 'acc_invoices', 'acc_invoice_lines', 'acc_invoice_payments',
  'acc_bank_accounts', 'acc_bank_transactions', 'acc_budgets', 'acc_budget_lines',
  'acc_cost_centers', 'acc_integration_events', 'acc_tds_transactions', 'acc_gst_returns',
  'acc_account_mappings', 'acc_company_settings', 'acc_credit_notes', 'acc_credit_note_lines',
  'acc_debit_notes', 'acc_debit_note_lines', 'acc_vouchers', 'acc_voucher_lines',
  'acc_recurring_templates', 'acc_recurring_template_lines', 'acc_recurring_log',
  'acc_audit_log', 'acc_currencies', 'acc_exchange_rates', 'acc_companies', 'acc_branches',
  'acc_ewaybills', 'acc_inventory_valuation', 'acc_inventory_transactions', 'acc_payment_links',
  'acc_users', 'acc_roles', 'acc_user_roles'
];

function createBackup(queryFn) {
  const backup = {
    version: '2.0',
    created_at: new Date().toISOString(),
    tables: {}
  };

  ALL_TABLES.forEach(table => {
    try {
      backup.tables[table] = queryFn(`SELECT * FROM ${table}`);
    } catch (e) {
      backup.tables[table] = [];
    }
  });

  const jsonStr = JSON.stringify(backup);
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.niyam-backup`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const fileContent = iv.toString('hex') + ':' + encrypted;
  fs.writeFileSync(filePath, fileContent);

  return { fileName, filePath, size: Buffer.byteLength(fileContent), tables: Object.keys(backup.tables).length, created_at: backup.created_at };
}

function restoreBackup(filePath, runFn, queryFn) {
  const content = fs.readFileSync(filePath, 'utf8');
  const [ivHex, encrypted] = content.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const backup = JSON.parse(decrypted);
  let restored = 0;

  Object.entries(backup.tables).forEach(([table, rows]) => {
    if (!rows || rows.length === 0) return;
    try {
      runFn(`DELETE FROM ${table}`);
      rows.forEach(row => {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(',');
        const vals = cols.map(c => row[c]);
        runFn(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
      });
      restored += rows.length;
    } catch (e) {
      console.error(`[Backup] Restore ${table} failed:`, e.message);
    }
  });

  return { success: true, tables: Object.keys(backup.tables).length, records: restored, backup_date: backup.created_at };
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.niyam-backup'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { fileName: f, filePath: path.join(BACKUP_DIR, f), size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function deleteBackup(fileName) {
  const filePath = path.join(BACKUP_DIR, fileName);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
  return false;
}

module.exports = { createBackup, restoreBackup, listBackups, deleteBackup, BACKUP_DIR };
