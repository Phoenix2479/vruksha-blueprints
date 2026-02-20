// Invoice Service - Business logic and DB queries for invoices, receipts, and aging

let db, sdk;
try {
  db = require('../../../../../db/postgres');
  sdk = require('../../../../../platform/sdk/node');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

// ============================================
// INVOICE CRUD
// ============================================

async function listInvoices(tenantId, { customer_id, status, start_date, end_date, overdue, limit = 100, offset = 0 }) {
  let sql = `
    SELECT i.*, c.name as customer_name, c.code as customer_code
    FROM acc_customer_invoices i
    JOIN acc_customers c ON i.customer_id = c.id
    WHERE i.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (customer_id) {
    sql += ` AND i.customer_id = $${paramIndex++}`;
    params.push(customer_id);
  }

  if (status) {
    sql += ` AND i.status = $${paramIndex++}`;
    params.push(status);
  }

  if (start_date) {
    sql += ` AND i.invoice_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    sql += ` AND i.invoice_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  if (overdue === 'true') {
    sql += ` AND i.due_date < CURRENT_DATE AND i.balance_due > 0`;
  }

  sql += ` ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);

  return result.rows;
}

async function getInvoiceById(tenantId, id) {
  const invoice = await query(`
    SELECT i.*, c.name as customer_name, c.code as customer_code, c.gstin as customer_gstin,
           c.address_line1, c.address_line2, c.city, c.state, c.pincode
    FROM acc_customer_invoices i
    JOIN acc_customers c ON i.customer_id = c.id
    WHERE i.id = $1 AND i.tenant_id = $2
  `, [id, tenantId]);

  if (invoice.rows.length === 0) return null;

  // Get invoice lines
  const lines = await query(`
    SELECT il.*, a.account_code, a.account_name, tc.code as tax_code, tc.rate as tax_rate
    FROM acc_customer_invoice_lines il
    JOIN acc_accounts a ON il.account_id = a.id
    LEFT JOIN acc_tax_codes tc ON il.tax_code_id = tc.id
    WHERE il.invoice_id = $1 AND il.tenant_id = $2
    ORDER BY il.line_number
  `, [id, tenantId]);

  // Get receipts
  const receipts = await query(`
    SELECT * FROM acc_customer_receipts
    WHERE invoice_id = $1 AND tenant_id = $2
    ORDER BY receipt_date DESC
  `, [id, tenantId]);

  return {
    ...invoice.rows[0],
    lines: lines.rows,
    receipts: receipts.rows
  };
}

async function createInvoice(tenantId, invoiceData, lines, invoiceLineSchema) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: { code: 'NO_LINES', message: 'Invoice must have at least one line' }, status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const data = invoiceData;

    // Calculate totals from lines
    let subtotal = 0, totalTax = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;

    for (const line of lines) {
      const lineValidation = invoiceLineSchema.safeParse(line);
      if (!lineValidation.success) continue;

      const l = lineValidation.data;
      const lineAmount = l.quantity * l.unit_price * (1 - l.discount_percent / 100);
      subtotal += lineAmount;

      if (l.tax_code_id) {
        const taxCode = await client.query(
          'SELECT rate, cgst_rate, sgst_rate, igst_rate, cess_rate FROM acc_tax_codes WHERE id = $1',
          [l.tax_code_id]
        );
        if (taxCode.rows.length > 0) {
          const tc = taxCode.rows[0];
          if (data.is_interstate) {
            totalIgst += lineAmount * (parseFloat(tc.igst_rate || tc.rate) / 100);
          } else {
            totalCgst += lineAmount * (parseFloat(tc.cgst_rate || tc.rate / 2) / 100);
            totalSgst += lineAmount * (parseFloat(tc.sgst_rate || tc.rate / 2) / 100);
          }
          totalCess += lineAmount * (parseFloat(tc.cess_rate || 0) / 100);
        }
      }
    }

    totalTax = totalCgst + totalSgst + totalIgst + totalCess;
    const totalAmount = subtotal + totalTax;

    // Create invoice
    const invoiceResult = await client.query(`
      INSERT INTO acc_customer_invoices (
        tenant_id, customer_id, invoice_number, invoice_date, due_date, reference_number,
        so_number, currency, exchange_rate, revenue_account_id, description, notes,
        terms_conditions, is_interstate, place_of_supply, subtotal, taxable_amount,
        cgst_amount, sgst_amount, igst_amount, cess_amount, total_tax, total_amount,
        balance_due, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'draft')
      RETURNING *
    `, [
      tenantId, data.customer_id, data.invoice_number, data.invoice_date, data.due_date,
      data.reference_number, data.so_number, data.currency, data.exchange_rate,
      data.revenue_account_id, data.description, data.notes, data.terms_conditions,
      data.is_interstate, data.place_of_supply, subtotal, subtotal, totalCgst, totalSgst,
      totalIgst, totalCess, totalTax, totalAmount, totalAmount
    ]);

    const invoiceId = invoiceResult.rows[0].id;

    // Create invoice lines
    let lineNumber = 1;
    for (const line of lines) {
      const lineValidation = invoiceLineSchema.safeParse(line);
      if (!lineValidation.success) continue;

      const l = lineValidation.data;
      const lineAmount = l.quantity * l.unit_price;
      const discountAmount = lineAmount * (l.discount_percent / 100);
      const netAmount = lineAmount - discountAmount;

      let lineCgst = 0, lineSgst = 0, lineIgst = 0, lineCess = 0, lineTotal = netAmount;

      if (l.tax_code_id) {
        const taxCode = await client.query(
          'SELECT rate, cgst_rate, sgst_rate, igst_rate, cess_rate FROM acc_tax_codes WHERE id = $1',
          [l.tax_code_id]
        );
        if (taxCode.rows.length > 0) {
          const tc = taxCode.rows[0];
          if (data.is_interstate) {
            lineIgst = netAmount * (parseFloat(tc.igst_rate || tc.rate) / 100);
          } else {
            lineCgst = netAmount * (parseFloat(tc.cgst_rate || tc.rate / 2) / 100);
            lineSgst = netAmount * (parseFloat(tc.sgst_rate || tc.rate / 2) / 100);
          }
          lineCess = netAmount * (parseFloat(tc.cess_rate || 0) / 100);
          lineTotal = netAmount + lineCgst + lineSgst + lineIgst + lineCess;
        }
      }

      await client.query(`
        INSERT INTO acc_customer_invoice_lines (
          tenant_id, invoice_id, line_number, description, account_id, quantity,
          unit_price, discount_percent, discount_amount, net_amount, tax_code_id,
          hsn_sac_code, cgst_amount, sgst_amount, igst_amount, cess_amount,
          total_amount, cost_center_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        tenantId, invoiceId, lineNumber++, l.description, l.account_id, l.quantity,
        l.unit_price, l.discount_percent, discountAmount, netAmount, l.tax_code_id,
        l.hsn_sac_code, lineCgst, lineSgst, lineIgst, lineCess, lineTotal, l.cost_center_id
      ]);
    }

    await client.query('COMMIT');

    await publishEnvelope('accounting.invoice.created', { tenantId, invoice: invoiceResult.rows[0] });

    return { data: invoiceResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function postInvoice(tenantId, id) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const invoice = await client.query(`
      SELECT i.*, c.name as customer_name
      FROM acc_customer_invoices i
      JOIN acc_customers c ON i.customer_id = c.id
      WHERE i.id = $1 AND i.tenant_id = $2
    `, [id, tenantId]);

    if (invoice.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { code: 'NOT_FOUND', message: 'Invoice not found' }, status: 404 };
    }

    if (invoice.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return { error: { code: 'ALREADY_POSTED', message: 'Invoice is already posted' }, status: 400 };
    }

    const invoiceData = invoice.rows[0];

    // Get AR account (Accounts Receivable asset account)
    const arAccount = await client.query(`
      SELECT id FROM acc_accounts WHERE account_code = '1200' AND tenant_id = $1
    `, [tenantId]);

    if (arAccount.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { code: 'NO_AR_ACCOUNT', message: 'Accounts Receivable account not configured' }, status: 400 };
    }

    // Create journal entry
    const entryResult = await client.query(`
      INSERT INTO acc_journal_entries (
        tenant_id, entry_date, entry_number, entry_type, description, reference_type,
        reference_id, source_document, status
      ) VALUES ($1, $2, $3, 'AR', $4, 'invoice', $5, $6, 'draft')
      RETURNING *
    `, [
      tenantId, invoiceData.invoice_date, `JE-INV-${invoiceData.invoice_number}`,
      `Invoice to ${invoiceData.customer_name}: ${invoiceData.invoice_number}`,
      id, invoiceData.invoice_number
    ]);

    const journalId = entryResult.rows[0].id;

    // Get invoice lines
    const lines = await client.query(`
      SELECT * FROM acc_customer_invoice_lines WHERE invoice_id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    let lineNum = 1;

    // Debit AR account for total
    await client.query(`
      INSERT INTO acc_journal_lines (
        tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, 0)
    `, [tenantId, journalId, lineNum++, arAccount.rows[0].id, `Receivable from ${invoiceData.customer_name}`, invoiceData.total_amount]);

    // Credit revenue accounts
    for (const line of lines.rows) {
      await client.query(`
        INSERT INTO acc_journal_lines (
          tenant_id, journal_entry_id, line_number, account_id, description,
          debit_amount, credit_amount, cost_center_id
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
      `, [tenantId, journalId, lineNum++, line.account_id, line.description, line.net_amount, line.cost_center_id]);

      // Tax entries
      if (parseFloat(line.cgst_amount) > 0) {
        const cgstAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '2200' AND tenant_id = $1`, [tenantId]);
        if (cgstAccount.rows.length > 0) {
          await client.query(`
            INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
            VALUES ($1, $2, $3, $4, 'Output CGST', 0, $5)
          `, [tenantId, journalId, lineNum++, cgstAccount.rows[0].id, line.cgst_amount]);
        }
      }

      if (parseFloat(line.sgst_amount) > 0) {
        const sgstAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '2201' AND tenant_id = $1`, [tenantId]);
        if (sgstAccount.rows.length > 0) {
          await client.query(`
            INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
            VALUES ($1, $2, $3, $4, 'Output SGST', 0, $5)
          `, [tenantId, journalId, lineNum++, sgstAccount.rows[0].id, line.sgst_amount]);
        }
      }

      if (parseFloat(line.igst_amount) > 0) {
        const igstAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '2202' AND tenant_id = $1`, [tenantId]);
        if (igstAccount.rows.length > 0) {
          await client.query(`
            INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
            VALUES ($1, $2, $3, $4, 'Output IGST', 0, $5)
          `, [tenantId, journalId, lineNum++, igstAccount.rows[0].id, line.igst_amount]);
        }
      }
    }

    // Update invoice status
    await client.query(`
      UPDATE acc_customer_invoices SET status = 'posted', journal_entry_id = $3, posted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId, journalId]);

    // Post the journal entry
    await client.query(`
      UPDATE acc_journal_entries SET status = 'posted', posted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [journalId, tenantId]);

    await client.query('COMMIT');

    await publishEnvelope('accounting.invoice.posted', { tenantId, invoiceId: id, journalEntryId: journalId });

    return { data: { invoice_id: id, journal_entry_id: journalId, status: 'posted' } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// RECEIPTS
// ============================================

async function recordReceipt(tenantId, data) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const invoice = await client.query(`
      SELECT i.*, c.name as customer_name
      FROM acc_customer_invoices i
      JOIN acc_customers c ON i.customer_id = c.id
      WHERE i.id = $1 AND i.tenant_id = $2
    `, [data.invoice_id, tenantId]);

    if (invoice.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { code: 'NOT_FOUND', message: 'Invoice not found' }, status: 404 };
    }

    const invoiceData = invoice.rows[0];

    if (invoiceData.status === 'draft') {
      await client.query('ROLLBACK');
      return { error: { code: 'NOT_POSTED', message: 'Invoice must be posted before receipt' }, status: 400 };
    }

    if (data.amount > parseFloat(invoiceData.balance_due)) {
      await client.query('ROLLBACK');
      return { error: { code: 'OVERPAYMENT', message: 'Receipt exceeds balance due' }, status: 400 };
    }

    // Create receipt record
    const receiptResult = await client.query(`
      INSERT INTO acc_customer_receipts (
        tenant_id, invoice_id, receipt_date, amount, payment_method, bank_account_id,
        reference_number, cheque_number, cheque_date, notes, tds_deducted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      tenantId, data.invoice_id, data.receipt_date, data.amount, data.payment_method,
      data.bank_account_id, data.reference_number, data.cheque_number, data.cheque_date,
      data.notes, data.tds_deducted
    ]);

    // Update invoice balance
    const newBalance = parseFloat(invoiceData.balance_due) - data.amount;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    await client.query(`
      UPDATE acc_customer_invoices
      SET balance_due = $3, amount_received = amount_received + $4, status = $5, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [data.invoice_id, tenantId, newBalance, data.amount, newStatus]);

    // Create journal entry for receipt
    const arAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '1200' AND tenant_id = $1`, [tenantId]);

    if (arAccount.rows.length > 0 && data.bank_account_id) {
      const bankAccount = await client.query(`SELECT account_id FROM acc_bank_accounts WHERE id = $1 AND tenant_id = $2`, [data.bank_account_id, tenantId]);

      if (bankAccount.rows.length > 0) {
        const entryResult = await client.query(`
          INSERT INTO acc_journal_entries (
            tenant_id, entry_date, entry_number, entry_type, description, reference_type, reference_id, status
          ) VALUES ($1, $2, $3, 'RCT', $4, 'receipt', $5, 'posted')
          RETURNING id
        `, [
          tenantId, data.receipt_date, `JE-RCT-${receiptResult.rows[0].id.slice(0, 8)}`,
          `Receipt from ${invoiceData.customer_name} for invoice ${invoiceData.invoice_number}`,
          receiptResult.rows[0].id
        ]);

        const journalId = entryResult.rows[0].id;

        // Debit Bank
        await client.query(`
          INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES ($1, $2, 1, $3, $4, $5, 0)
        `, [tenantId, journalId, bankAccount.rows[0].account_id, `Receipt for invoice ${invoiceData.invoice_number}`, data.amount - data.tds_deducted]);

        // Credit AR (reduce receivable)
        await client.query(`
          INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES ($1, $2, 2, $3, $4, 0, $5)
        `, [tenantId, journalId, arAccount.rows[0].id, `Receipt from ${invoiceData.customer_name}`, data.amount]);

        // TDS entry if applicable
        if (data.tds_deducted > 0) {
          const tdsAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '1510' AND tenant_id = $1`, [tenantId]);
          if (tdsAccount.rows.length > 0) {
            await client.query(`
              INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
              VALUES ($1, $2, 3, $3, 'TDS Receivable', $4, 0)
            `, [tenantId, journalId, tdsAccount.rows[0].id, data.tds_deducted]);
          }
        }

        await client.query(`UPDATE acc_customer_receipts SET journal_entry_id = $1 WHERE id = $2`, [journalId, receiptResult.rows[0].id]);
      }
    }

    await client.query('COMMIT');

    await publishEnvelope('accounting.receipt.created', { tenantId, receipt: receiptResult.rows[0] });

    return { data: receiptResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// AGING REPORT
// ============================================

async function getAgingReport(tenantId, as_of_date) {
  if (!as_of_date) as_of_date = new Date().toISOString().split('T')[0];

  const result = await query(`
    SELECT
      c.id as customer_id,
      c.code as customer_code,
      c.name as customer_name,
      COUNT(i.id) as invoice_count,
      SUM(CASE WHEN i.due_date >= $2 THEN i.balance_due ELSE 0 END) as current_amount,
      SUM(CASE WHEN i.due_date < $2 AND i.due_date >= $2::date - 30 THEN i.balance_due ELSE 0 END) as days_1_30,
      SUM(CASE WHEN i.due_date < $2::date - 30 AND i.due_date >= $2::date - 60 THEN i.balance_due ELSE 0 END) as days_31_60,
      SUM(CASE WHEN i.due_date < $2::date - 60 AND i.due_date >= $2::date - 90 THEN i.balance_due ELSE 0 END) as days_61_90,
      SUM(CASE WHEN i.due_date < $2::date - 90 THEN i.balance_due ELSE 0 END) as over_90,
      SUM(i.balance_due) as total_outstanding
    FROM acc_customers c
    LEFT JOIN acc_customer_invoices i ON c.id = i.customer_id AND i.balance_due > 0 AND i.status != 'draft'
    WHERE c.tenant_id = $1
    GROUP BY c.id, c.code, c.name
    HAVING SUM(i.balance_due) > 0
    ORDER BY SUM(i.balance_due) DESC
  `, [tenantId, as_of_date]);

  const totals = result.rows.reduce((acc, row) => ({
    current_amount: acc.current_amount + parseFloat(row.current_amount || 0),
    days_1_30: acc.days_1_30 + parseFloat(row.days_1_30 || 0),
    days_31_60: acc.days_31_60 + parseFloat(row.days_31_60 || 0),
    days_61_90: acc.days_61_90 + parseFloat(row.days_61_90 || 0),
    over_90: acc.over_90 + parseFloat(row.over_90 || 0),
    total_outstanding: acc.total_outstanding + parseFloat(row.total_outstanding || 0)
  }), { current_amount: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total_outstanding: 0 });

  return { as_of_date, customers: result.rows, totals };
}

// ============================================
// CSV EXPORT DATA
// ============================================

async function getInvoicesForCSV(tenantId) {
  const r = await query('SELECT i.invoice_number, c.name as customer_name, i.invoice_date, i.due_date, i.total_amount, i.amount_paid, i.status FROM acc_invoices i LEFT JOIN acc_customers c ON i.customer_id = c.id WHERE i.tenant_id = $1 ORDER BY i.invoice_date DESC', [tenantId]);
  return r.rows;
}

async function getAgingForCSV(tenantId) {
  const r = await query(
    `SELECT c.name as customer_name, i.invoice_number, i.invoice_date, i.due_date, i.total_amount - i.amount_paid as outstanding,
     EXTRACT(DAY FROM NOW() - i.due_date) as days_overdue
     FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id
     WHERE i.tenant_id = $1 AND i.status IN ('posted','partially_paid') AND i.total_amount > i.amount_paid
     ORDER BY days_overdue DESC`, [tenantId]);
  return r.rows;
}

module.exports = {
  listInvoices,
  getInvoiceById,
  createInvoice,
  postInvoice,
  recordReceipt,
  getAgingReport,
  getInvoicesForCSV,
  getAgingForCSV
};
