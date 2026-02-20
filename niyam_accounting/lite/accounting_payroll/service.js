/**
 * Payroll Processing - Lite Version (SQLite)
 * Port: 8903
 * Indian payroll: PF, ESI, PT, TDS with salary structures
 * Split from accounts_payable for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8903;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_payroll', mode: 'lite' });
});

// =============================================================================
// EMPLOYEES
// =============================================================================

app.get('/api/employees', (req, res) => {
  try {
    const { status, department } = req.query;
    let sql = 'SELECT e.*, s.name as structure_name FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND e.status = ?'; params.push(status); }
    if (department) { sql += ' AND e.department = ?'; params.push(department); }
    sql += ' ORDER BY e.emp_code';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/employees/csv', (req, res) => {
  try {
    const data = query('SELECT e.*, s.name as structure_name FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id ORDER BY e.emp_code', []);
    sendCSV(res, data, 'employees.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/employees', (req, res) => {
  try {
    const { emp_code, name, department, designation, date_of_joining, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary } = req.body;
    if (!emp_code || !name) return res.status(400).json({ success: false, error: 'emp_code and name required' });
    const id = uuidv4();
    run('INSERT INTO acc_employees (id, emp_code, name, department, designation, date_of_joining, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, emp_code, name, department || null, designation || null, date_of_joining || null, pan || null, uan || null, esi_number || null, bank_account || null, bank_ifsc || null, salary_structure_id || null, gross_salary || 0]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_employees WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/employees/:id', (req, res) => {
  try {
    const emp = get('SELECT e.*, s.name as structure_name FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id WHERE e.id = ?', [req.params.id]);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
    const payslips = query('SELECT p.*, r.period_month, r.period_year FROM acc_payslips p JOIN acc_payroll_runs r ON p.run_id = r.id WHERE p.employee_id = ? ORDER BY r.period_year DESC, r.period_month DESC LIMIT 12', [req.params.id]);
    res.json({ success: true, data: { ...emp, recent_payslips: payslips } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/employees/:id', (req, res) => {
  try {
    const { name, department, designation, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary, status } = req.body;
    run('UPDATE acc_employees SET name = COALESCE(?, name), department = COALESCE(?, department), designation = COALESCE(?, designation), pan = COALESCE(?, pan), uan = COALESCE(?, uan), esi_number = COALESCE(?, esi_number), bank_account = COALESCE(?, bank_account), bank_ifsc = COALESCE(?, bank_ifsc), salary_structure_id = COALESCE(?, salary_structure_id), gross_salary = COALESCE(?, gross_salary), status = COALESCE(?, status), updated_at = datetime(\'now\') WHERE id = ?',
      [name, department, designation, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary, status, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_employees WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// SALARY STRUCTURES
// =============================================================================

app.get('/api/salary-structures', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM acc_salary_structures ORDER BY name', []) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/salary-structures', (req, res) => {
  try {
    const { name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const id = uuidv4();
    run('INSERT INTO acc_salary_structures (id, name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, basic_pct || 50, hra_pct || 20, da_pct || 10, special_allowance || 0, pf_employer_pct || 12, esi_employer_pct || 3.25]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_salary_structures WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/salary-structures/:id', (req, res) => {
  try {
    const { name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct } = req.body;
    run('UPDATE acc_salary_structures SET name = COALESCE(?, name), basic_pct = COALESCE(?, basic_pct), hra_pct = COALESCE(?, hra_pct), da_pct = COALESCE(?, da_pct), special_allowance = COALESCE(?, special_allowance), pf_employer_pct = COALESCE(?, pf_employer_pct), esi_employer_pct = COALESCE(?, esi_employer_pct) WHERE id = ?',
      [name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_salary_structures WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// PAYROLL SETTINGS
// =============================================================================

app.get('/api/payroll/settings', (req, res) => {
  try {
    let settings = get('SELECT * FROM acc_payroll_settings WHERE id = \'default\'');
    if (!settings) {
      run('INSERT INTO acc_payroll_settings (id, pt_slabs, tds_slabs) VALUES (\'default\', ?, ?)',
        [JSON.stringify([{ min: 0, max: 15000, tax: 0 }, { min: 15001, max: 20000, tax: 150 }, { min: 20001, max: null, tax: 200 }]),
         JSON.stringify([{ min: 0, max: 300000, rate: 0 }, { min: 300001, max: 600000, rate: 5 }, { min: 600001, max: 900000, rate: 10 }, { min: 900001, max: 1200000, rate: 15 }, { min: 1200001, max: 1500000, rate: 20 }, { min: 1500001, max: null, rate: 30 }])]);
      settings = get('SELECT * FROM acc_payroll_settings WHERE id = \'default\'');
    }
    res.json({ success: true, data: { ...settings, pt_slabs: JSON.parse(settings.pt_slabs || '[]'), tds_slabs: JSON.parse(settings.tds_slabs || '[]') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/payroll/settings', (req, res) => {
  try {
    const { pf_rate_employee, pf_rate_employer, pf_wage_ceiling, esi_rate_employee, esi_rate_employer, esi_wage_ceiling, pt_slabs, tds_slabs } = req.body;
    run('UPDATE acc_payroll_settings SET pf_rate_employee = COALESCE(?, pf_rate_employee), pf_rate_employer = COALESCE(?, pf_rate_employer), pf_wage_ceiling = COALESCE(?, pf_wage_ceiling), esi_rate_employee = COALESCE(?, esi_rate_employee), esi_rate_employer = COALESCE(?, esi_rate_employer), esi_wage_ceiling = COALESCE(?, esi_wage_ceiling), pt_slabs = COALESCE(?, pt_slabs), tds_slabs = COALESCE(?, tds_slabs), updated_at = datetime(\'now\') WHERE id = \'default\'',
      [pf_rate_employee, pf_rate_employer, pf_wage_ceiling, esi_rate_employee, esi_rate_employer, esi_wage_ceiling, pt_slabs ? JSON.stringify(pt_slabs) : null, tds_slabs ? JSON.stringify(tds_slabs) : null]);
    res.json({ success: true, data: get('SELECT * FROM acc_payroll_settings WHERE id = \'default\'') });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// PAYROLL RUNS
// =============================================================================

app.post('/api/payroll/run', (req, res) => {
  try {
    const { period_month, period_year } = req.body;
    const month = period_month || new Date().getMonth() + 1;
    const year = period_year || new Date().getFullYear();
    const existing = get('SELECT id FROM acc_payroll_runs WHERE period_month = ? AND period_year = ?', [month, year]);
    if (existing) return res.status(400).json({ success: false, error: `Payroll already exists for ${month}/${year}` });
    const settings = get('SELECT * FROM acc_payroll_settings WHERE id = \'default\'') || {};
    const pfRate = (settings.pf_rate_employee || 12) / 100;
    const pfEmployerRate = (settings.pf_rate_employer || 12) / 100;
    const pfCeiling = settings.pf_wage_ceiling || 15000;
    const esiEmpRate = (settings.esi_rate_employee || 0.75) / 100;
    const esiCorpRate = (settings.esi_rate_employer || 3.25) / 100;
    const esiCeiling = settings.esi_wage_ceiling || 21000;
    const ptSlabs = JSON.parse(settings.pt_slabs || '[]');

    const runId = uuidv4();
    const runNumber = `PAY-${year}-${String(month).padStart(2, '0')}`;
    const employees = query('SELECT e.*, s.basic_pct, s.hra_pct, s.da_pct, s.special_allowance FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id WHERE e.status = \'active\'', []);

    let totalGross = 0, totalDeductions = 0, totalNet = 0;
    for (const emp of employees) {
      const gross = emp.gross_salary || 0;
      const basicPct = (emp.basic_pct || 50) / 100;
      const hraPct = (emp.hra_pct || 20) / 100;
      const daPct = (emp.da_pct || 10) / 100;
      const basic = Math.round(gross * basicPct);
      const hra = Math.round(gross * hraPct);
      const da = Math.round(gross * daPct);
      const special = gross - basic - hra - da;
      const pfWage = Math.min(basic + da, pfCeiling);
      const pfEmployee = Math.round(pfWage * pfRate);
      const pfEmployer = Math.round(pfWage * pfEmployerRate);
      const esiEmployee = gross <= esiCeiling ? Math.round(gross * esiEmpRate) : 0;
      const esiEmployer = gross <= esiCeiling ? Math.round(gross * esiCorpRate) : 0;
      let pt = 0;
      for (const slab of ptSlabs) { if (gross >= slab.min && (!slab.max || gross <= slab.max)) { pt = slab.tax || 0; break; } }
      const annualGross = gross * 12;
      let tds = 0;
      const tdsSlabs = JSON.parse(settings.tds_slabs || '[]');
      let remaining = annualGross;
      for (const slab of tdsSlabs) {
        const slabWidth = slab.max ? slab.max - slab.min + 1 : remaining;
        const taxable = Math.min(remaining, slabWidth);
        tds += taxable * (slab.rate || 0) / 100;
        remaining -= taxable;
        if (remaining <= 0) break;
      }
      tds = Math.round(tds / 12);
      const deductions = pfEmployee + esiEmployee + pt + tds;
      const netPay = gross - deductions;
      totalGross += gross; totalDeductions += deductions; totalNet += netPay;
      const slipId = uuidv4();
      run('INSERT INTO acc_payslips (id, run_id, employee_id, basic, hra, da, special, gross, pf_employee, pf_employer, esi_employee, esi_employer, pt, tds, net_pay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [slipId, runId, emp.id, basic, hra, da, special, gross, pfEmployee, pfEmployer, esiEmployee, esiEmployer, pt, tds, netPay]);
    }

    run('INSERT INTO acc_payroll_runs (id, run_number, period_month, period_year, status, total_gross, total_deductions, total_net, processed_at) VALUES (?, ?, ?, ?, \'draft\', ?, ?, ?, datetime(\'now\'))',
      [runId, runNumber, month, year, totalGross, totalDeductions, totalNet]);
    res.status(201).json({ success: true, data: { run_id: runId, run_number: runNumber, employees_processed: employees.length, total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/payroll/runs', (req, res) => {
  try {
    const { year } = req.query;
    let sql = 'SELECT * FROM acc_payroll_runs WHERE 1=1';
    const params = [];
    if (year) { sql += ' AND period_year = ?'; params.push(year); }
    sql += ' ORDER BY period_year DESC, period_month DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/payroll/runs/:id', (req, res) => {
  try {
    const run_data = get('SELECT * FROM acc_payroll_runs WHERE id = ?', [req.params.id]);
    if (!run_data) return res.status(404).json({ success: false, error: 'Payroll run not found' });
    const payslips = query('SELECT p.*, e.emp_code, e.name as employee_name, e.department, e.designation FROM acc_payslips p JOIN acc_employees e ON p.employee_id = e.id WHERE p.run_id = ? ORDER BY e.emp_code', [req.params.id]);
    res.json({ success: true, data: { ...run_data, payslips } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/payroll/runs/:id/approve', (req, res) => {
  try {
    const { approved_by } = req.body;
    run('UPDATE acc_payroll_runs SET status = \'approved\', approved_by = ?, approved_at = datetime(\'now\') WHERE id = ? AND status = \'draft\'', [approved_by || 'admin', req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_payroll_runs WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/payroll/runs/:id/pay', (req, res) => {
  try {
    const payrollRun = get('SELECT * FROM acc_payroll_runs WHERE id = ?', [req.params.id]);
    if (!payrollRun) return res.status(404).json({ success: false, error: 'Payroll run not found' });
    if (payrollRun.status !== 'approved') return res.status(400).json({ success: false, error: 'Payroll must be approved before payment' });
    run('UPDATE acc_payroll_runs SET status = \'paid\' WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { run_id: req.params.id, status: 'paid', total_net: payrollRun.total_net, message: 'Payroll paid. Create journal entry via JE service.' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/payroll/runs/:id/bank-file', (req, res) => {
  try {
    const payslips = query('SELECT p.net_pay, e.name, e.bank_account, e.bank_ifsc FROM acc_payslips p JOIN acc_employees e ON p.employee_id = e.id WHERE p.run_id = ?', [req.params.id]);
    const lines = payslips.map(p => `${p.bank_ifsc || ''},${p.bank_account || ''},${p.name},${p.net_pay}`);
    const csv = 'IFSC,Account,Name,Amount\n' + lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=bank-transfer-${req.params.id.substring(0, 8)}.csv`);
    res.send(csv);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/payslips/:id/pdf', (req, res) => {
  try {
    const slip = get('SELECT p.*, e.emp_code, e.name as employee_name, e.department, e.designation, e.pan, e.uan, r.period_month, r.period_year FROM acc_payslips p JOIN acc_employees e ON p.employee_id = e.id JOIN acc_payroll_runs r ON p.run_id = r.id WHERE p.id = ?', [req.params.id]);
    if (!slip) return res.status(404).json({ success: false, error: 'Payslip not found' });
    res.json({ success: true, data: { ...slip, earnings: { basic: slip.basic, hra: slip.hra, da: slip.da, special: slip.special, total: slip.gross }, deductions: { pf: slip.pf_employee, esi: slip.esi_employee, pt: slip.pt, tds: slip.tds, total: slip.pf_employee + slip.esi_employee + slip.pt + slip.tds + (slip.other_deductions || 0) }, net_pay: slip.net_pay, period: `${slip.period_month}/${slip.period_year}` } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// PAYROLL SUMMARY
// =============================================================================

app.get('/api/payroll/summary', (req, res) => {
  try {
    const { year } = req.query;
    const yr = year || new Date().getFullYear();
    const runs = query('SELECT * FROM acc_payroll_runs WHERE period_year = ? ORDER BY period_month', [yr]);
    const employees = get('SELECT COUNT(*) as total, COUNT(CASE WHEN status = \'active\' THEN 1 END) as active FROM acc_employees');
    const ytdTotals = get('SELECT SUM(total_gross) as gross, SUM(total_deductions) as deductions, SUM(total_net) as net FROM acc_payroll_runs WHERE period_year = ?', [yr]);
    res.json({ success: true, data: { year: yr, employees: employees || { total: 0, active: 0 }, runs, ytd: ytdTotals || { gross: 0, deductions: 0, net: 0 } } });
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
  app.listen(PORT, () => console.log(`Payroll Processing (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
