/**
 * Tax Engine - Lite Version (SQLite)
 * Port: 8855
 *
 * Handles Indian tax compliance:
 * - GST (CGST, SGST, IGST, Cess) calculations
 * - TDS (Tax Deducted at Source) management
 * - GST return data preparation (GSTR-1, GSTR-3B)
 * - Tax code management
 * - HSN/SAC code validation
 * - GSTIN validation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, addHeader, addTable, fmtCurrency, fmtDate } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8855;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

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
// HEALTH
// =============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_tax_engine', mode: 'lite' });
});

// =============================================================================
// TAX CODE MANAGEMENT
// =============================================================================

app.get('/api/tax-codes', (req, res) => {
  try {
    const { tax_type, is_active, search } = req.query;
    let sql = 'SELECT * FROM acc_tax_codes WHERE 1=1';
    const params = [];
    if (tax_type) { sql += ' AND tax_type = ?'; params.push(tax_type); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    if (search) { sql += ' AND (code LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY tax_type, rate, code';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tax-codes/:id', (req, res) => {
  try {
    const taxCode = get('SELECT * FROM acc_tax_codes WHERE id = ?', [req.params.id]);
    if (!taxCode) return res.status(404).json({ success: false, error: 'Tax code not found' });
    res.json({ success: true, data: taxCode });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tax-codes', (req, res) => {
  try {
    const { code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, cess_rate, hsn_code, sac_code, description, effective_from, effective_to } = req.body;
    if (!code || !name || !tax_type) {
      return res.status(400).json({ success: false, error: 'code, name, tax_type required' });
    }
    const existing = get('SELECT id FROM acc_tax_codes WHERE code = ?', [code]);
    if (existing) return res.status(400).json({ success: false, error: 'Tax code already exists' });

    const r = rate || 0;
    const id = uuidv4();
    run(
      `INSERT INTO acc_tax_codes (id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, cess_rate, hsn_code, sac_code, description, effective_from, effective_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, tax_type, r,
        cgst_rate ?? (tax_type === 'gst' ? r / 2 : 0),
        sgst_rate ?? (tax_type === 'gst' ? r / 2 : 0),
        igst_rate ?? (tax_type === 'gst' ? r : 0),
        cess_rate || 0, hsn_code || null, sac_code || null, description || null, effective_from || null, effective_to || null]
    );
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_tax_codes WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/tax-codes/:id', (req, res) => {
  try {
    const taxCode = get('SELECT * FROM acc_tax_codes WHERE id = ?', [req.params.id]);
    if (!taxCode) return res.status(404).json({ success: false, error: 'Tax code not found' });

    const fields = ['name', 'rate', 'cgst_rate', 'sgst_rate', 'igst_rate', 'cess_rate', 'is_active', 'hsn_code', 'sac_code', 'description', 'effective_from', 'effective_to'];
    const updates = [];
    const params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(f === 'is_active' ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    run(`UPDATE acc_tax_codes SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, data: get('SELECT * FROM acc_tax_codes WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// GST CALCULATION
// =============================================================================

app.post('/api/calculate-gst', (req, res) => {
  try {
    const { amount, tax_code_id, gst_rate, is_interstate = false, is_inclusive = false, cess_rate: cessRateInput = 0 } = req.body;
    if (amount === undefined) return res.status(400).json({ success: false, error: 'amount required' });

    let rate = gst_rate;
    let cessRate = cessRateInput;
    let taxCode = null;

    if (tax_code_id) {
      taxCode = get('SELECT * FROM acc_tax_codes WHERE id = ?', [tax_code_id]);
      if (taxCode) {
        rate = taxCode.rate;
        cessRate = taxCode.cess_rate || 0;
      }
    }

    if (rate === undefined || rate === null) {
      return res.status(400).json({ success: false, error: 'Either tax_code_id or gst_rate must be provided' });
    }

    const totalRate = rate + cessRate;
    let baseAmount, taxAmount, totalAmount;

    if (is_inclusive) {
      totalAmount = amount;
      baseAmount = amount / (1 + totalRate / 100);
      taxAmount = totalAmount - baseAmount;
    } else {
      baseAmount = amount;
      taxAmount = (amount * totalRate) / 100;
      totalAmount = baseAmount + taxAmount;
    }

    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0, cessAmount = 0;
    if (is_interstate) {
      igstAmount = (baseAmount * rate) / 100;
    } else {
      cgstAmount = (baseAmount * rate / 2) / 100;
      sgstAmount = (baseAmount * rate / 2) / 100;
    }
    if (cessRate > 0) cessAmount = (baseAmount * cessRate) / 100;

    res.json({
      success: true,
      data: {
        base_amount: Math.round(baseAmount * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        total_amount: Math.round(totalAmount * 100) / 100,
        gst_rate: rate, cess_rate: cessRate, is_interstate,
        components: {
          cgst_amount: Math.round(cgstAmount * 100) / 100, cgst_rate: is_interstate ? 0 : rate / 2,
          sgst_amount: Math.round(sgstAmount * 100) / 100, sgst_rate: is_interstate ? 0 : rate / 2,
          igst_amount: Math.round(igstAmount * 100) / 100, igst_rate: is_interstate ? rate : 0,
          cess_amount: Math.round(cessAmount * 100) / 100
        },
        tax_code: taxCode ? { id: taxCode.id, code: taxCode.code, name: taxCode.name } : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/calculate-invoice-gst', (req, res) => {
  try {
    const { lines, is_interstate = false, is_inclusive = false } = req.body;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ success: false, error: 'lines must be a non-empty array' });
    }

    const calculatedLines = [];
    let totalBase = 0, totalTax = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;

    for (const line of lines) {
      const quantity = line.quantity || 1;
      const unitPrice = line.unit_price || 0;
      const discountPercent = line.discount_percent || 0;
      const grossAmount = quantity * unitPrice;
      const discountAmount = (grossAmount * discountPercent) / 100;
      const netAmount = grossAmount - discountAmount;

      let rate = line.gst_rate || 0;
      let cessRate = 0;

      if (line.tax_code_id) {
        const tc = get('SELECT rate, cess_rate FROM acc_tax_codes WHERE id = ?', [line.tax_code_id]);
        if (tc) { rate = tc.rate; cessRate = tc.cess_rate || 0; }
      }

      const totalRate = rate + cessRate;
      let baseAmount, taxAmount;

      if (is_inclusive) {
        baseAmount = netAmount / (1 + totalRate / 100);
        taxAmount = netAmount - baseAmount;
      } else {
        baseAmount = netAmount;
        taxAmount = (netAmount * totalRate) / 100;
      }

      let cgst = 0, sgst = 0, igst = 0, cess = 0;
      if (is_interstate) { igst = (baseAmount * rate) / 100; }
      else { cgst = (baseAmount * rate / 2) / 100; sgst = (baseAmount * rate / 2) / 100; }
      if (cessRate > 0) cess = (baseAmount * cessRate) / 100;

      calculatedLines.push({
        ...line,
        gross_amount: Math.round(grossAmount * 100) / 100,
        discount_amount: Math.round(discountAmount * 100) / 100,
        base_amount: Math.round(baseAmount * 100) / 100,
        gst_rate: rate, cess_rate: cessRate,
        cgst_amount: Math.round(cgst * 100) / 100,
        sgst_amount: Math.round(sgst * 100) / 100,
        igst_amount: Math.round(igst * 100) / 100,
        cess_amount: Math.round(cess * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        total_amount: Math.round((baseAmount + taxAmount) * 100) / 100
      });

      totalBase += baseAmount; totalTax += taxAmount;
      totalCgst += cgst; totalSgst += sgst; totalIgst += igst; totalCess += cess;
    }

    res.json({
      success: true,
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
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy endpoint alias
app.post('/api/calculate-tax', (req, res) => {
  try {
    const { tax_code_id, amount, is_inter_state } = req.body;
    if (!tax_code_id || amount === undefined) {
      return res.status(400).json({ success: false, error: 'tax_code_id and amount required' });
    }
    const taxCode = get('SELECT * FROM acc_tax_codes WHERE id = ?', [tax_code_id]);
    if (!taxCode) return res.status(404).json({ success: false, error: 'Tax code not found' });

    let result;
    if (is_inter_state) {
      const igst = amount * (taxCode.igst_rate / 100);
      const cess = amount * ((taxCode.cess_rate || 0) / 100);
      result = { taxable_amount: amount, igst_amount: igst, cess_amount: cess, total_tax: igst + cess, total_amount: amount + igst + cess };
    } else {
      const cgst = amount * (taxCode.cgst_rate / 100);
      const sgst = amount * (taxCode.sgst_rate / 100);
      const cess = amount * ((taxCode.cess_rate || 0) / 100);
      result = { taxable_amount: amount, cgst_amount: cgst, sgst_amount: sgst, cess_amount: cess, total_tax: cgst + sgst + cess, total_amount: amount + cgst + sgst + cess };
    }
    res.json({ success: true, data: { ...result, tax_code: taxCode } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// TDS MANAGEMENT
// =============================================================================

app.get('/api/tds/sections', (req, res) => {
  res.json({ success: true, data: TDS_SECTIONS });
});

app.get('/api/tds/transactions', (req, res) => {
  try {
    const { section, start_date, end_date, is_deposited, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM acc_tds_transactions WHERE 1=1';
    const params = [];
    if (section) { sql += ' AND section = ?'; params.push(section); }
    if (start_date) { sql += ' AND transaction_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND transaction_date <= ?'; params.push(end_date); }
    if (is_deposited !== undefined) { sql += ' AND is_deposited = ?'; params.push(is_deposited === 'true' ? 1 : 0); }
    sql += ' ORDER BY transaction_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const data = query(sql, params);
    const totals = get(`
      SELECT COUNT(*) as total_transactions, COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(tds_amount), 0) as total_tds,
        SUM(CASE WHEN is_deposited = 1 THEN 1 ELSE 0 END) as deposited_count
      FROM acc_tds_transactions
    `);

    res.json({ success: true, data, summary: totals, pagination: { limit: parseInt(limit), offset: parseInt(offset) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tds/transactions', (req, res) => {
  try {
    const { vendor_id, pan_number, deductee_name, deductee_type, section, transaction_date, amount, tds_rate, tds_amount, challan_number, challan_date, certificate_number, notes } = req.body;
    if (!deductee_name || !section || !transaction_date || !amount) {
      return res.status(400).json({ success: false, error: 'deductee_name, section, transaction_date, amount required' });
    }
    if (pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan_number)) {
      return res.status(400).json({ success: false, error: 'Invalid PAN number format' });
    }

    const id = uuidv4();
    run(`
      INSERT INTO acc_tds_transactions (id, vendor_id, pan_number, deductee_name, deductee_type, section, transaction_date, amount, tds_rate, tds_amount, challan_number, challan_date, certificate_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, vendor_id || null, pan_number || null, deductee_name, deductee_type || 'individual', section, transaction_date, amount, tds_rate || 0, tds_amount || 0, challan_number || null, challan_date || null, certificate_number || null, notes || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_tds_transactions WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/tds/transactions/:id/deposit', (req, res) => {
  try {
    const { challan_number, challan_date, bsr_code } = req.body;
    if (!challan_number || !challan_date) {
      return res.status(400).json({ success: false, error: 'challan_number and challan_date required' });
    }
    const existing = get('SELECT id FROM acc_tds_transactions WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'TDS transaction not found' });

    run(`UPDATE acc_tds_transactions SET challan_number = ?, challan_date = ?, bsr_code = ?, is_deposited = 1, deposited_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [challan_number, challan_date, bsr_code || null, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_tds_transactions WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tds/calculate', (req, res) => {
  try {
    const { amount, section, deductee_type = 'individual', pan_available = true } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Amount must be positive' });

    const sectionInfo = TDS_SECTIONS.find(s => s.section === section);
    if (!sectionInfo) return res.status(400).json({ success: false, error: 'Invalid TDS section' });

    let rate = sectionInfo.rate;
    if (deductee_type === 'company' && sectionInfo.rate_company) rate = sectionInfo.rate_company;
    if (!pan_available) rate = 20;

    const tdsAmount = (amount * rate) / 100;
    res.json({
      success: true,
      data: {
        gross_amount: amount, tds_rate: rate,
        tds_amount: Math.round(tdsAmount * 100) / 100,
        net_amount: Math.round((amount - tdsAmount) * 100) / 100,
        section, section_description: sectionInfo.description, deductee_type, pan_available
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tds/summary', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];
    if (start_date) { dateFilter += ' AND transaction_date >= ?'; params.push(start_date); }
    if (end_date) { dateFilter += ' AND transaction_date <= ?'; params.push(end_date); }

    const data = query(`
      SELECT section, COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount, COALESCE(SUM(tds_amount), 0) as total_tds,
        SUM(CASE WHEN is_deposited = 1 THEN 1 ELSE 0 END) as deposited_count,
        COALESCE(SUM(CASE WHEN is_deposited = 1 THEN tds_amount ELSE 0 END), 0) as deposited_amount,
        COALESCE(SUM(CASE WHEN is_deposited = 0 THEN tds_amount ELSE 0 END), 0) as pending_amount
      FROM acc_tds_transactions WHERE 1=1 ${dateFilter}
      GROUP BY section ORDER BY section
    `, params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// GST RETURNS
// =============================================================================

app.get('/api/gst-returns', (req, res) => {
  try {
    const { return_type, financial_year, status, limit = 24, offset = 0 } = req.query;
    let sql = 'SELECT * FROM acc_gst_returns WHERE 1=1';
    const params = [];
    if (return_type) { sql += ' AND return_type = ?'; params.push(return_type); }
    if (financial_year) { sql += ' AND financial_year = ?'; params.push(financial_year); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY return_period DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gst-returns', (req, res) => {
  try {
    const { return_type, return_period, filing_date, status: returnStatus } = req.body;
    if (!return_type || !return_period || !/^\d{2}-\d{4}$/.test(return_period)) {
      return res.status(400).json({ success: false, error: 'return_type and return_period (MM-YYYY) required' });
    }
    const existing = get('SELECT id FROM acc_gst_returns WHERE return_type = ? AND return_period = ?', [return_type, return_period]);
    if (existing) return res.status(400).json({ success: false, error: 'GST return for this period already exists' });

    const [month, year] = return_period.split('-').map(Number);
    const financialYear = month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    const id = uuidv4();
    run(`INSERT INTO acc_gst_returns (id, return_type, return_period, financial_year, filing_date, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, return_type, return_period, financialYear, filing_date || null, returnStatus || 'draft']);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_gst_returns WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/gst-returns/gstr1-data', (req, res) => {
  try {
    const { return_period } = req.query;
    if (!return_period || !/^\d{2}-\d{4}$/.test(return_period)) {
      return res.status(400).json({ success: false, error: 'return_period must be in MM-YYYY format' });
    }
    const [month, year] = return_period.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${endDay}`;

    const b2b = query(`
      SELECT i.*, c.gstin as recipient_gstin, c.name as recipient_name, c.state_code
      FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id
      WHERE i.invoice_date BETWEEN ? AND ? AND c.gstin IS NOT NULL AND c.gstin != '' AND i.status IN ('posted','paid')
      ORDER BY i.invoice_date
    `, [startDate, endDate]);

    const b2cSmall = query(`
      SELECT COALESCE(c.state_code, '00') as place_of_supply,
        SUM(COALESCE(i.taxable_amount, i.subtotal)) as taxable_value,
        SUM(COALESCE(i.cgst_amount, 0)) as cgst, SUM(COALESCE(i.sgst_amount, 0)) as sgst,
        SUM(COALESCE(i.igst_amount, 0)) as igst, SUM(COALESCE(i.cess_amount, 0)) as cess,
        COUNT(*) as invoice_count
      FROM acc_invoices i LEFT JOIN acc_customers c ON i.customer_id = c.id
      WHERE i.invoice_date BETWEEN ? AND ? AND (c.gstin IS NULL OR c.gstin = '') AND i.total_amount <= 250000 AND i.status IN ('posted','paid')
      GROUP BY COALESCE(c.state_code, '00')
    `, [startDate, endDate]);

    const totals = { total_taxable_value: 0, total_cgst: 0, total_sgst: 0, total_igst: 0, total_cess: 0, total_invoices: b2b.length };
    b2b.forEach(inv => {
      totals.total_taxable_value += (inv.taxable_amount || inv.subtotal || 0);
      totals.total_cgst += (inv.cgst_amount || 0);
      totals.total_sgst += (inv.sgst_amount || 0);
      totals.total_igst += (inv.igst_amount || 0);
      totals.total_cess += (inv.cess_amount || 0);
    });
    b2cSmall.forEach(row => {
      totals.total_taxable_value += (row.taxable_value || 0);
      totals.total_cgst += (row.cgst || 0);
      totals.total_sgst += (row.sgst || 0);
      totals.total_igst += (row.igst || 0);
      totals.total_cess += (row.cess || 0);
      totals.total_invoices += (row.invoice_count || 0);
    });

    res.json({ success: true, data: { return_period, b2b, b2c_small: b2cSmall, totals } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/gst-returns/gstr3b-data', (req, res) => {
  try {
    const { return_period } = req.query;
    if (!return_period || !/^\d{2}-\d{4}$/.test(return_period)) {
      return res.status(400).json({ success: false, error: 'return_period must be in MM-YYYY format' });
    }
    const [month, year] = return_period.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${endDay}`;

    const outward = get(`
      SELECT SUM(COALESCE(taxable_amount, subtotal)) as taxable_value,
        SUM(COALESCE(cgst_amount,0)) as cgst, SUM(COALESCE(sgst_amount,0)) as sgst,
        SUM(COALESCE(igst_amount,0)) as igst, SUM(COALESCE(cess_amount,0)) as cess
      FROM acc_invoices WHERE invoice_date BETWEEN ? AND ? AND status IN ('posted','paid')
    `, [startDate, endDate]) || {};

    const inward = get(`
      SELECT SUM(COALESCE(taxable_amount, subtotal)) as taxable_value,
        SUM(COALESCE(cgst_amount,0)) as cgst, SUM(COALESCE(sgst_amount,0)) as sgst,
        SUM(COALESCE(igst_amount,0)) as igst, SUM(COALESCE(cess_amount,0)) as cess
      FROM acc_bills WHERE bill_date BETWEEN ? AND ? AND status IN ('posted','paid') AND itc_eligible = 1
    `, [startDate, endDate]) || {};

    const taxLiability = { cgst: outward.cgst || 0, sgst: outward.sgst || 0, igst: outward.igst || 0, cess: outward.cess || 0 };
    const itcAvailable = { cgst: inward.cgst || 0, sgst: inward.sgst || 0, igst: inward.igst || 0, cess: inward.cess || 0 };
    const netPayable = {
      cgst: Math.max(0, taxLiability.cgst - itcAvailable.cgst),
      sgst: Math.max(0, taxLiability.sgst - itcAvailable.sgst),
      igst: Math.max(0, taxLiability.igst - itcAvailable.igst),
      cess: Math.max(0, taxLiability.cess - itcAvailable.cess)
    };
    netPayable.total = netPayable.cgst + netPayable.sgst + netPayable.igst + netPayable.cess;

    res.json({
      success: true,
      data: {
        return_period,
        outward_supplies: { taxable_value: outward.taxable_value || 0, ...taxLiability },
        inward_supplies: { taxable_value: inward.taxable_value || 0, ...itcAvailable },
        itc_available: itcAvailable, tax_liability: taxLiability, net_payable: netPayable
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/gst-returns/:id/status', (req, res) => {
  try {
    const { status, filing_date, arn_number, acknowledgement_number } = req.body;
    if (!['draft', 'filed', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }
    const existing = get('SELECT id FROM acc_gst_returns WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'GST return not found' });

    run(`UPDATE acc_gst_returns SET status = ?, filing_date = COALESCE(?, filing_date), arn_number = COALESCE(?, arn_number), acknowledgement_number = COALESCE(?, acknowledgement_number), updated_at = datetime('now') WHERE id = ?`,
      [status, filing_date || null, arn_number || null, acknowledgement_number || null, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_gst_returns WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// HSN/SAC/GSTIN VALIDATION
// =============================================================================

app.get('/api/validate/hsn/:code', (req, res) => {
  const { code } = req.params;
  if (!/^\d{4}(\d{2})?(\d{2})?$/.test(code)) {
    return res.json({ success: true, data: { valid: false, message: 'HSN code must be 4, 6, or 8 digits' } });
  }
  const taxCode = get('SELECT code, name, rate FROM acc_tax_codes WHERE hsn_code = ?', [code]);
  res.json({ success: true, data: { valid: true, hsn_code: code, digits: code.length, associated_tax_code: taxCode || null } });
});

app.get('/api/validate/sac/:code', (req, res) => {
  const { code } = req.params;
  if (!/^99\d{4}$/.test(code)) {
    return res.json({ success: true, data: { valid: false, message: 'SAC code must be 6 digits starting with 99' } });
  }
  const taxCode = get('SELECT code, name, rate FROM acc_tax_codes WHERE sac_code = ?', [code]);
  res.json({ success: true, data: { valid: true, sac_code: code, associated_tax_code: taxCode || null } });
});

app.get('/api/validate/gstin/:gstin', (req, res) => {
  const { gstin } = req.params;
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(gstin)) {
    return res.json({ success: true, data: { valid: false, message: 'Invalid GSTIN format' } });
  }
  const entityTypes = { '1': 'Proprietorship', '2': 'Partnership', '3': 'Trust', '4': 'HUF', '5': 'Company', '6': 'Government', '7': 'LLP', '8': 'Foreign Company', '9': 'AJP' };
  const stateCode = gstin.substring(0, 2);
  const pan = gstin.substring(2, 12);
  const entityCode = gstin.substring(12, 13);
  res.json({ success: true, data: { valid: true, gstin, state_code: stateCode, pan, entity_code: entityCode, entity_type: entityTypes[entityCode] || 'Other' } });
});

// =============================================================================
// TAX REPORTS
// =============================================================================

app.get('/api/reports/gst-by-rate', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];
    if (start_date) { dateFilter += ' AND invoice_date >= ?'; params.push(start_date); }
    if (end_date) { dateFilter += ' AND invoice_date <= ?'; params.push(end_date); }

    const data = query(`
      SELECT gst_rate, COUNT(*) as invoice_count, SUM(COALESCE(taxable_amount, subtotal)) as taxable_value,
        SUM(COALESCE(cgst_amount,0)) as total_cgst, SUM(COALESCE(sgst_amount,0)) as total_sgst,
        SUM(COALESCE(igst_amount,0)) as total_igst, SUM(COALESCE(cess_amount,0)) as total_cess
      FROM acc_invoices WHERE status IN ('posted','paid') ${dateFilter}
      GROUP BY gst_rate ORDER BY gst_rate
    `, params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/tax-liability', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let invoiceDateFilter = '', billDateFilter = '', tdsDateFilter = '';
    const invoiceParams = [], billParams = [], tdsParams = [];

    if (start_date) {
      invoiceDateFilter += ' AND invoice_date >= ?'; invoiceParams.push(start_date);
      billDateFilter += ' AND bill_date >= ?'; billParams.push(start_date);
      tdsDateFilter += ' AND transaction_date >= ?'; tdsParams.push(start_date);
    }
    if (end_date) {
      invoiceDateFilter += ' AND invoice_date <= ?'; invoiceParams.push(end_date);
      billDateFilter += ' AND bill_date <= ?'; billParams.push(end_date);
      tdsDateFilter += ' AND transaction_date <= ?'; tdsParams.push(end_date);
    }

    const output = get(`SELECT COALESCE(SUM(cgst_amount),0) as cgst, COALESCE(SUM(sgst_amount),0) as sgst, COALESCE(SUM(igst_amount),0) as igst, COALESCE(SUM(cess_amount),0) as cess FROM acc_invoices WHERE status IN ('posted','paid') ${invoiceDateFilter}`, invoiceParams) || {};
    const input = get(`SELECT COALESCE(SUM(cgst_amount),0) as cgst, COALESCE(SUM(sgst_amount),0) as sgst, COALESCE(SUM(igst_amount),0) as igst, COALESCE(SUM(cess_amount),0) as cess FROM acc_bills WHERE status IN ('posted','paid') AND itc_eligible = 1 ${billDateFilter}`, billParams) || {};
    const tds = get(`SELECT COALESCE(SUM(tds_amount),0) as total_tds, COALESCE(SUM(CASE WHEN is_deposited=1 THEN tds_amount ELSE 0 END),0) as deposited_tds, COALESCE(SUM(CASE WHEN is_deposited=0 THEN tds_amount ELSE 0 END),0) as pending_tds FROM acc_tds_transactions WHERE 1=1 ${tdsDateFilter}`, tdsParams) || {};

    res.json({
      success: true,
      data: {
        gst: {
          output: { cgst: output.cgst || 0, sgst: output.sgst || 0, igst: output.igst || 0, cess: output.cess || 0, total: (output.cgst||0) + (output.sgst||0) + (output.igst||0) + (output.cess||0) },
          input: { cgst: input.cgst || 0, sgst: input.sgst || 0, igst: input.igst || 0, cess: input.cess || 0, total: (input.cgst||0) + (input.sgst||0) + (input.igst||0) + (input.cess||0) },
          net_payable: {
            cgst: Math.max(0, (output.cgst||0) - (input.cgst||0)),
            sgst: Math.max(0, (output.sgst||0) - (input.sgst||0)),
            igst: Math.max(0, (output.igst||0) - (input.igst||0)),
            cess: Math.max(0, (output.cess||0) - (input.cess||0))
          }
        },
        tds
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tax transactions (legacy)
app.get('/api/tax-transactions', (req, res) => {
  try {
    const { start_date, end_date, tax_direction } = req.query;
    let sql = 'SELECT tt.*, tc.code as tax_code, tc.name as tax_name FROM acc_tax_transactions tt JOIN acc_tax_codes tc ON tt.tax_code_id = tc.id WHERE 1=1';
    const params = [];
    if (start_date) { sql += ' AND tt.transaction_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND tt.transaction_date <= ?'; params.push(end_date); }
    if (tax_direction) { sql += ' AND tt.tax_direction = ?'; params.push(tax_direction); }
    sql += ' ORDER BY tt.transaction_date DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tax-summary', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateSql = '';
    const params = [];
    if (start_date) { dateSql += ' AND tt.transaction_date >= ?'; params.push(start_date); }
    if (end_date) { dateSql += ' AND tt.transaction_date <= ?'; params.push(end_date); }

    const summary = query(`
      SELECT tt.tax_direction, tc.tax_type,
        COALESCE(SUM(tt.taxable_amount), 0) as total_taxable, COALESCE(SUM(tt.cgst_amount), 0) as total_cgst,
        COALESCE(SUM(tt.sgst_amount), 0) as total_sgst, COALESCE(SUM(tt.igst_amount), 0) as total_igst,
        COALESCE(SUM(tt.cess_amount), 0) as total_cess, COALESCE(SUM(tt.tax_amount), 0) as total_tax
      FROM acc_tax_transactions tt JOIN acc_tax_codes tc ON tt.tax_code_id = tc.id WHERE 1=1 ${dateSql}
      GROUP BY tt.tax_direction, tc.tax_type
    `, params);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Init default tax codes
app.post('/api/init-tax-codes', (req, res) => {
  try {
    const existing = query('SELECT COUNT(*) as count FROM acc_tax_codes');
    if (existing[0].count > 0) return res.json({ success: true, message: 'Tax codes already initialized' });

    const defaults = [
      { code: 'GST0', name: 'GST Exempt', type: 'gst', rate: 0, cgst: 0, sgst: 0, igst: 0 },
      { code: 'GST5', name: 'GST 5%', type: 'gst', rate: 5, cgst: 2.5, sgst: 2.5, igst: 5 },
      { code: 'GST12', name: 'GST 12%', type: 'gst', rate: 12, cgst: 6, sgst: 6, igst: 12 },
      { code: 'GST18', name: 'GST 18%', type: 'gst', rate: 18, cgst: 9, sgst: 9, igst: 18 },
      { code: 'GST28', name: 'GST 28%', type: 'gst', rate: 28, cgst: 14, sgst: 14, igst: 28 },
    ];

    for (const t of defaults) {
      run('INSERT INTO acc_tax_codes (id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), t.code, t.name, t.type, t.rate, t.cgst, t.sgst, t.igst]);
    }
    res.json({ success: true, message: 'Default GST tax codes created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/tds/transactions/export/csv', (req, res) => {
  try {
    const data = query('SELECT deductee_name, pan_number, section, transaction_date, amount, tds_rate, tds_amount, challan_number, CASE WHEN is_deposited THEN \'Yes\' ELSE \'No\' END as deposited FROM acc_tds_transactions ORDER BY transaction_date DESC');
    sendCSV(res, data, [
      { key: 'deductee_name', label: 'Deductee' }, { key: 'pan_number', label: 'PAN' },
      { key: 'section', label: 'Section' }, { key: 'transaction_date', label: 'Date' },
      { key: 'amount', label: 'Amount' }, { key: 'tds_rate', label: 'Rate %' },
      { key: 'tds_amount', label: 'TDS Amount' }, { key: 'challan_number', label: 'Challan #' },
      { key: 'deposited', label: 'Deposited' }
    ], 'tds_transactions.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/tax-codes/export/csv', (req, res) => {
  try {
    const data = query('SELECT code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, cess_rate FROM acc_tax_codes WHERE is_active = 1 ORDER BY tax_type, rate');
    sendCSV(res, data, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'tax_type', label: 'Type' },
      { key: 'rate', label: 'Rate %' }, { key: 'cgst_rate', label: 'CGST %' }, { key: 'sgst_rate', label: 'SGST %' },
      { key: 'igst_rate', label: 'IGST %' }, { key: 'cess_rate', label: 'Cess %' }
    ], 'tax_codes.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/tax-liability/export/pdf', (req, res) => {
  try {
    const tds = query('SELECT section, COUNT(*) as count, SUM(amount) as total_amount, SUM(tds_amount) as total_tds, SUM(CASE WHEN is_deposited THEN tds_amount ELSE 0 END) as deposited, SUM(CASE WHEN NOT is_deposited THEN tds_amount ELSE 0 END) as pending FROM acc_tds_transactions GROUP BY section ORDER BY section');
    sendPDF(res, (doc) => {
      addHeader(doc, 'Tax Liability Report', `Generated ${new Date().toLocaleDateString('en-IN')}`);
      doc.fontSize(12).fillColor('#1e293b').text('TDS Summary by Section');
      doc.moveDown(0.5);
      addTable(doc, [
        { key: 'section', label: 'Section', width: 1 }, { key: 'count', label: 'Transactions', width: 1 },
        { key: 'total_amount', label: 'Total Amount', width: 1.5, align: 'right', formatter: fmtCurrency },
        { key: 'total_tds', label: 'Total TDS', width: 1.5, align: 'right', formatter: fmtCurrency },
        { key: 'deposited', label: 'Deposited', width: 1.2, align: 'right', formatter: fmtCurrency },
        { key: 'pending', label: 'Pending', width: 1.2, align: 'right', formatter: fmtCurrency }
      ], tds);
    }, 'tax_liability.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/tax-liability/export/csv', (req, res) => {
  try {
    const tds = query('SELECT section, COUNT(*) as count, SUM(amount) as total_amount, SUM(tds_amount) as total_tds, SUM(CASE WHEN is_deposited THEN tds_amount ELSE 0 END) as deposited, SUM(CASE WHEN NOT is_deposited THEN tds_amount ELSE 0 END) as pending FROM acc_tds_transactions GROUP BY section ORDER BY section');
    sendCSV(res, tds, [
      { key: 'section', label: 'Section' }, { key: 'count', label: 'Transactions' },
      { key: 'total_amount', label: 'Total Amount' }, { key: 'total_tds', label: 'Total TDS' },
      { key: 'deposited', label: 'Deposited' }, { key: 'pending', label: 'Pending' }
    ], 'tax_liability.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Tax Engine (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
