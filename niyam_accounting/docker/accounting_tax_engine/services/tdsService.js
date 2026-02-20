/**
 * TDS Service
 * Business logic for TDS/TCS management and calculations
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
// CONSTANTS
// =============================================================================

const TDS_SECTIONS = [
  { section: '194A', description: 'Interest other than interest on securities', rate: 10 },
  { section: '194C', description: 'Payment to contractors', rate: 1, rate_company: 2 },
  { section: '194H', description: 'Commission or brokerage', rate: 5 },
  { section: '194I', description: 'Rent', rate: 10 },
  { section: '194J', description: 'Professional/Technical fees', rate: 10 },
  { section: '194Q', description: 'Purchase of goods', rate: 0.1 },
  { section: '194R', description: 'Benefits or perquisites', rate: 10 }
];

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const tdsTransactionSchema = z.object({
  vendor_id: z.string().uuid().optional().nullable(),
  pan_number: z.string().length(10).optional().nullable(),
  deductee_name: z.string().min(1).max(255),
  deductee_type: z.enum(['individual', 'company', 'firm', 'huf', 'others']).default('individual'),
  section: z.string().min(1).max(10),
  transaction_date: z.string(),
  amount: z.number().positive(),
  tds_rate: z.number().min(0).max(100),
  tds_amount: z.number().min(0),
  challan_number: z.string().max(50).optional().nullable(),
  challan_date: z.string().optional().nullable(),
  certificate_number: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable()
});

// =============================================================================
// TDS OPERATIONS
// =============================================================================

function getSections() {
  return TDS_SECTIONS;
}

async function listTransactions(tenantId, { section, start_date, end_date, is_deposited, limit = 100, offset = 0 }) {
  let sql = 'SELECT * FROM acc_tds_transactions WHERE tenant_id = $1';
  const params = [tenantId];
  let paramIndex = 2;

  if (section) {
    sql += ` AND section = $${paramIndex++}`;
    params.push(section);
  }

  if (start_date) {
    sql += ` AND transaction_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    sql += ` AND transaction_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  if (is_deposited !== undefined) {
    sql += ` AND is_deposited = $${paramIndex++}`;
    params.push(is_deposited === 'true');
  }

  sql += ` ORDER BY transaction_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);

  // Get totals
  const totals = await query(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(tds_amount), 0) as total_tds,
      COUNT(CASE WHEN is_deposited THEN 1 END) as deposited_count
    FROM acc_tds_transactions WHERE tenant_id = $1
  `, [tenantId]);

  return {
    rows: result.rows,
    summary: totals.rows[0],
    pagination: { limit: parseInt(limit), offset: parseInt(offset) }
  };
}

async function createTransaction(tenantId, body) {
  const validation = tdsTransactionSchema.safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;

  // Validate PAN format if provided
  if (data.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) {
    return {
      error: { status: 400, code: 'INVALID_PAN', message: 'Invalid PAN number format' }
    };
  }

  const result = await query(`
    INSERT INTO acc_tds_transactions (
      tenant_id, vendor_id, pan_number, deductee_name, deductee_type,
      section, transaction_date, amount, tds_rate, tds_amount,
      challan_number, challan_date, certificate_number, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    tenantId, data.vendor_id, data.pan_number, data.deductee_name, data.deductee_type,
    data.section, data.transaction_date, data.amount, data.tds_rate, data.tds_amount,
    data.challan_number, data.challan_date, data.certificate_number, data.notes
  ]);

  await publishEnvelope('accounting.tds_transaction.created', { tenantId, transaction: result.rows[0] });

  return { data: result.rows[0] };
}

async function updateDeposit(tenantId, id, body) {
  const { challan_number, challan_date, bsr_code } = body;

  if (!challan_number || !challan_date) {
    return {
      error: { status: 400, code: 'MISSING_FIELDS', message: 'challan_number and challan_date are required' }
    };
  }

  const result = await query(`
    UPDATE acc_tds_transactions
    SET challan_number = $3, challan_date = $4, bsr_code = $5,
        is_deposited = true, deposited_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [id, tenantId, challan_number, challan_date, bsr_code]);

  if (result.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'TDS transaction not found' } };
  }

  await publishEnvelope('accounting.tds_transaction.deposited', { tenantId, transaction: result.rows[0] });

  return { data: result.rows[0] };
}

function calculateTds({ amount, section, deductee_type = 'individual', pan_available = true }) {
  if (!amount || amount <= 0) {
    return { error: { status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be positive' } };
  }

  const sectionInfo = TDS_SECTIONS.find(s => s.section === section);
  if (!sectionInfo) {
    return { error: { status: 400, code: 'INVALID_SECTION', message: 'Invalid TDS section' } };
  }

  // Determine rate based on deductee type
  let rate = sectionInfo.rate;
  if (deductee_type === 'company' && sectionInfo.rate_company) {
    rate = sectionInfo.rate_company;
  }

  // Higher rate if PAN not available
  if (!pan_available) {
    rate = 20;
  }

  const tdsAmount = (amount * rate) / 100;
  const netAmount = amount - tdsAmount;

  return {
    data: {
      gross_amount: amount,
      tds_rate: rate,
      tds_amount: Math.round(tdsAmount * 100) / 100,
      net_amount: Math.round(netAmount * 100) / 100,
      section,
      section_description: sectionInfo.description,
      deductee_type,
      pan_available
    }
  };
}

async function getSummary(tenantId, { start_date, end_date }) {
  let dateFilter = '';
  const params = [tenantId];
  let paramIndex = 2;

  if (start_date) {
    dateFilter += ` AND transaction_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    dateFilter += ` AND transaction_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  const result = await query(`
    SELECT
      section,
      COUNT(*) as transaction_count,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(tds_amount), 0) as total_tds,
      COUNT(CASE WHEN is_deposited THEN 1 END) as deposited_count,
      COALESCE(SUM(CASE WHEN is_deposited THEN tds_amount ELSE 0 END), 0) as deposited_amount,
      COALESCE(SUM(CASE WHEN NOT is_deposited THEN tds_amount ELSE 0 END), 0) as pending_amount
    FROM acc_tds_transactions
    WHERE tenant_id = $1 ${dateFilter}
    GROUP BY section
    ORDER BY section
  `, params);

  return result.rows;
}

async function exportTransactionsCsv(tenantId) {
  const result = await query(
    'SELECT * FROM acc_tds_transactions WHERE tenant_id = $1 ORDER BY transaction_date DESC',
    [tenantId]
  );
  return result.rows;
}

module.exports = {
  TDS_SECTIONS,
  tdsTransactionSchema,
  getSections,
  listTransactions,
  createTransaction,
  updateDeposit,
  calculateTds,
  getSummary,
  exportTransactionsCsv
};
