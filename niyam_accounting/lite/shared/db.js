/**
 * Niyam Max Lite - Shared SQLite Database for Accounting
 * Using sql.js (pure JavaScript, no native deps)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.niyam', 'data', 'accounting');
const DB_PATH = path.join(DATA_DIR, 'accounting.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;

async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Backup last known good DB before loading
  if (fs.existsSync(DB_PATH)) {
    try { fs.copyFileSync(DB_PATH, DB_PATH + '.bak'); } catch (e) { /* ignore */ }
  }

  // Retry loading DB file in case another process is writing to it
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
      } else if (fs.existsSync(DB_PATH + '.bak')) {
        console.log('[Accounting DB] Main DB missing, restoring from backup...');
        const buffer = fs.readFileSync(DB_PATH + '.bak');
        db = new SQL.Database(buffer);
      } else {
        db = new SQL.Database();
      }
      break;
    } catch (err) {
      if (attempt < 4) {
        console.log(`[Accounting DB] Retry ${attempt + 1}/5 loading DB...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        // Last resort: try .bak file
        if (fs.existsSync(DB_PATH + '.bak')) {
          console.log('[Accounting DB] Main DB corrupt, restoring from backup...');
          try {
            const buffer = fs.readFileSync(DB_PATH + '.bak');
            db = new SQL.Database(buffer);
          } catch (e2) {
            console.error('[Accounting DB] Backup also corrupt, starting fresh');
            db = new SQL.Database();
          }
        } else {
          throw err;
        }
      }
    }
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Account Types
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_account_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('asset','liability','equity','revenue','expense')),
      normal_balance TEXT NOT NULL CHECK(normal_balance IN ('debit','credit')),
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Accounts (Chart of Accounts)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_accounts (
      id TEXT PRIMARY KEY,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type_id TEXT REFERENCES acc_account_types(id),
      parent_account_id TEXT REFERENCES acc_accounts(id),
      description TEXT,
      is_active INTEGER DEFAULT 1,
      is_system INTEGER DEFAULT 0,
      gst_applicable INTEGER DEFAULT 0,
      hsn_code TEXT,
      opening_balance REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Journal Entries
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_journal_entries (
      id TEXT PRIMARY KEY,
      entry_number TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_type TEXT DEFAULT 'STD',
      description TEXT,
      reference TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed','void')),
      total_debit REAL DEFAULT 0,
      total_credit REAL DEFAULT 0,
      created_by TEXT,
      posted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Journal Lines
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_journal_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL REFERENCES acc_journal_entries(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      description TEXT,
      debit_amount REAL DEFAULT 0,
      credit_amount REAL DEFAULT 0,
      cost_center_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Ledger Entries
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_ledger_entries (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      journal_entry_id TEXT REFERENCES acc_journal_entries(id),
      entry_date TEXT NOT NULL,
      description TEXT,
      debit_amount REAL DEFAULT 0,
      credit_amount REAL DEFAULT 0,
      running_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Fiscal Years
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_fiscal_years (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      is_closed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Fiscal Periods
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_fiscal_periods (
      id TEXT PRIMARY KEY,
      fiscal_year_id TEXT NOT NULL REFERENCES acc_fiscal_years(id),
      period_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      period_type TEXT DEFAULT 'month' CHECK(period_type IN ('month','quarter','year')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','adjustment')),
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Tax Codes
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_tax_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tax_type TEXT NOT NULL CHECK(tax_type IN ('gst','igst','cess','tds','custom')),
      rate REAL NOT NULL DEFAULT 0,
      cgst_rate REAL DEFAULT 0,
      sgst_rate REAL DEFAULT 0,
      igst_rate REAL DEFAULT 0,
      cess_rate REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      effective_from TEXT,
      effective_to TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Tax Transactions
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_tax_transactions (
      id TEXT PRIMARY KEY,
      tax_code_id TEXT NOT NULL REFERENCES acc_tax_codes(id),
      journal_entry_id TEXT REFERENCES acc_journal_entries(id),
      transaction_date TEXT NOT NULL,
      taxable_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      cess_amount REAL DEFAULT 0,
      tax_direction TEXT CHECK(tax_direction IN ('input','output')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Vendors (Accounts Payable)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_vendors (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'IN',
      gstin TEXT,
      pan TEXT,
      payment_terms INTEGER DEFAULT 30,
      credit_limit REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bills (Accounts Payable)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_bills (
      id TEXT PRIMARY KEY,
      bill_number TEXT NOT NULL,
      vendor_id TEXT NOT NULL REFERENCES acc_vendors(id),
      bill_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','approved','partial','paid','overdue','void')),
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      notes TEXT,
      journal_entry_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bill Lines
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_bill_lines (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL REFERENCES acc_bills(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      description TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      tax_code_id TEXT REFERENCES acc_tax_codes(id),
      tax_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bill Payments
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_bill_payments (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL REFERENCES acc_bills(id),
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'bank_transfer',
      reference TEXT,
      journal_entry_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Customers (Accounts Receivable)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_customers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'IN',
      gstin TEXT,
      pan TEXT,
      payment_terms INTEGER DEFAULT 30,
      credit_limit REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Invoices (Accounts Receivable)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES acc_customers(id),
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','partial','paid','overdue','void')),
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      notes TEXT,
      journal_entry_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Invoice Lines
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES acc_invoices(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      description TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      tax_code_id TEXT REFERENCES acc_tax_codes(id),
      tax_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Invoice Payments
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_invoice_payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES acc_invoices(id),
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'bank_transfer',
      reference TEXT,
      journal_entry_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bank Accounts
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_bank_accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT REFERENCES acc_accounts(id),
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      ifsc_code TEXT,
      branch TEXT,
      account_type TEXT DEFAULT 'current',
      currency TEXT DEFAULT 'INR',
      opening_balance REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bank Transactions (for reconciliation)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_bank_transactions (
      id TEXT PRIMARY KEY,
      bank_account_id TEXT NOT NULL REFERENCES acc_bank_accounts(id),
      transaction_date TEXT NOT NULL,
      description TEXT,
      reference TEXT,
      debit_amount REAL DEFAULT 0,
      credit_amount REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      is_reconciled INTEGER DEFAULT 0,
      reconciled_at TEXT,
      journal_entry_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Budgets
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_budgets (
      id TEXT PRIMARY KEY,
      fiscal_year_id TEXT NOT NULL REFERENCES acc_fiscal_years(id),
      name TEXT NOT NULL,
      description TEXT,
      budget_type TEXT DEFAULT 'operating' CHECK(budget_type IN ('operating','capital','project')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','approved','active','closed')),
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Budget Lines
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_budget_lines (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL REFERENCES acc_budgets(id),
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      cost_center_id TEXT,
      annual_amount REAL DEFAULT 0,
      q1_amount REAL DEFAULT 0,
      q2_amount REAL DEFAULT 0,
      q3_amount REAL DEFAULT 0,
      q4_amount REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Cost Centers
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_cost_centers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT REFERENCES acc_cost_centers(id),
      manager_name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Integration events log (for integration bridge lite)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_integration_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processed','failed')),
      processed_at TEXT,
      journal_entry_id TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // TDS Transactions
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_tds_transactions (
      id TEXT PRIMARY KEY,
      vendor_id TEXT REFERENCES acc_vendors(id),
      pan_number TEXT,
      deductee_name TEXT NOT NULL,
      deductee_type TEXT DEFAULT 'individual' CHECK(deductee_type IN ('individual','company','firm','huf','others')),
      section TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      tds_rate REAL NOT NULL DEFAULT 0,
      tds_amount REAL NOT NULL DEFAULT 0,
      challan_number TEXT,
      challan_date TEXT,
      bsr_code TEXT,
      certificate_number TEXT,
      is_deposited INTEGER DEFAULT 0,
      deposited_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // GST Returns
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_gst_returns (
      id TEXT PRIMARY KEY,
      return_type TEXT NOT NULL CHECK(return_type IN ('GSTR1','GSTR3B','GSTR9','GSTR2A','GSTR2B')),
      return_period TEXT NOT NULL,
      financial_year TEXT,
      filing_date TEXT,
      arn_number TEXT,
      acknowledgement_number TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','filed','accepted','rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Account Mappings (for integration bridge)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_account_mappings (
      id TEXT PRIMARY KEY,
      mapping_key TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(mapping_key)
    )
  `);

  // Add missing columns to existing tables via safe ALTERs
  const safeAlter = (table, column, type) => {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (_) { /* column already exists */ }
  };

  // Vendor enhancements
  safeAlter('acc_vendors', 'display_name', 'TEXT');
  safeAlter('acc_vendors', 'vendor_type', "TEXT DEFAULT 'supplier'");
  safeAlter('acc_vendors', 'tan', 'TEXT');
  safeAlter('acc_vendors', 'mobile', 'TEXT');
  safeAlter('acc_vendors', 'state_code', 'TEXT');
  safeAlter('acc_vendors', 'pincode', 'TEXT');
  safeAlter('acc_vendors', 'tds_applicable', 'INTEGER DEFAULT 0');
  safeAlter('acc_vendors', 'tds_section', 'TEXT');
  safeAlter('acc_vendors', 'default_expense_account_id', 'TEXT');
  safeAlter('acc_vendors', 'bank_name', 'TEXT');
  safeAlter('acc_vendors', 'bank_account_number', 'TEXT');
  safeAlter('acc_vendors', 'bank_ifsc', 'TEXT');
  safeAlter('acc_vendors', 'notes', 'TEXT');

  // Bill enhancements
  safeAlter('acc_bills', 'reference_number', 'TEXT');
  safeAlter('acc_bills', 'po_number', 'TEXT');
  safeAlter('acc_bills', 'exchange_rate', 'REAL DEFAULT 1');
  safeAlter('acc_bills', 'expense_account_id', 'TEXT');
  safeAlter('acc_bills', 'description', 'TEXT');
  safeAlter('acc_bills', 'is_interstate', 'INTEGER DEFAULT 0');
  safeAlter('acc_bills', 'itc_eligible', 'INTEGER DEFAULT 1');
  safeAlter('acc_bills', 'taxable_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'cgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'sgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'igst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'cess_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'total_tax', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'amount_paid', 'REAL DEFAULT 0');
  safeAlter('acc_bills', 'posted_at', 'TEXT');

  // Bill line enhancements
  safeAlter('acc_bill_lines', 'discount_percent', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'discount_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'net_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'hsn_sac_code', 'TEXT');
  safeAlter('acc_bill_lines', 'cgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'sgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'igst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'cess_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'total_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_lines', 'cost_center_id', 'TEXT');

  // Bill payment enhancements
  safeAlter('acc_bill_payments', 'bank_account_id', 'TEXT');
  safeAlter('acc_bill_payments', 'cheque_number', 'TEXT');
  safeAlter('acc_bill_payments', 'cheque_date', 'TEXT');
  safeAlter('acc_bill_payments', 'notes', 'TEXT');
  safeAlter('acc_bill_payments', 'tds_amount', 'REAL DEFAULT 0');
  safeAlter('acc_bill_payments', 'tds_section', 'TEXT');

  // Customer enhancements
  safeAlter('acc_customers', 'display_name', 'TEXT');
  safeAlter('acc_customers', 'customer_type', "TEXT DEFAULT 'business'");
  safeAlter('acc_customers', 'mobile', 'TEXT');
  safeAlter('acc_customers', 'state_code', 'TEXT');
  safeAlter('acc_customers', 'pincode', 'TEXT');
  safeAlter('acc_customers', 'default_revenue_account_id', 'TEXT');
  safeAlter('acc_customers', 'notes', 'TEXT');

  // Invoice enhancements
  safeAlter('acc_invoices', 'reference_number', 'TEXT');
  safeAlter('acc_invoices', 'so_number', 'TEXT');
  safeAlter('acc_invoices', 'exchange_rate', 'REAL DEFAULT 1');
  safeAlter('acc_invoices', 'revenue_account_id', 'TEXT');
  safeAlter('acc_invoices', 'description', 'TEXT');
  safeAlter('acc_invoices', 'terms_conditions', 'TEXT');
  safeAlter('acc_invoices', 'is_interstate', 'INTEGER DEFAULT 0');
  safeAlter('acc_invoices', 'place_of_supply', 'TEXT');
  safeAlter('acc_invoices', 'taxable_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'cgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'sgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'igst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'cess_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'total_tax', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'amount_received', 'REAL DEFAULT 0');
  safeAlter('acc_invoices', 'posted_at', 'TEXT');
  safeAlter('acc_invoices', 'gst_rate', 'REAL DEFAULT 0');

  // Invoice line enhancements
  safeAlter('acc_invoice_lines', 'discount_percent', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'discount_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'net_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'hsn_sac_code', 'TEXT');
  safeAlter('acc_invoice_lines', 'cgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'sgst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'igst_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'cess_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'total_amount', 'REAL DEFAULT 0');
  safeAlter('acc_invoice_lines', 'cost_center_id', 'TEXT');

  // Invoice payment enhancements
  safeAlter('acc_invoice_payments', 'bank_account_id', 'TEXT');
  safeAlter('acc_invoice_payments', 'cheque_number', 'TEXT');
  safeAlter('acc_invoice_payments', 'cheque_date', 'TEXT');
  safeAlter('acc_invoice_payments', 'notes', 'TEXT');
  safeAlter('acc_invoice_payments', 'tds_deducted', 'REAL DEFAULT 0');

  // Journal entry enhancements
  safeAlter('acc_journal_entries', 'reference_type', 'TEXT');
  safeAlter('acc_journal_entries', 'reference_id', 'TEXT');
  safeAlter('acc_journal_entries', 'source_system', 'TEXT');
  safeAlter('acc_journal_entries', 'source_document', 'TEXT');

  // Tax code enhancements
  safeAlter('acc_tax_codes', 'hsn_code', 'TEXT');
  safeAlter('acc_tax_codes', 'sac_code', 'TEXT');
  safeAlter('acc_tax_codes', 'description', 'TEXT');

  // Company Settings
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_company_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      company_name TEXT NOT NULL DEFAULT 'My Company',
      gstin TEXT,
      pan TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      state_code TEXT,
      pincode TEXT,
      email TEXT,
      phone TEXT,
      bank_name TEXT,
      bank_account TEXT,
      bank_ifsc TEXT,
      logo_base64 TEXT,
      invoice_terms TEXT,
      invoice_footer TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Credit Notes (Accounts Receivable)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_credit_notes (
      id TEXT PRIMARY KEY,
      credit_note_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES acc_customers(id),
      original_invoice_id TEXT REFERENCES acc_invoices(id),
      credit_note_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'return',
      reason_detail TEXT,
      subtotal REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','posted','applied','void')),
      applied_to_invoice_id TEXT,
      journal_entry_id TEXT,
      hsn_summary TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS acc_credit_note_lines (
      id TEXT PRIMARY KEY,
      credit_note_id TEXT NOT NULL REFERENCES acc_credit_notes(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      description TEXT,
      hsn_code TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      tax_code_id TEXT REFERENCES acc_tax_codes(id),
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Debit Notes (Accounts Payable)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_debit_notes (
      id TEXT PRIMARY KEY,
      debit_note_number TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL REFERENCES acc_vendors(id),
      original_bill_id TEXT REFERENCES acc_bills(id),
      debit_note_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'return',
      reason_detail TEXT,
      subtotal REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','posted','applied','void')),
      applied_to_bill_id TEXT,
      journal_entry_id TEXT,
      hsn_summary TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS acc_debit_note_lines (
      id TEXT PRIMARY KEY,
      debit_note_id TEXT NOT NULL REFERENCES acc_debit_notes(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      description TEXT,
      hsn_code TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      tax_code_id TEXT REFERENCES acc_tax_codes(id),
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Vouchers (Tally-style)
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_vouchers (
      id TEXT PRIMARY KEY,
      voucher_number TEXT NOT NULL,
      voucher_type TEXT NOT NULL CHECK(voucher_type IN ('sales','purchase','payment','receipt','contra','journal')),
      voucher_date TEXT NOT NULL,
      party_id TEXT,
      party_type TEXT,
      amount REAL NOT NULL DEFAULT 0,
      narration TEXT,
      reference TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','posted','void')),
      journal_entry_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS acc_voucher_lines (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL REFERENCES acc_vouchers(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      amount REAL NOT NULL DEFAULT 0,
      dr_cr TEXT NOT NULL CHECK(dr_cr IN ('dr','cr')),
      description TEXT,
      hsn_code TEXT,
      tax_code_id TEXT,
      tax_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Recurring Transaction Templates
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_recurring_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),
      day_of_month INTEGER,
      day_of_week INTEGER,
      start_date TEXT NOT NULL,
      end_date TEXT,
      next_run_date TEXT NOT NULL,
      last_run_date TEXT,
      party_id TEXT,
      party_type TEXT,
      amount REAL NOT NULL DEFAULT 0,
      narration TEXT,
      is_active INTEGER DEFAULT 1,
      auto_post INTEGER DEFAULT 0,
      run_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS acc_recurring_template_lines (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES acc_recurring_templates(id),
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES acc_accounts(id),
      amount REAL NOT NULL DEFAULT 0,
      dr_cr TEXT NOT NULL CHECK(dr_cr IN ('dr','cr')),
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS acc_recurring_log (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES acc_recurring_templates(id),
      generated_voucher_id TEXT,
      generated_date TEXT NOT NULL,
      status TEXT DEFAULT 'success' CHECK(status IN ('success','failed','skipped')),
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ============================================================
  // PHASE 2: New tables for 60% market parity
  // ============================================================

  // Audit Trail
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_audit_log (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('create','update','delete','post','void','reverse')),
      old_values TEXT,
      new_values TEXT,
      user_id TEXT DEFAULT 'system',
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_audit_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      retention_days INTEGER DEFAULT 1095,
      enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // User Authentication & Roles
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT DEFAULT '{}',
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_user_roles (
      user_id TEXT NOT NULL REFERENCES acc_users(id),
      role_id TEXT NOT NULL REFERENCES acc_roles(id),
      PRIMARY KEY (user_id, role_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES acc_users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Multi-Currency
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_currencies (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT '',
      decimal_places INTEGER DEFAULT 2,
      is_base INTEGER DEFAULT 0,
      exchange_rate REAL DEFAULT 1.0,
      rate_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_exchange_rates (
      id TEXT PRIMARY KEY,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      effective_date TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_forex_transactions (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT REFERENCES acc_journal_entries(id),
      original_amount REAL NOT NULL,
      original_currency TEXT NOT NULL,
      converted_amount REAL NOT NULL,
      base_currency TEXT DEFAULT 'INR',
      exchange_rate REAL NOT NULL,
      gain_loss REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bank Statement Imports
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_bank_imports (
      id TEXT PRIMARY KEY,
      bank_account_id TEXT REFERENCES acc_bank_accounts(id),
      file_name TEXT NOT NULL,
      file_format TEXT NOT NULL CHECK(file_format IN ('csv','ofx','mt940')),
      total_records INTEGER DEFAULT 0,
      imported_records INTEGER DEFAULT 0,
      skipped_records INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','preview','imported','failed')),
      column_mapping TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // E-Invoicing
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_einvoice_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      mode TEXT DEFAULT 'manual' CHECK(mode IN ('manual','api')),
      gsp_provider TEXT,
      gsp_username TEXT,
      gsp_password_enc TEXT,
      api_base_url TEXT,
      auth_token TEXT,
      token_expires_at TEXT,
      enabled INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // E-Way Bills
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_ewaybills (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      bill_id TEXT,
      ewb_number TEXT,
      ewb_date TEXT,
      valid_until TEXT,
      from_place TEXT,
      from_state TEXT,
      from_pincode TEXT,
      to_place TEXT,
      to_state TEXT,
      to_pincode TEXT,
      vehicle_number TEXT,
      vehicle_type TEXT DEFAULT 'R' CHECK(vehicle_type IN ('R','S')),
      transporter_id TEXT,
      transporter_name TEXT,
      transport_mode TEXT DEFAULT '1' CHECK(transport_mode IN ('1','2','3','4')),
      distance_km INTEGER DEFAULT 0,
      supply_type TEXT DEFAULT 'O' CHECK(supply_type IN ('O','I')),
      sub_supply_type TEXT,
      doc_type TEXT DEFAULT 'INV',
      doc_number TEXT,
      doc_date TEXT,
      total_value REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      cess_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','generated','active','cancelled','expired')),
      json_payload TEXT,
      cancel_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Inventory Valuation
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_inventory_valuation (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      product_name TEXT,
      valuation_method TEXT DEFAULT 'weighted_avg' CHECK(valuation_method IN ('fifo','lifo','weighted_avg','specific')),
      unit_cost REAL DEFAULT 0,
      total_qty REAL DEFAULT 0,
      total_value REAL DEFAULT 0,
      account_id TEXT REFERENCES acc_accounts(id),
      last_updated TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_inventory_transactions (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('purchase','sale','adjustment','return_in','return_out')),
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      journal_entry_id TEXT REFERENCES acc_journal_entries(id),
      reference_id TEXT,
      reference_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Multi-Company / Multi-Branch
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_companies (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gstin TEXT,
      pan TEXT,
      tan TEXT,
      cin TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      state_code TEXT,
      pincode TEXT,
      country TEXT DEFAULT 'India',
      phone TEXT,
      email TEXT,
      website TEXT,
      base_currency TEXT DEFAULT 'INR',
      fiscal_year_start INTEGER DEFAULT 4,
      logo_url TEXT,
      settings TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_branches (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES acc_companies(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      gstin TEXT,
      is_head_office INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Payment Gateway Links
  db.run(`
    CREATE TABLE IF NOT EXISTS acc_payment_links (
      id TEXT PRIMARY KEY,
      invoice_id TEXT REFERENCES acc_invoices(id),
      gateway TEXT NOT NULL CHECK(gateway IN ('razorpay','stripe','upi')),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      payment_link_url TEXT,
      short_url TEXT,
      status TEXT DEFAULT 'created' CHECK(status IN ('created','sent','paid','expired','cancelled')),
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      paid_at TEXT,
      expires_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add einvoice columns to acc_invoices if not present
  try { db.run('ALTER TABLE acc_invoices ADD COLUMN irn TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE acc_invoices ADD COLUMN irn_date TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE acc_invoices ADD COLUMN signed_qr TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE acc_invoices ADD COLUMN ack_number TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE acc_invoices ADD COLUMN einvoice_status TEXT DEFAULT \'none\''); } catch(e) {}
  try { db.run('ALTER TABLE acc_invoices ADD COLUMN einvoice_json TEXT'); } catch(e) {}

  // Add company_id to core tables if not present
  const coreTables = ['acc_accounts','acc_journal_entries','acc_vendors','acc_bills','acc_customers','acc_invoices',
    'acc_bank_accounts','acc_tax_codes','acc_fiscal_years','acc_budgets','acc_cost_centers','acc_vouchers',
    'acc_recurring_templates','acc_credit_notes','acc_debit_notes'];
  coreTables.forEach(t => {
    try { db.run(`ALTER TABLE ${t} ADD COLUMN company_id TEXT DEFAULT 'default'`); } catch(e) {}
  });

  // Indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_accounts_code ON acc_accounts(account_code)');
  db.run('CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON acc_credit_notes(customer_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON acc_credit_notes(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_debit_notes_vendor ON acc_debit_notes(vendor_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_debit_notes_status ON acc_debit_notes(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_vouchers_type ON acc_vouchers(voucher_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_vouchers_date ON acc_vouchers(voucher_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_vouchers_status ON acc_vouchers(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_recurring_next ON acc_recurring_templates(next_run_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_accounts_type ON acc_accounts(account_type_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON acc_journal_entries(entry_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON acc_journal_entries(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON acc_journal_lines(journal_entry_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON acc_journal_lines(account_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ledger_account ON acc_ledger_entries(account_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ledger_date ON acc_ledger_entries(entry_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bills_vendor ON acc_bills(vendor_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bills_status ON acc_bills(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_customer ON acc_invoices(customer_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_invoices_status ON acc_invoices(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON acc_bank_transactions(bank_account_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tax_txn_date ON acc_tax_transactions(transaction_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tds_section ON acc_tds_transactions(section)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tds_date ON acc_tds_transactions(transaction_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_gst_returns_period ON acc_gst_returns(return_period)');
  db.run('CREATE INDEX IF NOT EXISTS idx_gst_returns_type ON acc_gst_returns(return_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_integration_status ON acc_integration_events(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_integration_source ON acc_integration_events(source)');

  // ============================================
  // PHASE 2: APPROVAL WORKFLOWS
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_approval_rules (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    min_amount REAL DEFAULT 0,
    max_amount REAL,
    approver_role TEXT NOT NULL,
    sequence INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_approval_history (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT,
    comments TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 3: PURCHASE ORDERS
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT UNIQUE,
    vendor_id TEXT,
    order_date TEXT,
    expected_date TEXT,
    items TEXT,
    subtotal REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    approved_by TEXT,
    approved_at TEXT,
    notes TEXT,
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_po_receipts (
    id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL,
    receipt_date TEXT,
    items_received TEXT,
    received_by TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 3: EXPENSE CLAIMS
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_expense_claims (
    id TEXT PRIMARY KEY,
    claim_number TEXT UNIQUE,
    employee_id TEXT,
    employee_name TEXT,
    claim_date TEXT,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    approved_by TEXT,
    approved_at TEXT,
    paid_at TEXT,
    journal_entry_id TEXT,
    notes TEXT,
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_expense_lines (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    expense_date TEXT,
    category TEXT,
    description TEXT,
    amount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    receipt_url TEXT,
    project_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_expense_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gl_account_id TEXT,
    requires_receipt INTEGER DEFAULT 0,
    max_amount REAL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 4: PROJECT/JOB COSTING
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_projects (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    customer_id TEXT,
    manager_id TEXT,
    budget REAL DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active',
    billing_type TEXT DEFAULT 'fixed',
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_project_costs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    cost_type TEXT,
    source_type TEXT,
    source_id TEXT,
    description TEXT,
    amount REAL DEFAULT 0,
    cost_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_project_revenue (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    invoice_id TEXT,
    amount REAL DEFAULT 0,
    revenue_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 4: FIXED ASSETS & DEPRECIATION
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_asset_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_useful_life INTEGER DEFAULT 60,
    default_method TEXT DEFAULT 'SLM',
    gl_asset_account TEXT,
    gl_depreciation_account TEXT,
    gl_expense_account TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_fixed_assets (
    id TEXT PRIMARY KEY,
    asset_code TEXT UNIQUE,
    name TEXT NOT NULL,
    category_id TEXT,
    purchase_date TEXT,
    purchase_value REAL DEFAULT 0,
    salvage_value REAL DEFAULT 0,
    useful_life_months INTEGER DEFAULT 60,
    depreciation_method TEXT DEFAULT 'SLM',
    gl_asset_account TEXT,
    gl_depreciation_account TEXT,
    gl_expense_account TEXT,
    status TEXT DEFAULT 'active',
    disposed_date TEXT,
    disposed_value REAL,
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_depreciation_entries (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    period TEXT,
    depreciation_amount REAL DEFAULT 0,
    accumulated REAL DEFAULT 0,
    book_value REAL DEFAULT 0,
    journal_entry_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 5: ADVANCED BUDGETING
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_budget_versions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    fiscal_year_id TEXT,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft',
    created_by TEXT,
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_budget_version_lines (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    account_id TEXT,
    cost_center_id TEXT,
    period TEXT,
    amount REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 5: CUSTOM REPORT BUILDER
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_saved_reports (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    query_config TEXT,
    columns TEXT,
    filters TEXT,
    created_by TEXT,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_report_schedules (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    frequency TEXT DEFAULT 'monthly',
    recipients TEXT,
    last_run TEXT,
    next_run TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 6: PAYROLL
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_salary_structures (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    basic_pct REAL DEFAULT 50,
    hra_pct REAL DEFAULT 20,
    da_pct REAL DEFAULT 10,
    special_allowance REAL DEFAULT 0,
    pf_employer_pct REAL DEFAULT 12,
    esi_employer_pct REAL DEFAULT 3.25,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_employees (
    id TEXT PRIMARY KEY,
    emp_code TEXT UNIQUE,
    name TEXT NOT NULL,
    department TEXT,
    designation TEXT,
    date_of_joining TEXT,
    pan TEXT,
    uan TEXT,
    esi_number TEXT,
    bank_account TEXT,
    bank_ifsc TEXT,
    salary_structure_id TEXT,
    gross_salary REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_payroll_runs (
    id TEXT PRIMARY KEY,
    run_number TEXT UNIQUE,
    period_month INTEGER,
    period_year INTEGER,
    status TEXT DEFAULT 'draft',
    total_gross REAL DEFAULT 0,
    total_deductions REAL DEFAULT 0,
    total_net REAL DEFAULT 0,
    processed_by TEXT,
    processed_at TEXT,
    approved_by TEXT,
    approved_at TEXT,
    journal_entry_id TEXT,
    company_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_payslips (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    basic REAL DEFAULT 0,
    hra REAL DEFAULT 0,
    da REAL DEFAULT 0,
    special REAL DEFAULT 0,
    gross REAL DEFAULT 0,
    pf_employee REAL DEFAULT 0,
    pf_employer REAL DEFAULT 0,
    esi_employee REAL DEFAULT 0,
    esi_employer REAL DEFAULT 0,
    pt REAL DEFAULT 0,
    tds REAL DEFAULT 0,
    other_deductions REAL DEFAULT 0,
    net_pay REAL DEFAULT 0,
    journal_entry_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acc_payroll_settings (
    id TEXT PRIMARY KEY,
    pf_rate_employee REAL DEFAULT 12,
    pf_rate_employer REAL DEFAULT 12,
    pf_wage_ceiling REAL DEFAULT 15000,
    esi_rate_employee REAL DEFAULT 0.75,
    esi_rate_employer REAL DEFAULT 3.25,
    esi_wage_ceiling REAL DEFAULT 21000,
    pt_slabs TEXT,
    tds_slabs TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============================================
  // PHASE 7: MULTI-USER COLLABORATION
  // ============================================
  db.run(`CREATE TABLE IF NOT EXISTS acc_record_locks (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    locked_by TEXT,
    locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
  )`);

  // Indexes for new tables
  db.run('CREATE INDEX IF NOT EXISTS idx_approval_entity ON acc_approval_history(entity_type, entity_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_po_vendor ON acc_purchase_orders(vendor_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_po_status ON acc_purchase_orders(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_expense_status ON acc_expense_claims(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_status ON acc_projects(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_costs ON acc_project_costs(project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_asset_status ON acc_fixed_assets(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_depreciation_asset ON acc_depreciation_entries(asset_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_payslip_run ON acc_payslips(run_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_payslip_employee ON acc_payslips(employee_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_record_locks ON acc_record_locks(entity_type, entity_id)');

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error('[Accounting DB] Save failed:', err.message);
  }
}

// Graceful shutdown
let _isShuttingDown = false;
function _shutdown(signal) {
  if (_isShuttingDown) return;
  _isShuttingDown = true;
  console.log(`[Accounting DB] ${signal} received, saving...`);
  saveDb();
  process.exit(0);
}
process.on('SIGINT', () => _shutdown('SIGINT'));
process.on('SIGTERM', () => _shutdown('SIGTERM'));

function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('[Accounting DB] Query error:', sql, err.message);
    throw err;
  }
}

function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  try {
    db.run(sql, params);
    saveDb();
    return { changes: db.getRowsModified() };
  } catch (err) {
    console.error('[Accounting DB] Run error:', sql, err.message);
    throw err;
  }
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function getDb() {
  return db;
}

module.exports = { initDb, query, run, get, getDb, saveDb, DB_PATH, DATA_DIR };
