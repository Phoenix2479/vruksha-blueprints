// Fixed Assets Service - Business logic + DB queries
// Handles asset categories, fixed assets, depreciation, disposal, forecasting

let db;
try { db = require('../../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

// ─── Asset Categories ───────────────────────────────────────────────

async function listCategories(tenantId) {
  const r = await query('SELECT * FROM acc_asset_categories WHERE tenant_id = $1 ORDER BY name', [tenantId]);
  return r.rows;
}

async function createCategory(tenantId, data) {
  const { name, depreciation_method, depreciation_rate, useful_life_years, salvage_value_pct, gl_asset_account, gl_depreciation_account, gl_expense_account } = data;
  const r = await query(
    `INSERT INTO acc_asset_categories (tenant_id, name, depreciation_method, depreciation_rate, useful_life_years, salvage_value_pct, gl_asset_account, gl_depreciation_account, gl_expense_account)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, name, depreciation_method || 'slm', depreciation_rate || 10, useful_life_years || 10, salvage_value_pct || 5, gl_asset_account, gl_depreciation_account, gl_expense_account]);
  return r.rows[0];
}

async function updateCategory(tenantId, id, data) {
  const { name, depreciation_method, depreciation_rate, useful_life_years, salvage_value_pct } = data;
  await query(
    `UPDATE acc_asset_categories SET name = COALESCE($1,name), depreciation_method = COALESCE($2,depreciation_method),
     depreciation_rate = COALESCE($3,depreciation_rate), useful_life_years = COALESCE($4,useful_life_years),
     salvage_value_pct = COALESCE($5,salvage_value_pct) WHERE tenant_id = $6 AND id = $7`,
    [name, depreciation_method, depreciation_rate, useful_life_years, salvage_value_pct, tenantId, id]);
  const r = await query('SELECT * FROM acc_asset_categories WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// ─── Assets ─────────────────────────────────────────────────────────

async function listAssets(tenantId, filters) {
  const { status, category_id } = filters;
  let sql = 'SELECT a.*, c.name as category_name FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE a.tenant_id = $1';
  const params = [tenantId]; let idx = 2;
  if (status) { sql += ` AND a.status = $${idx++}`; params.push(status); }
  if (category_id) { sql += ` AND a.category_id = $${idx++}`; params.push(category_id); }
  sql += ' ORDER BY a.created_at DESC';
  const r = await query(sql, params);
  return r.rows;
}

async function listAssetsForCsv(tenantId) {
  const r = await query('SELECT a.*, c.name as category_name FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE a.tenant_id = $1 ORDER BY a.created_at DESC', [tenantId]);
  return r.rows;
}

async function createAsset(tenantId, data) {
  const { asset_code, name, category_id, purchase_date, purchase_cost, salvage_value, location, serial_number, description } = data;
  const code = asset_code || `AST-${Date.now().toString(36).toUpperCase()}`;
  let salvage = salvage_value || 0;
  if (!salvage_value && category_id) {
    const cat = await query('SELECT salvage_value_pct FROM acc_asset_categories WHERE tenant_id = $1 AND id = $2', [tenantId, category_id]);
    if (cat.rows.length) salvage = purchase_cost * (cat.rows[0].salvage_value_pct / 100);
  }
  const r = await query(
    `INSERT INTO acc_fixed_assets (tenant_id, asset_code, name, category_id, purchase_date, purchase_cost, current_value, salvage_value, accumulated_depreciation, location, serial_number, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11) RETURNING *`,
    [tenantId, code, name, category_id || null, purchase_date || new Date().toISOString().split('T')[0], purchase_cost, purchase_cost, salvage, location, serial_number, description]);
  return r.rows[0];
}

async function getAsset(tenantId, id) {
  const r = await query('SELECT a.*, c.name as category_name, c.depreciation_method, c.depreciation_rate FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE a.tenant_id = $1 AND a.id = $2', [tenantId, id]);
  if (!r.rows.length) return null;
  const depEntries = await query('SELECT * FROM acc_depreciation_entries WHERE tenant_id = $1 AND asset_id = $2 ORDER BY period_date DESC', [tenantId, id]);
  return { ...r.rows[0], depreciation_entries: depEntries.rows };
}

async function updateAsset(tenantId, id, data) {
  const { name, category_id, location, serial_number, description, salvage_value } = data;
  await query(
    `UPDATE acc_fixed_assets SET name = COALESCE($1,name), category_id = COALESCE($2,category_id),
     location = COALESCE($3,location), serial_number = COALESCE($4,serial_number),
     description = COALESCE($5,description), salvage_value = COALESCE($6,salvage_value), updated_at = NOW()
     WHERE tenant_id = $7 AND id = $8`,
    [name, category_id, location, serial_number, description, salvage_value, tenantId, id]);
  const r = await query('SELECT * FROM acc_fixed_assets WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return r.rows[0];
}

// ─── Depreciation ───────────────────────────────────────────────────

async function runDepreciation(tenantId, periodDate) {
  const pDate = periodDate || new Date().toISOString().split('T')[0];
  const assets = await query(
    `SELECT a.*, c.depreciation_method, c.depreciation_rate, c.useful_life_years
     FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id
     WHERE a.tenant_id = $1 AND a.status = 'active'`, [tenantId]);
  const results = [];
  for (const asset of assets.rows) {
    const cost = parseFloat(asset.purchase_cost);
    const salvage = parseFloat(asset.salvage_value) || 0;
    const accDep = parseFloat(asset.accumulated_depreciation) || 0;
    const depreciable = cost - salvage;
    if (accDep >= depreciable) continue;
    let monthlyDep;
    const method = asset.depreciation_method || 'slm';
    const rate = parseFloat(asset.depreciation_rate) || 10;
    if (method === 'slm') {
      monthlyDep = depreciable * rate / 100 / 12;
    } else if (method === 'wdv') {
      const wdv = cost - accDep;
      monthlyDep = wdv * rate / 100 / 12;
    } else {
      monthlyDep = depreciable / ((asset.useful_life_years || 10) * 12);
    }
    monthlyDep = Math.min(monthlyDep, depreciable - accDep);
    if (monthlyDep <= 0) continue;
    await query(
      `INSERT INTO acc_depreciation_entries (tenant_id, asset_id, period_date, amount, method, depreciation_rate, accumulated_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, asset.id, pDate, monthlyDep, method, rate, accDep + monthlyDep]);
    await query('UPDATE acc_fixed_assets SET accumulated_depreciation = $1, current_value = $2, updated_at = NOW() WHERE id = $3',
      [accDep + monthlyDep, cost - accDep - monthlyDep, asset.id]);
    results.push({ asset_id: asset.id, asset_name: asset.name, depreciation: monthlyDep });
  }
  return { period: pDate, assets_processed: results.length, results };
}

// ─── Schedule ───────────────────────────────────────────────────────

async function getSchedule(tenantId, id) {
  const a = await query('SELECT a.*, c.depreciation_method, c.depreciation_rate, c.useful_life_years FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE a.tenant_id = $1 AND a.id = $2', [tenantId, id]);
  if (!a.rows.length) return null;
  const asset = a.rows[0];
  const cost = parseFloat(asset.purchase_cost);
  const salvage = parseFloat(asset.salvage_value) || 0;
  const rate = parseFloat(asset.depreciation_rate) || 10;
  const method = asset.depreciation_method || 'slm';
  const years = asset.useful_life_years || 10;
  const schedule = [];
  let remaining = cost - salvage;
  let wdv = cost;
  for (let y = 1; y <= years && remaining > 0; y++) {
    let dep;
    if (method === 'slm') { dep = (cost - salvage) * rate / 100; }
    else if (method === 'wdv') { dep = wdv * rate / 100; }
    else { dep = (cost - salvage) / years; }
    dep = Math.min(dep, remaining);
    remaining -= dep; wdv -= dep;
    schedule.push({ year: y, depreciation: Math.round(dep * 100) / 100, accumulated: Math.round((cost - salvage - remaining) * 100) / 100, book_value: Math.round((cost - (cost - salvage - remaining)) * 100) / 100 });
  }
  return schedule;
}

// ─── Dispose ────────────────────────────────────────────────────────

async function disposeAsset(tenantId, id, data) {
  const { disposal_date, disposal_amount, disposal_method, notes } = data;
  const a = await query('SELECT * FROM acc_fixed_assets WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!a.rows.length) return null;
  const asset = a.rows[0];
  const bookValue = parseFloat(asset.current_value);
  const dispAmt = parseFloat(disposal_amount) || 0;
  const gainLoss = dispAmt - bookValue;
  await query(
    `UPDATE acc_fixed_assets SET status = 'disposed', disposal_date = $1, disposal_amount = $2,
     disposal_method = $3, gain_loss_on_disposal = $4, notes = $5, updated_at = NOW() WHERE tenant_id = $6 AND id = $7`,
    [disposal_date || new Date().toISOString().split('T')[0], dispAmt, disposal_method || 'sold', gainLoss, notes, tenantId, id]);
  const r = await query('SELECT * FROM acc_fixed_assets WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return { ...r.rows[0], gain_loss: gainLoss };
}

// ─── Forecast ───────────────────────────────────────────────────────

async function getForecast(tenantId, months) {
  const assets = await query(
    `SELECT a.*, c.depreciation_method, c.depreciation_rate FROM acc_fixed_assets a
     LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE a.tenant_id = $1 AND a.status = 'active'`, [tenantId]);
  let totalMonthly = 0;
  for (const asset of assets.rows) {
    const cost = parseFloat(asset.purchase_cost);
    const salvage = parseFloat(asset.salvage_value) || 0;
    const accDep = parseFloat(asset.accumulated_depreciation) || 0;
    const remaining = (cost - salvage) - accDep;
    if (remaining <= 0) continue;
    const rate = parseFloat(asset.depreciation_rate) || 10;
    const method = asset.depreciation_method || 'slm';
    let monthly;
    if (method === 'slm') monthly = (cost - salvage) * rate / 100 / 12;
    else if (method === 'wdv') monthly = (cost - accDep) * rate / 100 / 12;
    else monthly = remaining / 120;
    totalMonthly += Math.min(monthly, remaining);
  }
  const forecast = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    forecast.push({ month: d.toISOString().slice(0, 7), depreciation_estimate: Math.round(totalMonthly * 100) / 100 });
  }
  return { total_active_assets: assets.rows.length, monthly_estimate: Math.round(totalMonthly * 100) / 100, forecast };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  listAssets,
  listAssetsForCsv,
  createAsset,
  getAsset,
  updateAsset,
  runDepreciation,
  getSchedule,
  disposeAsset,
  getForecast
};
