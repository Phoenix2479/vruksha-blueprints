/**
 * GST Service
 * Business logic for GST returns, filing data, validation, and reports
 */

const { z } = require('zod');

// Multi-layout support (monorepo vs Docker)
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

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const gstReturnSchema = z.object({
  return_type: z.enum(['GSTR1', 'GSTR3B', 'GSTR9', 'GSTR2A', 'GSTR2B']),
  return_period: z.string().regex(/^\d{2}-\d{4}$/), // MM-YYYY format
  filing_date: z.string().optional().nullable(),
  status: z.enum(['draft', 'filed', 'accepted', 'rejected']).default('draft')
});

// =============================================================================
// GST RETURNS
// =============================================================================

async function listReturns(tenantId, { return_type, financial_year, status, limit = 24, offset = 0 }) {
  let sql = 'SELECT * FROM acc_gst_returns WHERE tenant_id = $1';
  const params = [tenantId];
  let paramIndex = 2;

  if (return_type) {
    sql += ` AND return_type = $${paramIndex++}`;
    params.push(return_type);
  }

  if (financial_year) {
    sql += ` AND financial_year = $${paramIndex++}`;
    params.push(financial_year);
  }

  if (status) {
    sql += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY return_period DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function createReturn(tenantId, body) {
  const validation = gstReturnSchema.safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;

  // Parse return period to get financial year
  const [month, year] = data.return_period.split('-').map(Number);
  const financialYear = month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

  // Check if return already exists
  const existing = await query(`
    SELECT id FROM acc_gst_returns
    WHERE tenant_id = $1 AND return_type = $2 AND return_period = $3
  `, [tenantId, data.return_type, data.return_period]);

  if (existing.rows.length > 0) {
    return {
      error: { status: 400, code: 'DUPLICATE_RETURN', message: 'GST return for this period already exists' }
    };
  }

  const result = await query(`
    INSERT INTO acc_gst_returns (
      tenant_id, return_type, return_period, financial_year, filing_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [tenantId, data.return_type, data.return_period, financialYear, data.filing_date, data.status]);

  await publishEnvelope('accounting.gst_return.created', { tenantId, gstReturn: result.rows[0] });

  return { data: result.rows[0] };
}

async function getGstr1Data(tenantId, return_period) {
  if (!return_period || !/^\d{2}-\d{4}$/.test(return_period)) {
    return {
      error: { status: 400, code: 'INVALID_PERIOD', message: 'return_period must be in MM-YYYY format' }
    };
  }

  const [month, year] = return_period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // Get B2B invoices (registered recipients)
  const b2bInvoices = await query(`
    SELECT ci.*, c.gstin as recipient_gstin, c.name as recipient_name, c.state_code
    FROM acc_customer_invoices ci
    JOIN acc_customers c ON ci.customer_id = c.id
    WHERE ci.tenant_id = $1
    AND ci.invoice_date BETWEEN $2 AND $3
    AND c.gstin IS NOT NULL
    AND ci.status IN ('posted', 'paid')
    ORDER BY ci.invoice_date
  `, [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  // Get B2C Large invoices (unregistered, > Rs 2.5 lakhs interstate)
  const b2cLarge = await query(`
    SELECT ci.*, c.state_code
    FROM acc_customer_invoices ci
    LEFT JOIN acc_customers c ON ci.customer_id = c.id
    WHERE ci.tenant_id = $1
    AND ci.invoice_date BETWEEN $2 AND $3
    AND (c.gstin IS NULL OR c.gstin = '')
    AND ci.total_amount > 250000
    AND ci.status IN ('posted', 'paid')
    ORDER BY ci.invoice_date
  `, [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  // Get B2C Small summary (unregistered, <= Rs 2.5 lakhs)
  const b2cSmall = await query(`
    SELECT
      COALESCE(c.state_code, '00') as place_of_supply,
      SUM(ci.taxable_amount) as taxable_value,
      SUM(ci.cgst_amount) as cgst,
      SUM(ci.sgst_amount) as sgst,
      SUM(ci.igst_amount) as igst,
      SUM(ci.cess_amount) as cess,
      COUNT(*) as invoice_count
    FROM acc_customer_invoices ci
    LEFT JOIN acc_customers c ON ci.customer_id = c.id
    WHERE ci.tenant_id = $1
    AND ci.invoice_date BETWEEN $2 AND $3
    AND (c.gstin IS NULL OR c.gstin = '')
    AND ci.total_amount <= 250000
    AND ci.status IN ('posted', 'paid')
    GROUP BY COALESCE(c.state_code, '00')
  `, [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  // Calculate totals
  const totals = {
    total_taxable_value: 0,
    total_cgst: 0,
    total_sgst: 0,
    total_igst: 0,
    total_cess: 0,
    total_invoices: 0
  };

  [...b2bInvoices.rows, ...b2cLarge.rows].forEach(inv => {
    totals.total_taxable_value += parseFloat(inv.taxable_amount || 0);
    totals.total_cgst += parseFloat(inv.cgst_amount || 0);
    totals.total_sgst += parseFloat(inv.sgst_amount || 0);
    totals.total_igst += parseFloat(inv.igst_amount || 0);
    totals.total_cess += parseFloat(inv.cess_amount || 0);
    totals.total_invoices++;
  });

  b2cSmall.rows.forEach(row => {
    totals.total_taxable_value += parseFloat(row.taxable_value || 0);
    totals.total_cgst += parseFloat(row.cgst || 0);
    totals.total_sgst += parseFloat(row.sgst || 0);
    totals.total_igst += parseFloat(row.igst || 0);
    totals.total_cess += parseFloat(row.cess || 0);
    totals.total_invoices += parseInt(row.invoice_count || 0);
  });

  return {
    data: {
      return_period,
      b2b: b2bInvoices.rows,
      b2c_large: b2cLarge.rows,
      b2c_small: b2cSmall.rows,
      totals
    }
  };
}

async function getGstr3bData(tenantId, return_period) {
  if (!return_period || !/^\d{2}-\d{4}$/.test(return_period)) {
    return {
      error: { status: 400, code: 'INVALID_PERIOD', message: 'return_period must be in MM-YYYY format' }
    };
  }

  const [month, year] = return_period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // Outward supplies summary
  const outwardSupplies = await query(`
    SELECT
      SUM(taxable_amount) as taxable_value,
      SUM(cgst_amount) as cgst,
      SUM(sgst_amount) as sgst,
      SUM(igst_amount) as igst,
      SUM(cess_amount) as cess
    FROM acc_customer_invoices
    WHERE tenant_id = $1
    AND invoice_date BETWEEN $2 AND $3
    AND status IN ('posted', 'paid')
  `, [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  // Inward supplies (eligible for ITC)
  const inwardSupplies = await query(`
    SELECT
      SUM(taxable_amount) as taxable_value,
      SUM(cgst_amount) as cgst,
      SUM(sgst_amount) as sgst,
      SUM(igst_amount) as igst,
      SUM(cess_amount) as cess
    FROM acc_bills
    WHERE tenant_id = $1
    AND bill_date BETWEEN $2 AND $3
    AND status IN ('posted', 'paid')
    AND itc_eligible = true
  `, [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  // ITC available (from bills)
  const itcAvailable = {
    cgst: parseFloat(inwardSupplies.rows[0]?.cgst || 0),
    sgst: parseFloat(inwardSupplies.rows[0]?.sgst || 0),
    igst: parseFloat(inwardSupplies.rows[0]?.igst || 0),
    cess: parseFloat(inwardSupplies.rows[0]?.cess || 0)
  };

  // Tax liability
  const taxLiability = {
    cgst: parseFloat(outwardSupplies.rows[0]?.cgst || 0),
    sgst: parseFloat(outwardSupplies.rows[0]?.sgst || 0),
    igst: parseFloat(outwardSupplies.rows[0]?.igst || 0),
    cess: parseFloat(outwardSupplies.rows[0]?.cess || 0)
  };

  // Net payable after ITC
  const netPayable = {
    cgst: Math.max(0, taxLiability.cgst - itcAvailable.cgst),
    sgst: Math.max(0, taxLiability.sgst - itcAvailable.sgst),
    igst: Math.max(0, taxLiability.igst - itcAvailable.igst),
    cess: Math.max(0, taxLiability.cess - itcAvailable.cess)
  };

  netPayable.total = netPayable.cgst + netPayable.sgst + netPayable.igst + netPayable.cess;

  return {
    data: {
      return_period,
      outward_supplies: {
        taxable_value: parseFloat(outwardSupplies.rows[0]?.taxable_value || 0),
        ...taxLiability
      },
      inward_supplies: {
        taxable_value: parseFloat(inwardSupplies.rows[0]?.taxable_value || 0),
        ...itcAvailable
      },
      itc_available: itcAvailable,
      tax_liability: taxLiability,
      net_payable: netPayable
    }
  };
}

async function updateReturnStatus(tenantId, id, body) {
  const { status, filing_date, arn_number, acknowledgement_number } = body;

  if (!['draft', 'filed', 'accepted', 'rejected'].includes(status)) {
    return {
      error: { status: 400, code: 'INVALID_STATUS', message: 'Invalid status value' }
    };
  }

  const result = await query(`
    UPDATE acc_gst_returns
    SET status = $3, filing_date = COALESCE($4, filing_date),
        arn_number = COALESCE($5, arn_number),
        acknowledgement_number = COALESCE($6, acknowledgement_number),
        updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [id, tenantId, status, filing_date, arn_number, acknowledgement_number]);

  if (result.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'GST return not found' } };
  }

  await publishEnvelope('accounting.gst_return.updated', { tenantId, gstReturn: result.rows[0] });

  return { data: result.rows[0] };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function getEntityType(code) {
  const types = {
    '1': 'Proprietorship',
    '2': 'Partnership',
    '3': 'Trust',
    '4': 'HUF',
    '5': 'Company',
    '6': 'Government',
    '7': 'Limited Liability Partnership',
    '8': 'Foreign Company',
    '9': 'Artificial Juridical Person'
  };
  return types[code] || 'Other';
}

async function validateHsn(tenantId, code) {
  // Basic HSN validation (should be 4, 6, or 8 digits)
  if (!/^\d{4}(\d{2})?(\d{2})?$/.test(code)) {
    return { valid: false, message: 'HSN code must be 4, 6, or 8 digits' };
  }

  // Check if we have this HSN in our tax codes
  const taxCode = await query(
    'SELECT code, name, rate FROM acc_tax_codes WHERE hsn_code = $1 AND tenant_id = $2',
    [code, tenantId]
  );

  return {
    valid: true,
    hsn_code: code,
    digits: code.length,
    associated_tax_code: taxCode.rows.length > 0 ? taxCode.rows[0] : null
  };
}

async function validateSac(tenantId, code) {
  // Basic SAC validation (should be 6 digits, starting with 99)
  if (!/^99\d{4}$/.test(code)) {
    return { valid: false, message: 'SAC code must be 6 digits starting with 99' };
  }

  // Check if we have this SAC in our tax codes
  const taxCode = await query(
    'SELECT code, name, rate FROM acc_tax_codes WHERE sac_code = $1 AND tenant_id = $2',
    [code, tenantId]
  );

  return {
    valid: true,
    sac_code: code,
    associated_tax_code: taxCode.rows.length > 0 ? taxCode.rows[0] : null
  };
}

function validateGstin(gstin) {
  // GSTIN format: 2 digit state code + 10 char PAN + 1 entity code + 1 digit + 1 check digit
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  if (!gstinRegex.test(gstin)) {
    return { valid: false, message: 'Invalid GSTIN format' };
  }

  // Extract components
  const stateCode = gstin.substring(0, 2);
  const pan = gstin.substring(2, 12);
  const entityCode = gstin.substring(12, 13);

  return {
    valid: true,
    gstin,
    state_code: stateCode,
    pan,
    entity_code: entityCode,
    entity_type: getEntityType(entityCode)
  };
}

// =============================================================================
// TAX REPORTS
// =============================================================================

async function getGstByRate(tenantId, { start_date, end_date }) {
  let dateFilter = '';
  const params = [tenantId];
  let paramIndex = 2;

  if (start_date) {
    dateFilter += ` AND invoice_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    dateFilter += ` AND invoice_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  const result = await query(`
    SELECT
      gst_rate,
      COUNT(*) as invoice_count,
      SUM(taxable_amount) as taxable_value,
      SUM(cgst_amount) as total_cgst,
      SUM(sgst_amount) as total_sgst,
      SUM(igst_amount) as total_igst,
      SUM(cess_amount) as total_cess
    FROM acc_customer_invoices
    WHERE tenant_id = $1 ${dateFilter}
    AND status IN ('posted', 'paid')
    GROUP BY gst_rate
    ORDER BY gst_rate
  `, params);

  return result.rows;
}

async function getTaxLiability(tenantId, { start_date, end_date }) {
  let dateFilter = '';
  const params = [tenantId];
  let paramIndex = 2;

  if (start_date) {
    dateFilter = ` AND invoice_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    dateFilter += ` AND invoice_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  // Output GST
  const outputGst = await query(`
    SELECT
      COALESCE(SUM(cgst_amount), 0) as cgst,
      COALESCE(SUM(sgst_amount), 0) as sgst,
      COALESCE(SUM(igst_amount), 0) as igst,
      COALESCE(SUM(cess_amount), 0) as cess
    FROM acc_customer_invoices
    WHERE tenant_id = $1 AND status IN ('posted', 'paid') ${dateFilter}
  `, params);

  // Input GST (ITC)
  const billDateFilter = dateFilter.replace('invoice_date', 'bill_date');
  const inputGst = await query(`
    SELECT
      COALESCE(SUM(cgst_amount), 0) as cgst,
      COALESCE(SUM(sgst_amount), 0) as sgst,
      COALESCE(SUM(igst_amount), 0) as igst,
      COALESCE(SUM(cess_amount), 0) as cess
    FROM acc_bills
    WHERE tenant_id = $1 AND status IN ('posted', 'paid') AND itc_eligible = true ${billDateFilter}
  `, params);

  // TDS liability
  const tdsDateFilter = dateFilter.replace('invoice_date', 'transaction_date');
  const tdsLiability = await query(`
    SELECT
      COALESCE(SUM(tds_amount), 0) as total_tds,
      COALESCE(SUM(CASE WHEN is_deposited THEN tds_amount ELSE 0 END), 0) as deposited_tds,
      COALESCE(SUM(CASE WHEN NOT is_deposited THEN tds_amount ELSE 0 END), 0) as pending_tds
    FROM acc_tds_transactions
    WHERE tenant_id = $1 ${tdsDateFilter}
  `, params);

  const output = outputGst.rows[0];
  const input = inputGst.rows[0];

  return {
    gst: {
      output: {
        cgst: parseFloat(output.cgst),
        sgst: parseFloat(output.sgst),
        igst: parseFloat(output.igst),
        cess: parseFloat(output.cess),
        total: parseFloat(output.cgst) + parseFloat(output.sgst) + parseFloat(output.igst) + parseFloat(output.cess)
      },
      input: {
        cgst: parseFloat(input.cgst),
        sgst: parseFloat(input.sgst),
        igst: parseFloat(input.igst),
        cess: parseFloat(input.cess),
        total: parseFloat(input.cgst) + parseFloat(input.sgst) + parseFloat(input.igst) + parseFloat(input.cess)
      },
      net_payable: {
        cgst: Math.max(0, parseFloat(output.cgst) - parseFloat(input.cgst)),
        sgst: Math.max(0, parseFloat(output.sgst) - parseFloat(input.sgst)),
        igst: Math.max(0, parseFloat(output.igst) - parseFloat(input.igst)),
        cess: Math.max(0, parseFloat(output.cess) - parseFloat(input.cess))
      }
    },
    tds: tdsLiability.rows[0]
  };
}

module.exports = {
  gstReturnSchema,
  listReturns,
  createReturn,
  getGstr1Data,
  getGstr3bData,
  updateReturnStatus,
  validateHsn,
  validateSac,
  validateGstin,
  getGstByRate,
  getTaxLiability
};
