const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8864;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tax_reporting', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'tax_reporting' }));

// === TAX RATES ===
app.get('/tax-rates', (req, res) => {
  try {
    const { region, active = '1' } = req.query;
    let sql = 'SELECT * FROM tax_rates WHERE active = ?';
    const params = [parseInt(active)];
    if (region) { sql += ' AND region = ?'; params.push(region); }
    sql += ' ORDER BY region, name';
    const rates = query(sql, params);
    res.json({ success: true, tax_rates: rates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/tax-rates', (req, res) => {
  try {
    const { name, rate, region, category } = req.body;
    if (!name || rate === undefined) return res.status(400).json({ success: false, error: 'Name and rate required' });
    const id = uuidv4();
    run('INSERT INTO tax_rates (id, name, rate, region, category) VALUES (?, ?, ?, ?, ?)', [id, name, rate, region, category]);
    res.json({ success: true, tax_rate: { id, name, rate } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/tax-rates/:id', (req, res) => {
  try {
    const { name, rate, region, category, active } = req.body;
    run(`UPDATE tax_rates SET name = COALESCE(?, name), rate = COALESCE(?, rate), region = COALESCE(?, region), 
         category = COALESCE(?, category), active = COALESCE(?, active) WHERE id = ?`,
      [name, rate, region, category, active, req.params.id]);
    res.json({ success: true, message: 'Tax rate updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Calculate tax
app.post('/tax/calculate', (req, res) => {
  try {
    const { amount, region, category } = req.body;
    if (!amount) return res.status(400).json({ success: false, error: 'Amount required' });
    
    let sql = 'SELECT * FROM tax_rates WHERE active = 1';
    const params = [];
    if (region) { sql += ' AND region = ?'; params.push(region); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY rate DESC LIMIT 1';
    
    const taxRate = get(sql, params) || { rate: 0 };
    const taxAmount = amount * (taxRate.rate / 100);
    
    res.json({ success: true, amount, tax_rate: taxRate.rate, tax_amount: taxAmount, total: amount + taxAmount });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === TAX REPORTS ===
app.get('/tax-reports', (req, res) => {
  try {
    const { status, year, limit = 50 } = req.query;
    let sql = 'SELECT * FROM tax_reports WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (year) { sql += ' AND period_start LIKE ?'; params.push(`${year}%`); }
    sql += ' ORDER BY period_start DESC LIMIT ?';
    params.push(parseInt(limit));
    const reports = query(sql, params);
    res.json({ success: true, reports: reports.map(r => ({ ...r, breakdown: JSON.parse(r.breakdown || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/tax-reports/:id', (req, res) => {
  try {
    const report = get('SELECT * FROM tax_reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, report: { ...report, breakdown: JSON.parse(report.breakdown || '{}') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Generate tax report
app.post('/tax-reports/generate', (req, res) => {
  try {
    const { period_start, period_end } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ success: false, error: 'period_start and period_end required' });
    
    // Calculate from sales
    const salesData = get(`SELECT SUM(total) as total_sales, SUM(tax) as total_tax FROM sales WHERE created_at >= ? AND created_at <= ?`, [period_start, period_end]);
    const invoiceData = get(`SELECT SUM(total) as total_sales, SUM(tax) as total_tax FROM invoices WHERE status = 'paid' AND issue_date >= ? AND issue_date <= ?`, [period_start, period_end]);
    
    const totalSales = (salesData?.total_sales || 0) + (invoiceData?.total_sales || 0);
    const totalTax = (salesData?.total_tax || 0) + (invoiceData?.total_tax || 0);
    
    const id = uuidv4();
    const breakdown = { sales: salesData || {}, invoices: invoiceData || {} };
    
    run('INSERT INTO tax_reports (id, period_start, period_end, total_sales, total_tax, breakdown) VALUES (?, ?, ?, ?, ?, ?)',
      [id, period_start, period_end, totalSales, totalTax, JSON.stringify(breakdown)]);
    
    res.json({ success: true, report: { id, period_start, period_end, total_sales: totalSales, total_tax: totalTax, status: 'draft' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// File tax report
app.post('/tax-reports/:id/file', (req, res) => {
  try {
    run('UPDATE tax_reports SET status = ?, filed_date = ? WHERE id = ?', ['filed', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Report marked as filed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Tax summary
app.get('/tax/summary', (req, res) => {
  try {
    const { year } = req.query;
    const yearFilter = year || new Date().getFullYear().toString();
    const summary = get(`SELECT SUM(total_sales) as total_sales, SUM(total_tax) as total_tax FROM tax_reports WHERE period_start LIKE ?`, [`${yearFilter}%`]);
    const pending = get(`SELECT COUNT(*) as count FROM tax_reports WHERE status = 'draft'`);
    res.json({ success: true, summary: { year: yearFilter, ...(summary || {}), pending: pending?.count || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'tax_reporting', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Tax Reporting Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
