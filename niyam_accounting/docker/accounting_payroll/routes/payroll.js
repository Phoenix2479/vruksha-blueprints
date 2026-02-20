// Payroll route handlers
// Delegates all business logic to payrollService

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { payrollService } = require('../services');

// ─── Employees ──────────────────────────────────────────────────────

router.get('/api/employees', async (req, res, next) => {
  try {
    const data = await payrollService.listEmployees(getTenantId(req), req.query);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/employees/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await payrollService.listEmployeesForCsv(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'employees.csv');
  } catch (e) { next(e); }
});

router.post('/api/employees', async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name required' });
    const data = await payrollService.createEmployee(getTenantId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/employees/:id', async (req, res, next) => {
  try {
    const data = await payrollService.getEmployee(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/api/employees/:id', async (req, res, next) => {
  try {
    const data = await payrollService.updateEmployee(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Salary Structures ──────────────────────────────────────────────

router.get('/api/salary-structures', async (req, res, next) => {
  try {
    const data = await payrollService.listSalaryStructures(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/salary-structures', async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name required' });
    const data = await payrollService.createSalaryStructure(getTenantId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/api/salary-structures/:id', async (req, res, next) => {
  try {
    const data = await payrollService.updateSalaryStructure(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Payroll Settings ───────────────────────────────────────────────

router.get('/api/payroll/settings', async (req, res, next) => {
  try {
    const data = await payrollService.getSettings(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/api/payroll/settings', async (req, res, next) => {
  try {
    const result = await payrollService.updateSettings(getTenantId(req), req.body);
    res.json(result);
  } catch (e) { next(e); }
});

// ─── Run Payroll ────────────────────────────────────────────────────

router.post('/api/payroll/run', async (req, res, next) => {
  try {
    const { period_month, period_year } = req.body;
    if (!period_month || !period_year) return res.status(400).json({ error: 'period_month and period_year required' });
    const data = await payrollService.runPayroll(getTenantId(req), period_month, period_year);
    if (data.conflict) return res.status(409).json({ error: 'Payroll already exists for this period' });
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Payroll Runs ───────────────────────────────────────────────────

router.get('/api/payroll/runs', async (req, res, next) => {
  try {
    const data = await payrollService.listRuns(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/payroll/runs/:id', async (req, res, next) => {
  try {
    const data = await payrollService.getRun(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Run not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/payroll/runs/:id/approve', async (req, res, next) => {
  try {
    const data = await payrollService.approveRun(getTenantId(req), req.params.id, req.body.approved_by);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/payroll/runs/:id/pay', async (req, res, next) => {
  try {
    const data = await payrollService.payRun(getTenantId(req), req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/payroll/runs/:id/bank-file', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await payrollService.getBankFileData(getTenantId(req), req.params.id);
    csvGen.sendCSV(res, rows, null, 'bank-transfer.csv');
  } catch (e) { next(e); }
});

// ─── Payslip PDF ────────────────────────────────────────────────────

router.get('/api/payslips/:id/pdf', async (req, res, next) => {
  try {
    const pdfGen = require('../../shared/pdf-generator');
    const s = await payrollService.getPayslipData(getTenantId(req), req.params.id);
    if (!s) return res.status(404).json({ error: 'Payslip not found' });
    const cols = [{ key: 'component', label: 'Component', width: 2 }, { key: 'amount', label: 'Amount', align: 'right', width: 1 }];
    const rows = [
      { component: 'Basic', amount: pdfGen.fmtCurrency(s.basic) }, { component: 'HRA', amount: pdfGen.fmtCurrency(s.hra) },
      { component: 'DA', amount: pdfGen.fmtCurrency(s.da) }, { component: 'Special Allowance', amount: pdfGen.fmtCurrency(s.special) },
      { component: 'Gross', amount: pdfGen.fmtCurrency(s.gross) },
      { component: 'PF (Employee)', amount: pdfGen.fmtCurrency(s.pf_employee) }, { component: 'ESI (Employee)', amount: pdfGen.fmtCurrency(s.esi_employee) },
      { component: 'PT', amount: pdfGen.fmtCurrency(s.pt) }, { component: 'TDS', amount: pdfGen.fmtCurrency(s.tds) },
      { component: 'Net Pay', amount: pdfGen.fmtCurrency(s.net_pay) }
    ];
    pdfGen.sendPDF(res, (doc) => {
      pdfGen.addHeader(doc, 'Payslip');
      doc.text(`Employee: ${s.employee_name} (${s.emp_code})`);
      doc.text(`Department: ${s.department || '-'} | Designation: ${s.designation || '-'}`);
      doc.moveDown();
      pdfGen.addTable(doc, cols, rows);
    }, `Payslip-${s.emp_code}.pdf`);
  } catch (e) { next(e); }
});

// ─── Summary ────────────────────────────────────────────────────────

router.get('/api/payroll/summary', async (req, res, next) => {
  try {
    const data = await payrollService.getSummary(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

module.exports = router;
