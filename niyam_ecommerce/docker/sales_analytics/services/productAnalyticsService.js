// Product analytics service
// Queries order_items joined with products for top product rankings

const { query } = require('@vruksha/platform/db/postgres');

/**
 * Get top products by revenue or units sold
 */
async function getTopProducts(tenantId, { sort_by = 'revenue', limit = 10, start_date, end_date }) {
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
  const orderBy = sort_by === 'units' ? 'units_sold DESC' : 'revenue DESC';

  params.push(Math.min(parseInt(limit), 100));

  const result = await query(
    `SELECT
       oi.product_id,
       COALESCE(oi.name, 'Unknown') as product_name,
       COALESCE(oi.sku, '') as sku,
       SUM(oi.quantity) as units_sold,
       SUM(oi.total_price) as revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE ${whereClause}
     GROUP BY oi.product_id, oi.name, oi.sku
     ORDER BY ${orderBy}
     LIMIT $${idx}`,
    params
  );

  return result.rows.map(row => ({
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    units_sold: parseInt(row.units_sold),
    revenue: parseFloat(parseFloat(row.revenue).toFixed(2))
  }));
}

module.exports = {
  getTopProducts
};
