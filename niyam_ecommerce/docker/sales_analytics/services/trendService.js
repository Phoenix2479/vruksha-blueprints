// Trend analysis service
// Groups orders by day/week/month for time-series data

const { query } = require('@vruksha/platform/db/postgres');

/**
 * Get revenue trends grouped by day/week/month
 */
async function getTrends(tenantId, { group_by = 'day', start_date, end_date }) {
  const conditions = ['o.tenant_id = $1', "o.payment_status = 'paid'"];
  const params = [tenantId];
  let idx = 2;

  if (start_date) {
    conditions.push(`o.created_at >= $${idx}::timestamptz`);
    params.push(start_date);
    idx += 1;
  }
  if (end_date) {
    conditions.push(`o.created_at <= $${idx}::timestamptz`);
    params.push(end_date);
    idx += 1;
  }

  const whereClause = conditions.join(' AND ');

  let dateTrunc;
  switch (group_by) {
    case 'week':
      dateTrunc = "date_trunc('week', o.created_at)";
      break;
    case 'month':
      dateTrunc = "date_trunc('month', o.created_at)";
      break;
    default:
      dateTrunc = "date_trunc('day', o.created_at)";
  }

  const result = await query(
    `SELECT
       ${dateTrunc}::date as date,
       SUM(o.total) as revenue,
       COUNT(*) as orders,
       COALESCE(AVG(o.total), 0) as avg_value
     FROM orders o
     WHERE ${whereClause}
     GROUP BY 1
     ORDER BY 1 ASC`,
    params
  );

  return result.rows.map(row => ({
    date: row.date,
    revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
    orders: parseInt(row.orders),
    avg_value: parseFloat(parseFloat(row.avg_value).toFixed(2))
  }));
}

module.exports = {
  getTrends
};
