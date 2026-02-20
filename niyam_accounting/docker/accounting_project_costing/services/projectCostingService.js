// Business logic / DB queries for Project Costing

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

// --- Projects ---

async function listProjects(tenantId, filters) {
  let sql = 'SELECT * FROM acc_projects WHERE tenant_id = $1';
  const params = [tenantId]; let idx = 2;
  if (filters.status) { sql += ` AND status = $${idx++}`; params.push(filters.status); }
  sql += ' ORDER BY created_at DESC';
  const r = await query(sql, params);
  return r.rows;
}

async function listProjectsCsv(tenantId) {
  const r = await query('SELECT * FROM acc_projects WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows;
}

async function createProject(tenantId, body) {
  const { code, name, client_name, start_date, end_date, budget, description, manager } = body;
  const projCode = code || `PROJ-${Date.now().toString(36).toUpperCase()}`;
  const r = await query(
    `INSERT INTO acc_projects (tenant_id, code, name, client_name, start_date, end_date, budget, description, manager)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, projCode, name, client_name || null, start_date || null, end_date || null, budget || 0, description || null, manager || null]);
  return r.rows[0];
}

async function getProject(tenantId, id) {
  const r = await query('SELECT * FROM acc_projects WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const costs = await query('SELECT * FROM acc_project_costs WHERE tenant_id = $1 AND project_id = $2 ORDER BY cost_date DESC', [tenantId, id]);
  const revenue = await query('SELECT * FROM acc_project_revenue WHERE tenant_id = $1 AND project_id = $2 ORDER BY revenue_date DESC', [tenantId, id]);
  return { ...r.rows[0], costs: costs.rows, revenue: revenue.rows };
}

async function updateProject(tenantId, id, body) {
  const { name, client_name, start_date, end_date, budget, description, manager, status } = body;
  await query(
    `UPDATE acc_projects SET name = COALESCE($1,name), client_name = COALESCE($2,client_name),
     start_date = COALESCE($3,start_date), end_date = COALESCE($4,end_date), budget = COALESCE($5,budget),
     description = COALESCE($6,description), manager = COALESCE($7,manager), status = COALESCE($8,status),
     updated_at = NOW() WHERE tenant_id = $9 AND id = $10`,
    [name, client_name, start_date, end_date, budget, description, manager, status, tenantId, id]);
  const r = await query('SELECT * FROM acc_projects WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

async function deleteProject(tenantId, id) {
  await query('DELETE FROM acc_project_costs WHERE tenant_id = $1 AND project_id = $2', [tenantId, id]);
  await query('DELETE FROM acc_project_revenue WHERE tenant_id = $1 AND project_id = $2', [tenantId, id]);
  await query('DELETE FROM acc_projects WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
}

// --- Allocate Cost ---

async function allocateCost(tenantId, projectId, body) {
  const { cost_type, description, amount, account_id, cost_date, reference } = body;
  const r = await query(
    `INSERT INTO acc_project_costs (tenant_id, project_id, cost_type, description, amount, account_id, cost_date, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, projectId, cost_type || 'direct', description, amount, account_id || null, cost_date || new Date().toISOString().split('T')[0], reference || null]);
  const totalCost = await query('SELECT COALESCE(SUM(amount), 0) as total FROM acc_project_costs WHERE tenant_id = $1 AND project_id = $2', [tenantId, projectId]);
  await query('UPDATE acc_projects SET actual_cost = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [totalCost.rows[0].total, tenantId, projectId]);
  return r.rows[0];
}

// --- Add Revenue ---

async function addRevenue(tenantId, projectId, body) {
  const { description, amount, account_id, revenue_date, reference } = body;
  const r = await query(
    `INSERT INTO acc_project_revenue (tenant_id, project_id, description, amount, account_id, revenue_date, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, projectId, description, amount, account_id || null, revenue_date || new Date().toISOString().split('T')[0], reference || null]);
  const totalRev = await query('SELECT COALESCE(SUM(amount), 0) as total FROM acc_project_revenue WHERE tenant_id = $1 AND project_id = $2', [tenantId, projectId]);
  await query('UPDATE acc_projects SET actual_revenue = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [totalRev.rows[0].total, tenantId, projectId]);
  return r.rows[0];
}

// --- Profitability ---

async function getProfitability(tenantId, projectId) {
  const p = await query('SELECT * FROM acc_projects WHERE tenant_id = $1 AND id = $2', [tenantId, projectId]);
  if (!p.rows.length) return null;
  const proj = p.rows[0];
  const costByType = await query('SELECT cost_type, SUM(amount) as total FROM acc_project_costs WHERE tenant_id = $1 AND project_id = $2 GROUP BY cost_type', [tenantId, projectId]);
  const totalCost = parseFloat(proj.actual_cost) || 0;
  const totalRevenue = parseFloat(proj.actual_revenue) || 0;
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0;
  const budgetUsed = parseFloat(proj.budget) > 0 ? (totalCost / parseFloat(proj.budget) * 100) : 0;
  return {
    project: proj.name, total_cost: totalCost, total_revenue: totalRevenue,
    profit, margin: Math.round(margin * 100) / 100,
    budget: parseFloat(proj.budget), budget_used_pct: Math.round(budgetUsed * 100) / 100,
    cost_breakdown: costByType.rows
  };
}

// --- Budget vs Actual ---

async function getBudgetVsActual(tenantId, projectId) {
  const p = await query('SELECT * FROM acc_projects WHERE tenant_id = $1 AND id = $2', [tenantId, projectId]);
  if (!p.rows.length) return null;
  const proj = p.rows[0];
  const monthly = await query(
    `SELECT DATE_TRUNC('month', cost_date) as month, SUM(amount) as actual_cost
     FROM acc_project_costs WHERE tenant_id = $1 AND project_id = $2
     GROUP BY DATE_TRUNC('month', cost_date) ORDER BY month`, [tenantId, projectId]);
  const budget = parseFloat(proj.budget) || 0;
  const actual = parseFloat(proj.actual_cost) || 0;
  return {
    budget, actual, variance: budget - actual,
    variance_pct: budget > 0 ? ((budget - actual) / budget * 100) : 0,
    monthly: monthly.rows
  };
}

module.exports = {
  listProjects,
  listProjectsCsv,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  allocateCost,
  addRevenue,
  getProfitability,
  getBudgetVsActual
};
