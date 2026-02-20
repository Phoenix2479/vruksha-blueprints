// Bill Service - Business logic and DB queries for bills, payments, and aging

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
// BILL CRUD
// ============================================

async function listBills(tenantId, { vendor_id, status, start_date, end_date, overdue, limit = 100, offset = 0 }) {
  let sql = `
    SELECT b.*, v.name as vendor_name, v.code as vendor_code
    FROM acc_bills b
    JOIN acc_vendors v ON b.vendor_id = v.id
    WHERE b.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (vendor_id) {
    sql += ` AND b.vendor_id = $${paramIndex++}`;
    params.push(vendor_id);
  }

  if (status) {
    sql += ` AND b.status = $${paramIndex++}`;
    params.push(status);
  }

  if (start_date) {
    sql += ` AND b.bill_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    sql += ` AND b.bill_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  if (overdue === 'true') {
    sql += ` AND b.due_date < CURRENT_DATE AND b.balance_due > 0`;
  }

  sql += ` ORDER BY b.bill_date DESC, b.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);

  return result.rows;
}

async function getBillById(tenantId, id) {
  const bill = await query(`
    SELECT b.*, v.name as vendor_name, v.code as vendor_code, v.gstin as vendor_gstin
    FROM acc_bills b
    JOIN acc_vendors v ON b.vendor_id = v.id
    WHERE b.id = $1 AND b.tenant_id = $2
  `, [id, tenantId]);

  if (bill.rows.length === 0) return null;

  // Get bill lines
  const lines = await query(`
    SELECT bl.*, a.account_code, a.account_name, tc.code as tax_code, tc.rate as tax_rate
    FROM acc_bill_lines bl
    JOIN acc_accounts a ON bl.account_id = a.id
    LEFT JOIN acc_tax_codes tc ON bl.tax_code_id = tc.id
    WHERE bl.bill_id = $1 AND bl.tenant_id = $2
    ORDER BY bl.line_number
  `, [id, tenantId]);

  // Get payments
  const payments = await query(`
    SELECT * FROM acc_bill_payments
    WHERE bill_id = $1 AND tenant_id = $2
    ORDER BY payment_date DESC
  `, [id, tenantId]);

  return {
    ...bill.rows[0],
    lines: lines.rows,
    payments: payments.rows
  };
}

async function createBill(tenantId, billData, lines, billLineSchema) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: { code: 'NO_LINES', message: 'Bill must have at least one line' }, status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const data = billData;

    // Calculate totals from lines
    let subtotal = 0, totalTax = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;

    for (const line of lines) {
      const lineValidation = billLineSchema.safeParse(line);
      if (!lineValidation.success) continue;

      const l = lineValidation.data;
      const lineAmount = l.quantity * l.unit_price * (1 - l.discount_percent / 100);
      subtotal += lineAmount;

      // Get tax rate if tax_code_id provided
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

    // Create bill
    const billResult = await client.query(`
      INSERT INTO acc_bills (
        tenant_id, vendor_id, bill_number, bill_date, due_date, reference_number,
        po_number, currency, exchange_rate, expense_account_id, description, notes,
        is_interstate, itc_eligible, subtotal, taxable_amount, cgst_amount, sgst_amount,
        igst_amount, cess_amount, total_tax, total_amount, balance_due, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 'draft')
      RETURNING *
    `, [
      tenantId, data.vendor_id, data.bill_number, data.bill_date, data.due_date,
      data.reference_number, data.po_number, data.currency, data.exchange_rate,
      data.expense_account_id, data.description, data.notes, data.is_interstate,
      data.itc_eligible, subtotal, subtotal, totalCgst, totalSgst, totalIgst, totalCess,
      totalTax, totalAmount, totalAmount
    ]);

    const billId = billResult.rows[0].id;

    // Create bill lines
    let lineNumber = 1;
    for (const line of lines) {
      const lineValidation = billLineSchema.safeParse(line);
      if (!lineValidation.success) continue;

      const l = lineValidation.data;
      const lineAmount = l.quantity * l.unit_price;
      const discountAmount = lineAmount * (l.discount_percent / 100);
      const netAmount = lineAmount - discountAmount;

      // Calculate tax for this line
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
        INSERT INTO acc_bill_lines (
          tenant_id, bill_id, line_number, description, account_id, quantity,
          unit_price, discount_percent, discount_amount, net_amount, tax_code_id,
          hsn_sac_code, cgst_amount, sgst_amount, igst_amount, cess_amount,
          total_amount, cost_center_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        tenantId, billId, lineNumber++, l.description, l.account_id, l.quantity,
        l.unit_price, l.discount_percent, discountAmount, netAmount, l.tax_code_id,
        l.hsn_sac_code, lineCgst, lineSgst, lineIgst, lineCess, lineTotal, l.cost_center_id
      ]);
    }

    await client.query('COMMIT');

    await publishEnvelope('accounting.bill.created', { tenantId, bill: billResult.rows[0] });

    return { data: billResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function postBill(tenantId, id) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get bill with lines
    const bill = await client.query(`
      SELECT b.*, v.name as vendor_name, v.default_expense_account_id as vendor_expense_account
      FROM acc_bills b
      JOIN acc_vendors v ON b.vendor_id = v.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [id, tenantId]);

    if (bill.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { code: 'NOT_FOUND', message: 'Bill not found' }, status: 404 };
    }

    if (bill.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return { error: { code: 'ALREADY_POSTED', message: 'Bill is already posted' }, status: 400 };
    }

    const billData = bill.rows[0];

    // Get AP account (Accounts Payable liability account)
    const apAccount = await client.query(`
      SELECT id FROM acc_accounts WHERE account_code = '2100' AND tenant_id = $1
    `, [tenantId]);

    if (apAccount.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { code: 'NO_AP_ACCOUNT', message: 'Accounts Payable account not configured' }, status: 400 };
    }

    // Create journal entry
    const entryResult = await client.query(`
      INSERT INTO acc_journal_entries (
        tenant_id, entry_date, entry_number, entry_type, description, reference_type,
        reference_id, source_document, status
      ) VALUES ($1, $2, $3, 'AP', $4, 'bill', $5, $6, 'draft')
      RETURNING *
    `, [
      tenantId, billData.bill_date, `JE-BILL-${billData.bill_number}`,
      `Bill from ${billData.vendor_name}: ${billData.bill_number}`,
      id, billData.bill_number
    ]);

    const journalId = entryResult.rows[0].id;

    // Get bill lines for debit entries
    const lines = await client.query(`
      SELECT * FROM acc_bill_lines WHERE bill_id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    // Create journal lines
    let lineNum = 1;

    // Debit expense accounts
    for (const line of lines.rows) {
      await client.query(`
        INSERT INTO acc_journal_lines (
          tenant_id, journal_entry_id, line_number, account_id, description,
          debit_amount, credit_amount, cost_center_id
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
      `, [tenantId, journalId, lineNum++, line.account_id, line.description, line.net_amount, line.cost_center_id]);

      // Tax entries if applicable
      if (parseFloat(line.cgst_amount) > 0) {
        const cgstAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '1500' AND tenant_id = $1`, [tenantId]);
        if (cgstAccount.rows.length > 0) {
          await client.query(`
            INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
            VALUES ($1, $2, $3, $4, 'Input CGST', $5, 0)
          `, [tenantId, journalId, lineNum++, cgstAccount.rows[0].id, line.cgst_amount]);
        }
      }

      if (parseFloat(line.sgst_amount) > 0) {
        const sgstAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '1501' AND tenant_id = $1`, [tenantId]);
        if (sgstAccount.rows.length > 0) {
          await client.query(`
            INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
            VALUES ($1, $2, $3, $4, 'Input SGST', $5, 0)
          `, [tenantId, journalId, lineNum++, sgstAccount.rows[0].id, line.sgst_amount]);
        }
      }

      if (parseFloat(line.igst_amount) > 0) {
        const igstAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '1502' AND tenant_id = $1`, [tenantId]);
        if (igstAccount.rows.length > 0) {
          await client.query(`
            INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
            VALUES ($1, $2, $3, $4, 'Input IGST', $5, 0)
          `, [tenantId, journalId, lineNum++, igstAccount.rows[0].id, line.igst_amount]);
        }
      }
    }

    // Credit AP account for total
    await client.query(`
      INSERT INTO acc_journal_lines (
        tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount
      ) VALUES ($1, $2, $3, $4, $5, 0, $6)
    `, [tenantId, journalId, lineNum, apAccount.rows[0].id, `Payable to ${billData.vendor_name}`, billData.total_amount]);

    // Update bill status
    await client.query(`
      UPDATE acc_bills SET status = 'posted', journal_entry_id = $3, posted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId, journalId]);

    // Post the journal entry
    await client.query(`
      UPDATE acc_journal_entries SET status = 'posted', posted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [journalId, tenantId]);

    await client.query('COMMIT');

    await publishEnvelope('accounting.bill.posted', { tenantId, billId: id, journalEntryId: journalId });

    return { data: { bill_id: id, journal_entry_id: journalId, status: 'posted' } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// PAYMENTS
// ============================================

async function recordPayment(tenantId, data) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get bill
    const bill = await client.query(`
      SELECT b.*, v.name as vendor_name
      FROM acc_bills b
      JOIN acc_vendors v ON b.vendor_id = v.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [data.bill_id, tenantId]);

    if (bill.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { code: 'NOT_FOUND', message: 'Bill not found' }, status: 404 };
    }

    const billData = bill.rows[0];

    if (billData.status === 'draft') {
      await client.query('ROLLBACK');
      return { error: { code: 'NOT_POSTED', message: 'Bill must be posted before payment' }, status: 400 };
    }

    if (data.amount > parseFloat(billData.balance_due)) {
      await client.query('ROLLBACK');
      return { error: { code: 'OVERPAYMENT', message: 'Payment exceeds balance due' }, status: 400 };
    }

    // Create payment record
    const paymentResult = await client.query(`
      INSERT INTO acc_bill_payments (
        tenant_id, bill_id, payment_date, amount, payment_method, bank_account_id,
        reference_number, cheque_number, cheque_date, notes, tds_amount, tds_section
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      tenantId, data.bill_id, data.payment_date, data.amount, data.payment_method,
      data.bank_account_id, data.reference_number, data.cheque_number, data.cheque_date,
      data.notes, data.tds_amount, data.tds_section
    ]);

    // Update bill balance
    const newBalance = parseFloat(billData.balance_due) - data.amount;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    await client.query(`
      UPDATE acc_bills
      SET balance_due = $3, amount_paid = amount_paid + $4, status = $5, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [data.bill_id, tenantId, newBalance, data.amount, newStatus]);

    // Create journal entry for payment
    const apAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '2100' AND tenant_id = $1`, [tenantId]);

    if (apAccount.rows.length > 0 && data.bank_account_id) {
      const bankAccount = await client.query(`SELECT account_id FROM acc_bank_accounts WHERE id = $1 AND tenant_id = $2`, [data.bank_account_id, tenantId]);

      if (bankAccount.rows.length > 0) {
        const entryResult = await client.query(`
          INSERT INTO acc_journal_entries (
            tenant_id, entry_date, entry_number, entry_type, description, reference_type, reference_id, status
          ) VALUES ($1, $2, $3, 'PMT', $4, 'payment', $5, 'posted')
          RETURNING id
        `, [
          tenantId, data.payment_date, `JE-PMT-${paymentResult.rows[0].id.slice(0, 8)}`,
          `Payment to ${billData.vendor_name} for bill ${billData.bill_number}`,
          paymentResult.rows[0].id
        ]);

        const journalId = entryResult.rows[0].id;

        // Debit AP (reduce liability)
        await client.query(`
          INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES ($1, $2, 1, $3, $4, $5, 0)
        `, [tenantId, journalId, apAccount.rows[0].id, `Payment to ${billData.vendor_name}`, data.amount]);

        // Credit Bank
        await client.query(`
          INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES ($1, $2, 2, $3, $4, 0, $5)
        `, [tenantId, journalId, bankAccount.rows[0].account_id, `Payment for bill ${billData.bill_number}`, data.amount - data.tds_amount]);

        // TDS entry if applicable
        if (data.tds_amount > 0) {
          const tdsAccount = await client.query(`SELECT id FROM acc_accounts WHERE account_code = '2310' AND tenant_id = $1`, [tenantId]);
          if (tdsAccount.rows.length > 0) {
            await client.query(`
              INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
              VALUES ($1, $2, 3, $3, 'TDS Payable', 0, $4)
            `, [tenantId, journalId, tdsAccount.rows[0].id, data.tds_amount]);
          }
        }

        await client.query(`UPDATE acc_bill_payments SET journal_entry_id = $1 WHERE id = $2`, [journalId, paymentResult.rows[0].id]);
      }
    }

    await client.query('COMMIT');

    await publishEnvelope('accounting.payment.created', { tenantId, payment: paymentResult.rows[0] });

    return { data: paymentResult.rows[0] };
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
      v.id as vendor_id,
      v.code as vendor_code,
      v.name as vendor_name,
      COUNT(b.id) as bill_count,
      SUM(CASE WHEN b.due_date >= $2 THEN b.balance_due ELSE 0 END) as current_amount,
      SUM(CASE WHEN b.due_date < $2 AND b.due_date >= $2::date - 30 THEN b.balance_due ELSE 0 END) as days_1_30,
      SUM(CASE WHEN b.due_date < $2::date - 30 AND b.due_date >= $2::date - 60 THEN b.balance_due ELSE 0 END) as days_31_60,
      SUM(CASE WHEN b.due_date < $2::date - 60 AND b.due_date >= $2::date - 90 THEN b.balance_due ELSE 0 END) as days_61_90,
      SUM(CASE WHEN b.due_date < $2::date - 90 THEN b.balance_due ELSE 0 END) as over_90,
      SUM(b.balance_due) as total_outstanding
    FROM acc_vendors v
    LEFT JOIN acc_bills b ON v.id = b.vendor_id AND b.balance_due > 0 AND b.status != 'draft'
    WHERE v.tenant_id = $1
    GROUP BY v.id, v.code, v.name
    HAVING SUM(b.balance_due) > 0
    ORDER BY SUM(b.balance_due) DESC
  `, [tenantId, as_of_date]);

  // Calculate totals
  const totals = result.rows.reduce((acc, row) => ({
    current_amount: acc.current_amount + parseFloat(row.current_amount || 0),
    days_1_30: acc.days_1_30 + parseFloat(row.days_1_30 || 0),
    days_31_60: acc.days_31_60 + parseFloat(row.days_31_60 || 0),
    days_61_90: acc.days_61_90 + parseFloat(row.days_61_90 || 0),
    over_90: acc.over_90 + parseFloat(row.over_90 || 0),
    total_outstanding: acc.total_outstanding + parseFloat(row.total_outstanding || 0)
  }), { current_amount: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total_outstanding: 0 });

  return { as_of_date, vendors: result.rows, totals };
}

// ============================================
// CSV EXPORT DATA
// ============================================

async function getBillsForCSV(tenantId) {
  const r = await query('SELECT b.bill_number, v.name as vendor_name, b.bill_date, b.due_date, b.total_amount, b.amount_paid, b.status FROM acc_bills b LEFT JOIN acc_vendors v ON b.vendor_id = v.id WHERE b.tenant_id = $1 ORDER BY b.bill_date DESC', [tenantId]);
  return r.rows;
}

async function getAgingForCSV(tenantId) {
  const r = await query(
    `SELECT v.name as vendor_name, b.bill_number, b.bill_date, b.due_date, b.total_amount - b.amount_paid as outstanding,
     EXTRACT(DAY FROM NOW() - b.due_date) as days_overdue
     FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id
     WHERE b.tenant_id = $1 AND b.status IN ('posted','partially_paid') AND b.total_amount > b.amount_paid
     ORDER BY days_overdue DESC`, [tenantId]);
  return r.rows;
}

module.exports = {
  listBills,
  getBillById,
  createBill,
  postBill,
  recordPayment,
  getAgingReport,
  getBillsForCSV,
  getAgingForCSV
};
