// Customer Service - Business logic and DB queries for customer management

let db, sdk;
try {
  db = require('../../../../../db/postgres');
  sdk = require('../../../../../platform/sdk/node');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
}

const { query } = db;
const { publishEnvelope } = sdk;

async function listCustomers(tenantId, { is_active, customer_type, search, limit = 100, offset = 0 }) {
  let sql = `
    SELECT c.*,
           (SELECT COALESCE(SUM(i.balance_due), 0) FROM acc_customer_invoices i WHERE i.customer_id = c.id AND i.status != 'paid') as outstanding_balance,
           (SELECT COUNT(*) FROM acc_customer_invoices i WHERE i.customer_id = c.id) as invoice_count
    FROM acc_customers c
    WHERE c.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (is_active !== undefined) {
    sql += ` AND c.is_active = $${paramIndex++}`;
    params.push(is_active === 'true');
  }

  if (customer_type) {
    sql += ` AND c.customer_type = $${paramIndex++}`;
    params.push(customer_type);
  }

  if (search) {
    sql += ` AND (c.code ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex} OR c.gstin ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ` ORDER BY c.name LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);

  const countResult = await query('SELECT COUNT(*) as total FROM acc_customers WHERE tenant_id = $1', [tenantId]);

  return {
    data: result.rows,
    pagination: { limit: parseInt(limit), offset: parseInt(offset), total: parseInt(countResult.rows[0].total) }
  };
}

async function getCustomerById(tenantId, id) {
  const result = await query(`
    SELECT c.*,
           (SELECT COALESCE(SUM(i.balance_due), 0) FROM acc_customer_invoices i WHERE i.customer_id = c.id AND i.status != 'paid') as outstanding_balance,
           (SELECT COUNT(*) FROM acc_customer_invoices i WHERE i.customer_id = c.id) as invoice_count,
           (SELECT MAX(i.invoice_date) FROM acc_customer_invoices i WHERE i.customer_id = c.id) as last_invoice_date
    FROM acc_customers c
    WHERE c.id = $1 AND c.tenant_id = $2
  `, [id, tenantId]);

  return result.rows[0] || null;
}

async function createCustomer(tenantId, data) {
  // Check for duplicate code
  const existing = await query('SELECT id FROM acc_customers WHERE code = $1 AND tenant_id = $2', [data.code, tenantId]);
  if (existing.rows.length > 0) {
    return { error: { code: 'DUPLICATE_CODE', message: 'Customer code already exists' }, status: 400 };
  }

  // Validate GSTIN format if provided
  if (data.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(data.gstin)) {
    return { error: { code: 'INVALID_GSTIN', message: 'Invalid GSTIN format' }, status: 400 };
  }

  const result = await query(`
    INSERT INTO acc_customers (
      tenant_id, code, name, display_name, customer_type, gstin, pan,
      contact_person, email, phone, mobile, address_line1, address_line2,
      city, state, state_code, pincode, country, payment_terms_days, credit_limit,
      default_revenue_account_id, is_active, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    RETURNING *
  `, [
    tenantId, data.code, data.name, data.display_name || data.name, data.customer_type,
    data.gstin, data.pan, data.contact_person, data.email, data.phone, data.mobile,
    data.address_line1, data.address_line2, data.city, data.state, data.state_code,
    data.pincode, data.country, data.payment_terms_days, data.credit_limit,
    data.default_revenue_account_id, data.is_active, data.notes
  ]);

  await publishEnvelope('accounting.customer.created', { tenantId, customer: result.rows[0] });

  return { data: result.rows[0] };
}

async function updateCustomer(tenantId, id, data, schemaShape) {
  const updates = [];
  const values = [id, tenantId];
  let paramIndex = 3;

  const fields = Object.keys(schemaShape);
  for (const field of fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      values.push(data[field]);
    }
  }

  if (updates.length === 0) {
    return { error: { code: 'NO_UPDATES', message: 'No fields to update' }, status: 400 };
  }

  const result = await query(`
    UPDATE acc_customers SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return { error: { code: 'NOT_FOUND', message: 'Customer not found' }, status: 404 };
  }

  await publishEnvelope('accounting.customer.updated', { tenantId, customer: result.rows[0] });

  return { data: result.rows[0] };
}

async function getCustomerStatement(tenantId, id, { start_date, end_date }) {
  let dateFilter = '';
  const params = [id, tenantId];
  let paramIndex = 3;

  if (start_date) {
    dateFilter += ` AND transaction_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    dateFilter += ` AND transaction_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  const customer = await query('SELECT * FROM acc_customers WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (customer.rows.length === 0) {
    return null;
  }

  const transactions = await query(`
    SELECT
      'invoice' as type,
      i.invoice_date as transaction_date,
      i.invoice_number as reference,
      i.description,
      i.total_amount as debit,
      0 as credit,
      i.balance_due
    FROM acc_customer_invoices i
    WHERE i.customer_id = $1 AND i.tenant_id = $2 AND i.status != 'draft' ${dateFilter.replace('transaction_date', 'i.invoice_date')}

    UNION ALL

    SELECT
      'receipt' as type,
      r.receipt_date as transaction_date,
      r.reference_number as reference,
      'Receipt' as description,
      0 as debit,
      r.amount as credit,
      0 as balance_due
    FROM acc_customer_receipts r
    JOIN acc_customer_invoices i ON r.invoice_id = i.id
    WHERE i.customer_id = $1 AND i.tenant_id = $2 ${dateFilter.replace('transaction_date', 'r.receipt_date')}

    ORDER BY transaction_date, type DESC
  `, params);

  let runningBalance = 0;
  const statement = transactions.rows.map(t => {
    runningBalance += parseFloat(t.debit) - parseFloat(t.credit);
    return { ...t, running_balance: runningBalance };
  });

  return {
    customer: customer.rows[0],
    transactions: statement,
    closing_balance: runningBalance
  };
}

async function getCustomersForCSV(tenantId) {
  const r = await query('SELECT code, name, gstin, pan, email, phone, is_active FROM acc_customers WHERE tenant_id = $1 ORDER BY name', [tenantId]);
  return r.rows;
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getCustomerStatement,
  getCustomersForCSV
};
