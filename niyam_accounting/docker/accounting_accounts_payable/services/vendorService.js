// Vendor Service - Business logic and DB queries for vendor management

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

async function listVendors(tenantId, { is_active, vendor_type, search, limit = 100, offset = 0 }) {
  let sql = `
    SELECT v.*,
           (SELECT COALESCE(SUM(b.balance_due), 0) FROM acc_bills b WHERE b.vendor_id = v.id AND b.status != 'paid') as outstanding_balance,
           (SELECT COUNT(*) FROM acc_bills b WHERE b.vendor_id = v.id) as bill_count
    FROM acc_vendors v
    WHERE v.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (is_active !== undefined) {
    sql += ` AND v.is_active = $${paramIndex++}`;
    params.push(is_active === 'true');
  }

  if (vendor_type) {
    sql += ` AND v.vendor_type = $${paramIndex++}`;
    params.push(vendor_type);
  }

  if (search) {
    sql += ` AND (v.code ILIKE $${paramIndex} OR v.name ILIKE $${paramIndex} OR v.gstin ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ` ORDER BY v.name LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);

  // Get total count
  const countResult = await query('SELECT COUNT(*) as total FROM acc_vendors WHERE tenant_id = $1', [tenantId]);

  return {
    data: result.rows,
    pagination: { limit: parseInt(limit), offset: parseInt(offset), total: parseInt(countResult.rows[0].total) }
  };
}

async function getVendorById(tenantId, id) {
  const result = await query(`
    SELECT v.*,
           (SELECT COALESCE(SUM(b.balance_due), 0) FROM acc_bills b WHERE b.vendor_id = v.id AND b.status != 'paid') as outstanding_balance,
           (SELECT COUNT(*) FROM acc_bills b WHERE b.vendor_id = v.id) as bill_count,
           (SELECT MAX(b.bill_date) FROM acc_bills b WHERE b.vendor_id = v.id) as last_bill_date
    FROM acc_vendors v
    WHERE v.id = $1 AND v.tenant_id = $2
  `, [id, tenantId]);

  return result.rows[0] || null;
}

async function createVendor(tenantId, data) {
  // Check for duplicate code
  const existing = await query('SELECT id FROM acc_vendors WHERE code = $1 AND tenant_id = $2', [data.code, tenantId]);
  if (existing.rows.length > 0) {
    return { error: { code: 'DUPLICATE_CODE', message: 'Vendor code already exists' }, status: 400 };
  }

  // Validate GSTIN format if provided
  if (data.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(data.gstin)) {
    return { error: { code: 'INVALID_GSTIN', message: 'Invalid GSTIN format' }, status: 400 };
  }

  // Validate PAN format if provided
  if (data.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan)) {
    return { error: { code: 'INVALID_PAN', message: 'Invalid PAN format' }, status: 400 };
  }

  const result = await query(`
    INSERT INTO acc_vendors (
      tenant_id, code, name, display_name, vendor_type, gstin, pan, tan,
      contact_person, email, phone, mobile, address_line1, address_line2,
      city, state, state_code, pincode, country, payment_terms_days, credit_limit,
      tds_applicable, tds_section, default_expense_account_id, bank_name,
      bank_account_number, bank_ifsc, is_active, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
    RETURNING *
  `, [
    tenantId, data.code, data.name, data.display_name || data.name, data.vendor_type,
    data.gstin, data.pan, data.tan, data.contact_person, data.email, data.phone, data.mobile,
    data.address_line1, data.address_line2, data.city, data.state, data.state_code, data.pincode,
    data.country, data.payment_terms_days, data.credit_limit, data.tds_applicable, data.tds_section,
    data.default_expense_account_id, data.bank_name, data.bank_account_number, data.bank_ifsc,
    data.is_active, data.notes
  ]);

  await publishEnvelope('accounting.vendor.created', { tenantId, vendor: result.rows[0] });

  return { data: result.rows[0] };
}

async function updateVendor(tenantId, id, data, schemaShape) {
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
    UPDATE acc_vendors SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return { error: { code: 'NOT_FOUND', message: 'Vendor not found' }, status: 404 };
  }

  await publishEnvelope('accounting.vendor.updated', { tenantId, vendor: result.rows[0] });

  return { data: result.rows[0] };
}

async function getVendorStatement(tenantId, id, { start_date, end_date }) {
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

  // Get vendor info
  const vendor = await query('SELECT * FROM acc_vendors WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (vendor.rows.length === 0) {
    return null;
  }

  // Get transactions (bills and payments)
  const transactions = await query(`
    SELECT
      'bill' as type,
      b.bill_date as transaction_date,
      b.bill_number as reference,
      b.description,
      b.total_amount as debit,
      0 as credit,
      b.balance_due
    FROM acc_bills b
    WHERE b.vendor_id = $1 AND b.tenant_id = $2 AND b.status != 'draft' ${dateFilter.replace('transaction_date', 'b.bill_date')}

    UNION ALL

    SELECT
      'payment' as type,
      p.payment_date as transaction_date,
      p.reference_number as reference,
      'Payment' as description,
      0 as debit,
      p.amount as credit,
      0 as balance_due
    FROM acc_bill_payments p
    JOIN acc_bills b ON p.bill_id = b.id
    WHERE b.vendor_id = $1 AND b.tenant_id = $2 ${dateFilter.replace('transaction_date', 'p.payment_date')}

    ORDER BY transaction_date, type
  `, params);

  // Calculate running balance
  let runningBalance = 0;
  const statement = transactions.rows.map(t => {
    runningBalance += parseFloat(t.debit) - parseFloat(t.credit);
    return { ...t, running_balance: runningBalance };
  });

  return {
    vendor: vendor.rows[0],
    transactions: statement,
    closing_balance: runningBalance
  };
}

async function getVendorsForCSV(tenantId) {
  const r = await query('SELECT code, name, gstin, pan, email, phone, is_active FROM acc_vendors WHERE tenant_id = $1 ORDER BY name', [tenantId]);
  return r.rows;
}

module.exports = {
  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  getVendorStatement,
  getVendorsForCSV
};
