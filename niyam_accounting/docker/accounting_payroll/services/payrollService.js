// Payroll Service - Business logic + DB queries
// Handles employees, salary structures, payroll settings, payroll runs, payslips

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

// ─── Employees ──────────────────────────────────────────────────────

async function listEmployees(tenantId, filters) {
  const { status, department } = filters;
  let sql = 'SELECT e.*, s.name as structure_name FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id WHERE e.tenant_id = $1';
  const params = [tenantId]; let idx = 2;
  if (status) { sql += ` AND e.status = $${idx++}`; params.push(status); }
  if (department) { sql += ` AND e.department = $${idx++}`; params.push(department); }
  sql += ' ORDER BY e.name';
  const r = await query(sql, params);
  return r.rows;
}

async function listEmployeesForCsv(tenantId) {
  const r = await query('SELECT * FROM acc_employees WHERE tenant_id = $1 ORDER BY name', [tenantId]);
  return r.rows;
}

async function createEmployee(tenantId, data) {
  const { emp_code, name, department, designation, date_of_joining, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary } = data;
  const code = emp_code || `EMP-${Date.now().toString(36).toUpperCase()}`;
  const r = await query(
    `INSERT INTO acc_employees (tenant_id, emp_code, name, department, designation, date_of_joining, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, code, name, department, designation, date_of_joining, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary || 0]);
  return r.rows[0];
}

async function getEmployee(tenantId, id) {
  const r = await query('SELECT e.*, s.name as structure_name FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id WHERE e.tenant_id = $1 AND e.id = $2', [tenantId, id]);
  return r.rows[0] || null;
}

async function updateEmployee(tenantId, id, data) {
  const { name, department, designation, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary, status } = data;
  await query(
    `UPDATE acc_employees SET name = COALESCE($1,name), department = COALESCE($2,department),
     designation = COALESCE($3,designation), pan = COALESCE($4,pan), uan = COALESCE($5,uan),
     esi_number = COALESCE($6,esi_number), bank_account = COALESCE($7,bank_account),
     bank_ifsc = COALESCE($8,bank_ifsc), salary_structure_id = COALESCE($9,salary_structure_id),
     gross_salary = COALESCE($10,gross_salary), status = COALESCE($11,status), updated_at = NOW()
     WHERE tenant_id = $12 AND id = $13`,
    [name, department, designation, pan, uan, esi_number, bank_account, bank_ifsc, salary_structure_id, gross_salary, status, tenantId, id]);
  const r = await query('SELECT * FROM acc_employees WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// ─── Salary Structures ──────────────────────────────────────────────

async function listSalaryStructures(tenantId) {
  const r = await query('SELECT * FROM acc_salary_structures WHERE tenant_id = $1 ORDER BY name', [tenantId]);
  return r.rows;
}

async function createSalaryStructure(tenantId, data) {
  const { name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct } = data;
  const r = await query(
    'INSERT INTO acc_salary_structures (tenant_id, name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [tenantId, name, basic_pct || 50, hra_pct || 20, da_pct || 10, special_allowance || 0, pf_employer_pct || 12, esi_employer_pct || 3.25]);
  return r.rows[0];
}

async function updateSalaryStructure(tenantId, id, data) {
  const { name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct } = data;
  await query(
    `UPDATE acc_salary_structures SET name = COALESCE($1,name), basic_pct = COALESCE($2,basic_pct),
     hra_pct = COALESCE($3,hra_pct), da_pct = COALESCE($4,da_pct), special_allowance = COALESCE($5,special_allowance),
     pf_employer_pct = COALESCE($6,pf_employer_pct), esi_employer_pct = COALESCE($7,esi_employer_pct)
     WHERE tenant_id = $8 AND id = $9`,
    [name, basic_pct, hra_pct, da_pct, special_allowance, pf_employer_pct, esi_employer_pct, tenantId, id]);
  const r = await query('SELECT * FROM acc_salary_structures WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// ─── Payroll Settings ───────────────────────────────────────────────

const DEFAULT_SETTINGS = { pf_rate_employee: 12, pf_rate_employer: 12, pf_wage_ceiling: 15000, esi_rate_employee: 0.75, esi_rate_employer: 3.25, esi_wage_ceiling: 21000 };

async function getSettings(tenantId) {
  const r = await query('SELECT * FROM acc_payroll_settings WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  return r.rows[0] || DEFAULT_SETTINGS;
}

async function updateSettings(tenantId, data) {
  await query(
    `INSERT INTO acc_payroll_settings (id, tenant_id, pf_rate_employee, pf_rate_employer, pf_wage_ceiling, esi_rate_employee, esi_rate_employer, esi_wage_ceiling, pt_slabs, tds_slabs, updated_at)
     VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET pf_rate_employee = $2, pf_rate_employer = $3, pf_wage_ceiling = $4,
     esi_rate_employee = $5, esi_rate_employer = $6, esi_wage_ceiling = $7, pt_slabs = $8, tds_slabs = $9, updated_at = NOW()`,
    [tenantId, data.pf_rate_employee || 12, data.pf_rate_employer || 12, data.pf_wage_ceiling || 15000, data.esi_rate_employee || 0.75, data.esi_rate_employer || 3.25, data.esi_wage_ceiling || 21000, data.pt_slabs ? JSON.stringify(data.pt_slabs) : null, data.tds_slabs ? JSON.stringify(data.tds_slabs) : null]);
  return { success: true, message: 'Settings updated' };
}

// ─── Run Payroll ────────────────────────────────────────────────────

async function runPayroll(tenantId, periodMonth, periodYear) {
  const existing = await query('SELECT id FROM acc_payroll_runs WHERE tenant_id = $1 AND period_month = $2 AND period_year = $3', [tenantId, periodMonth, periodYear]);
  if (existing.rows.length) return { conflict: true };

  const employees = await query('SELECT e.*, s.basic_pct, s.hra_pct, s.da_pct, s.special_allowance FROM acc_employees e LEFT JOIN acc_salary_structures s ON e.salary_structure_id = s.id WHERE e.tenant_id = $1 AND e.status = $2', [tenantId, 'active']);
  const settings = await query('SELECT * FROM acc_payroll_settings WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  const s = settings.rows[0] || DEFAULT_SETTINGS;

  const runNum = `PR-${periodYear}-${String(periodMonth).padStart(2,'0')}`;
  const run = await query(
    'INSERT INTO acc_payroll_runs (tenant_id, run_number, period_month, period_year) VALUES ($1,$2,$3,$4) RETURNING *',
    [tenantId, runNum, periodMonth, periodYear]);

  let totalGross = 0, totalDeductions = 0, totalNet = 0;
  for (const emp of employees.rows) {
    const gross = parseFloat(emp.gross_salary) || 0;
    const basic = gross * ((emp.basic_pct || 50) / 100);
    const hra = gross * ((emp.hra_pct || 20) / 100);
    const da = gross * ((emp.da_pct || 10) / 100);
    const special = gross - basic - hra - da;
    const pfWage = Math.min(basic, parseFloat(s.pf_wage_ceiling) || 15000);
    const pfEmp = pfWage * (parseFloat(s.pf_rate_employee) || 12) / 100;
    const pfEr = pfWage * (parseFloat(s.pf_rate_employer) || 12) / 100;
    let esiEmp = 0, esiEr = 0;
    if (gross <= (parseFloat(s.esi_wage_ceiling) || 21000)) {
      esiEmp = gross * (parseFloat(s.esi_rate_employee) || 0.75) / 100;
      esiEr = gross * (parseFloat(s.esi_rate_employer) || 3.25) / 100;
    }
    const pt = gross > 15000 ? 200 : gross > 10000 ? 150 : 0;
    const tds = gross > 50000 ? (gross - 50000) * 0.1 / 12 : 0;
    const netPay = gross - pfEmp - esiEmp - pt - tds;
    await query(
      `INSERT INTO acc_payslips (tenant_id, run_id, employee_id, basic, hra, da, special, gross, pf_employee, pf_employer, esi_employee, esi_employer, pt, tds, net_pay)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [tenantId, run.rows[0].id, emp.id, basic, hra, da, special, gross, pfEmp, pfEr, esiEmp, esiEr, pt, tds, netPay]);
    totalGross += gross; totalDeductions += (pfEmp + esiEmp + pt + tds); totalNet += netPay;
  }
  await query('UPDATE acc_payroll_runs SET total_gross = $1, total_deductions = $2, total_net = $3, processed_at = NOW() WHERE id = $4',
    [totalGross, totalDeductions, totalNet, run.rows[0].id]);

  return { ...run.rows[0], total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet, employees_processed: employees.rows.length };
}

// ─── Payroll Runs ───────────────────────────────────────────────────

async function listRuns(tenantId) {
  const r = await query('SELECT * FROM acc_payroll_runs WHERE tenant_id = $1 ORDER BY period_year DESC, period_month DESC', [tenantId]);
  return r.rows;
}

async function getRun(tenantId, id) {
  const r = await query('SELECT * FROM acc_payroll_runs WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const slips = await query('SELECT ps.*, e.name as employee_name, e.emp_code FROM acc_payslips ps JOIN acc_employees e ON ps.employee_id = e.id WHERE ps.tenant_id = $1 AND ps.run_id = $2 ORDER BY e.name', [tenantId, id]);
  return { ...r.rows[0], payslips: slips.rows };
}

async function approveRun(tenantId, id, approvedBy) {
  await query(`UPDATE acc_payroll_runs SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE tenant_id = $2 AND id = $3 AND status = 'draft'`,
    [approvedBy || null, tenantId, id]);
  const r = await query('SELECT * FROM acc_payroll_runs WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function payRun(tenantId, id) {
  await query(`UPDATE acc_payroll_runs SET status = 'paid' WHERE tenant_id = $1 AND id = $2 AND status = 'approved'`, [tenantId, id]);
  const r = await query('SELECT * FROM acc_payroll_runs WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function getBankFileData(tenantId, runId) {
  const slips = await query(
    `SELECT e.name, e.bank_account, e.bank_ifsc, ps.net_pay FROM acc_payslips ps
     JOIN acc_employees e ON ps.employee_id = e.id WHERE ps.tenant_id = $1 AND ps.run_id = $2`, [tenantId, runId]);
  return slips.rows;
}

// ─── Payslip PDF ────────────────────────────────────────────────────

async function getPayslipData(tenantId, id) {
  const slip = await query(
    `SELECT ps.*, e.name as employee_name, e.emp_code, e.department, e.designation
     FROM acc_payslips ps JOIN acc_employees e ON ps.employee_id = e.id WHERE ps.tenant_id = $1 AND ps.id = $2`, [tenantId, id]);
  return slip.rows[0] || null;
}

// ─── Summary ────────────────────────────────────────────────────────

async function getSummary(tenantId) {
  const recent = await query('SELECT * FROM acc_payroll_runs WHERE tenant_id = $1 ORDER BY period_year DESC, period_month DESC LIMIT 12', [tenantId]);
  const empCount = await query("SELECT COUNT(*) as count FROM acc_employees WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
  return { recent_runs: recent.rows, active_employees: parseInt(empCount.rows[0].count) };
}

module.exports = {
  listEmployees,
  listEmployeesForCsv,
  createEmployee,
  getEmployee,
  updateEmployee,
  listSalaryStructures,
  createSalaryStructure,
  updateSalaryStructure,
  getSettings,
  updateSettings,
  runPayroll,
  listRuns,
  getRun,
  approveRun,
  payRun,
  getBankFileData,
  getPayslipData,
  getSummary
};
