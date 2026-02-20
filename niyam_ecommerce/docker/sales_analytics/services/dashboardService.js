// Dashboard KPI service
// Queries orders/refunds/customers tables for real-time KPIs

const { query } = require('@vruksha/platform/db/postgres');

/**
 * Get dashboard KPIs for a date range
 */
async function getKPIs(tenantId, { start_date, end_date }) {
  const conditions = ['o.tenant_id = $1'];
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

  // Revenue and order metrics from orders table
  const orderResult = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total ELSE 0 END), 0) as total_revenue,
       COUNT(*) as total_orders,
       COALESCE(AVG(CASE WHEN o.payment_status = 'paid' THEN o.total ELSE NULL END), 0) as avg_order_value
     FROM orders o
     WHERE ${whereClause}`,
    params
  );

  // Refunds
  const refundConditions = ['r.tenant_id = $1'];
  const refundParams = [tenantId];
  let refIdx = 2;
  if (start_date) {
    refundConditions.push(`r.created_at >= $${refIdx}::timestamptz`);
    refundParams.push(start_date);
    refIdx += 1;
  }
  if (end_date) {
    refundConditions.push(`r.created_at <= $${refIdx}::timestamptz`);
    refundParams.push(end_date);
    refIdx += 1;
  }

  const refundResult = await query(
    `SELECT COALESCE(SUM(r.amount), 0) as total_refunds
     FROM refunds r
     WHERE ${refundConditions.join(' AND ')} AND r.status = 'processed'`,
    refundParams
  );

  // New customers in period
  const custConditions = ['c.tenant_id = $1'];
  const custParams = [tenantId];
  let custIdx = 2;
  if (start_date) {
    custConditions.push(`c.created_at >= $${custIdx}::timestamptz`);
    custParams.push(start_date);
    custIdx += 1;
  }
  if (end_date) {
    custConditions.push(`c.created_at <= $${custIdx}::timestamptz`);
    custParams.push(end_date);
    custIdx += 1;
  }

  const custResult = await query(
    `SELECT COUNT(*) as new_customers
     FROM customers c
     WHERE ${custConditions.join(' AND ')}`,
    custParams
  );

  const order = orderResult.rows[0];
  const refund = refundResult.rows[0];
  const cust = custResult.rows[0];

  const totalRevenue = parseFloat(order.total_revenue);
  const totalRefunds = parseFloat(refund.total_refunds);

  return {
    total_revenue: totalRevenue,
    total_orders: parseInt(order.total_orders),
    avg_order_value: parseFloat(parseFloat(order.avg_order_value).toFixed(2)),
    total_refunds: totalRefunds,
    net_revenue: parseFloat((totalRevenue - totalRefunds).toFixed(2)),
    new_customers: parseInt(cust.new_customers)
  };
}

module.exports = {
  getKPIs
};
