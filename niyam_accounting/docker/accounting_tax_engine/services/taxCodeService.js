/**
 * Tax Code Service
 * Business logic for tax code CRUD and GST calculations
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

const taxCodeSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  tax_type: z.enum(['gst', 'tds', 'tcs', 'custom']),
  rate: z.number().min(0).max(100),
  cgst_rate: z.number().min(0).max(50).optional().nullable(),
  sgst_rate: z.number().min(0).max(50).optional().nullable(),
  igst_rate: z.number().min(0).max(100).optional().nullable(),
  cess_rate: z.number().min(0).max(50).optional().nullable(),
  hsn_code: z.string().max(8).optional().nullable(),
  sac_code: z.string().max(6).optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable()
});

const calculateGstSchema = z.object({
  amount: z.number().positive(),
  tax_code_id: z.string().uuid().optional(),
  gst_rate: z.number().min(0).max(28).optional(),
  is_interstate: z.boolean().default(false),
  is_inclusive: z.boolean().default(false),
  cess_rate: z.number().min(0).optional().default(0)
});

const invoiceLineSchema = z.object({
  description: z.string(),
  hsn_sac_code: z.string().max(8).optional().nullable(),
  quantity: z.number().positive().default(1),
  unit_price: z.number().min(0),
  discount_percent: z.number().min(0).max(100).default(0),
  tax_code_id: z.string().uuid().optional().nullable(),
  gst_rate: z.number().min(0).max(28).optional()
});

// =============================================================================
// TAX CODE CRUD
// =============================================================================

async function listTaxCodes(tenantId, { tax_type, is_active, search }) {
  let sql = 'SELECT * FROM acc_tax_codes WHERE tenant_id = $1';
  const params = [tenantId];
  let paramIndex = 2;

  if (tax_type) {
    sql += ` AND tax_type = $${paramIndex++}`;
    params.push(tax_type);
  }

  if (is_active !== undefined) {
    sql += ` AND is_active = $${paramIndex++}`;
    params.push(is_active === 'true');
  }

  if (search) {
    sql += ` AND (code ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ' ORDER BY tax_type, rate, code';

  const result = await query(sql, params);
  return result.rows;
}

async function getTaxCode(tenantId, id) {
  const result = await query(
    'SELECT * FROM acc_tax_codes WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function createTaxCode(tenantId, body) {
  const validation = taxCodeSchema.safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;

  // Check for duplicate code
  const existing = await query(
    'SELECT id FROM acc_tax_codes WHERE code = $1 AND tenant_id = $2',
    [data.code, tenantId]
  );

  if (existing.rows.length > 0) {
    return { error: { status: 400, code: 'DUPLICATE_CODE', message: 'Tax code already exists' } };
  }

  // Auto-calculate CGST/SGST/IGST if GST type
  if (data.tax_type === 'gst' && data.rate > 0) {
    data.cgst_rate = data.cgst_rate ?? data.rate / 2;
    data.sgst_rate = data.sgst_rate ?? data.rate / 2;
    data.igst_rate = data.igst_rate ?? data.rate;
  }

  const result = await query(`
    INSERT INTO acc_tax_codes (
      tenant_id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate,
      cess_rate, hsn_code, sac_code, description, is_active, effective_from, effective_to
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `, [
    tenantId, data.code, data.name, data.tax_type, data.rate, data.cgst_rate,
    data.sgst_rate, data.igst_rate, data.cess_rate, data.hsn_code, data.sac_code,
    data.description, data.is_active, data.effective_from, data.effective_to
  ]);

  await publishEnvelope('accounting.tax_code.created', { tenantId, taxCode: result.rows[0] });

  return { data: result.rows[0] };
}

async function updateTaxCode(tenantId, id, body) {
  const validation = taxCodeSchema.partial().safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;
  const updates = [];
  const values = [id, tenantId];
  let paramIndex = 3;

  const fields = ['code', 'name', 'tax_type', 'rate', 'cgst_rate', 'sgst_rate', 'igst_rate',
                  'cess_rate', 'hsn_code', 'sac_code', 'description', 'is_active',
                  'effective_from', 'effective_to'];

  for (const field of fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      values.push(data[field]);
    }
  }

  if (updates.length === 0) {
    return { error: { status: 400, code: 'NO_UPDATES', message: 'No fields to update' } };
  }

  const result = await query(`
    UPDATE acc_tax_codes
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Tax code not found' } };
  }

  await publishEnvelope('accounting.tax_code.updated', { tenantId, taxCode: result.rows[0] });

  return { data: result.rows[0] };
}

async function exportTaxCodesCsv(tenantId) {
  const result = await query(
    'SELECT code, name, tax_type, rate, is_active FROM acc_tax_codes WHERE tenant_id = $1 ORDER BY code',
    [tenantId]
  );
  return result.rows;
}

// =============================================================================
// GST CALCULATION
// =============================================================================

async function calculateGst(tenantId, body) {
  const validation = calculateGstSchema.safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const { amount, tax_code_id, gst_rate, is_interstate, is_inclusive, cess_rate } = validation.data;

  let rate = gst_rate;
  let cessRate = cess_rate;
  let taxCode = null;

  // Get rate from tax code if provided
  if (tax_code_id) {
    const taxCodeResult = await query(
      'SELECT * FROM acc_tax_codes WHERE id = $1 AND tenant_id = $2',
      [tax_code_id, tenantId]
    );

    if (taxCodeResult.rows.length > 0) {
      taxCode = taxCodeResult.rows[0];
      rate = parseFloat(taxCode.rate);
      cessRate = parseFloat(taxCode.cess_rate || 0);
    }
  }

  if (rate === undefined || rate === null) {
    return {
      error: { status: 400, code: 'MISSING_RATE', message: 'Either tax_code_id or gst_rate must be provided' }
    };
  }

  // Calculate tax amounts
  let baseAmount, taxAmount, totalAmount;
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0, cessAmount = 0;

  const totalRate = rate + cessRate;

  if (is_inclusive) {
    totalAmount = amount;
    baseAmount = amount / (1 + totalRate / 100);
    taxAmount = totalAmount - baseAmount;
  } else {
    baseAmount = amount;
    taxAmount = (amount * totalRate) / 100;
    totalAmount = baseAmount + taxAmount;
  }

  // Split into components
  if (is_interstate) {
    igstAmount = (baseAmount * rate) / 100;
  } else {
    cgstAmount = (baseAmount * rate / 2) / 100;
    sgstAmount = (baseAmount * rate / 2) / 100;
  }

  if (cessRate > 0) {
    cessAmount = (baseAmount * cessRate) / 100;
  }

  return {
    data: {
      base_amount: Math.round(baseAmount * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
      gst_rate: rate,
      cess_rate: cessRate,
      is_interstate,
      components: {
        cgst_amount: Math.round(cgstAmount * 100) / 100,
        cgst_rate: is_interstate ? 0 : rate / 2,
        sgst_amount: Math.round(sgstAmount * 100) / 100,
        sgst_rate: is_interstate ? 0 : rate / 2,
        igst_amount: Math.round(igstAmount * 100) / 100,
        igst_rate: is_interstate ? rate : 0,
        cess_amount: Math.round(cessAmount * 100) / 100
      },
      tax_code: taxCode ? { id: taxCode.id, code: taxCode.code, name: taxCode.name } : null
    }
  };
}

async function calculateInvoiceGst(tenantId, body) {
  const { lines, is_interstate = false, is_inclusive = false } = body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      error: { status: 400, code: 'INVALID_INPUT', message: 'lines must be a non-empty array' }
    };
  }

  const calculatedLines = [];
  let totalBase = 0, totalTax = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;

  for (const line of lines) {
    const validation = invoiceLineSchema.safeParse(line);
    if (!validation.success) continue;

    const { quantity, unit_price, discount_percent, tax_code_id, gst_rate } = validation.data;

    // Calculate line amount after discount
    const grossAmount = quantity * unit_price;
    const discountAmount = (grossAmount * discount_percent) / 100;
    const netAmount = grossAmount - discountAmount;

    // Get GST rate
    let rate = gst_rate || 0;
    let cessRate = 0;

    if (tax_code_id) {
      const taxCodeResult = await query(
        'SELECT rate, cess_rate FROM acc_tax_codes WHERE id = $1 AND tenant_id = $2',
        [tax_code_id, tenantId]
      );
      if (taxCodeResult.rows.length > 0) {
        rate = parseFloat(taxCodeResult.rows[0].rate);
        cessRate = parseFloat(taxCodeResult.rows[0].cess_rate || 0);
      }
    }

    // Calculate tax
    let baseAmount, taxAmount;
    const totalRate = rate + cessRate;

    if (is_inclusive) {
      baseAmount = netAmount / (1 + totalRate / 100);
      taxAmount = netAmount - baseAmount;
    } else {
      baseAmount = netAmount;
      taxAmount = (netAmount * totalRate) / 100;
    }

    // Calculate components
    let cgst = 0, sgst = 0, igst = 0, cess = 0;

    if (is_interstate) {
      igst = (baseAmount * rate) / 100;
    } else {
      cgst = (baseAmount * rate / 2) / 100;
      sgst = (baseAmount * rate / 2) / 100;
    }

    if (cessRate > 0) {
      cess = (baseAmount * cessRate) / 100;
    }

    const calculatedLine = {
      ...validation.data,
      gross_amount: Math.round(grossAmount * 100) / 100,
      discount_amount: Math.round(discountAmount * 100) / 100,
      base_amount: Math.round(baseAmount * 100) / 100,
      gst_rate: rate,
      cess_rate: cessRate,
      cgst_amount: Math.round(cgst * 100) / 100,
      sgst_amount: Math.round(sgst * 100) / 100,
      igst_amount: Math.round(igst * 100) / 100,
      cess_amount: Math.round(cess * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total_amount: Math.round((baseAmount + taxAmount) * 100) / 100
    };

    calculatedLines.push(calculatedLine);

    totalBase += baseAmount;
    totalTax += taxAmount;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalCess += cess;
  }

  return {
    data: {
      lines: calculatedLines,
      summary: {
        total_base_amount: Math.round(totalBase * 100) / 100,
        total_tax_amount: Math.round(totalTax * 100) / 100,
        total_cgst: Math.round(totalCgst * 100) / 100,
        total_sgst: Math.round(totalSgst * 100) / 100,
        total_igst: Math.round(totalIgst * 100) / 100,
        total_cess: Math.round(totalCess * 100) / 100,
        grand_total: Math.round((totalBase + totalTax) * 100) / 100,
        is_interstate
      }
    }
  };
}

module.exports = {
  taxCodeSchema,
  calculateGstSchema,
  invoiceLineSchema,
  listTaxCodes,
  getTaxCode,
  createTaxCode,
  updateTaxCode,
  exportTaxCodesCsv,
  calculateGst,
  calculateInvoiceGst
};
