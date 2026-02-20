// Coupon business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

async function listCoupons(tenantId, { active_only, search, limit = 100, offset = 0 } = {}) {
  let sql = 'SELECT * FROM coupons WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (active_only === 'true' || active_only === true) {
    sql += ' AND is_active = true';
  }
  if (search) {
    sql += ` AND (code ILIKE $${idx} OR description ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function getCoupon(id, tenantId) {
  const result = await query(
    'SELECT * FROM coupons WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function getCouponByCode(code, tenantId) {
  const result = await query(
    'SELECT * FROM coupons WHERE code = $1 AND tenant_id = $2',
    [code.toUpperCase(), tenantId]
  );
  return result.rows[0] || null;
}

async function createCoupon(tenantId, data) {
  const {
    code, description, discount_type, discount_value,
    min_order_amount, max_discount_amount, max_uses,
    max_uses_per_customer, applicable_products,
    applicable_categories, is_active, starts_at, expires_at
  } = data;

  const result = await query(
    `INSERT INTO coupons (tenant_id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, max_uses_per_customer, applicable_products, applicable_categories, is_active, starts_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      tenantId,
      code.toUpperCase(),
      description || null,
      discount_type || 'percentage',
      discount_value,
      min_order_amount || 0,
      max_discount_amount || null,
      max_uses || null,
      max_uses_per_customer || 1,
      JSON.stringify(applicable_products || []),
      JSON.stringify(applicable_categories || []),
      is_active !== false,
      starts_at || null,
      expires_at || null
    ]
  );

  const coupon = result.rows[0];

  try {
    await publishEnvelope('ecommerce.coupon.created.v1', 1, {
      coupon_id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value
    });
  } catch (_) { /* non-blocking */ }

  return coupon;
}

async function updateCoupon(id, tenantId, data) {
  const existing = await getCoupon(id, tenantId);
  if (!existing) return null;

  const fields = [];
  const params = [];
  let idx = 1;

  if (data.code !== undefined) {
    fields.push(`code = $${idx++}`);
    params.push(data.code.toUpperCase());
  }
  if (data.description !== undefined) {
    fields.push(`description = $${idx++}`);
    params.push(data.description);
  }
  if (data.discount_type !== undefined) {
    fields.push(`discount_type = $${idx++}`);
    params.push(data.discount_type);
  }
  if (data.discount_value !== undefined) {
    fields.push(`discount_value = $${idx++}`);
    params.push(data.discount_value);
  }
  if (data.min_order_amount !== undefined) {
    fields.push(`min_order_amount = $${idx++}`);
    params.push(data.min_order_amount);
  }
  if (data.max_discount_amount !== undefined) {
    fields.push(`max_discount_amount = $${idx++}`);
    params.push(data.max_discount_amount);
  }
  if (data.max_uses !== undefined) {
    fields.push(`max_uses = $${idx++}`);
    params.push(data.max_uses);
  }
  if (data.max_uses_per_customer !== undefined) {
    fields.push(`max_uses_per_customer = $${idx++}`);
    params.push(data.max_uses_per_customer);
  }
  if (data.applicable_products !== undefined) {
    fields.push(`applicable_products = $${idx++}`);
    params.push(JSON.stringify(data.applicable_products));
  }
  if (data.applicable_categories !== undefined) {
    fields.push(`applicable_categories = $${idx++}`);
    params.push(JSON.stringify(data.applicable_categories));
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    params.push(data.is_active);
  }
  if (data.starts_at !== undefined) {
    fields.push(`starts_at = $${idx++}`);
    params.push(data.starts_at);
  }
  if (data.expires_at !== undefined) {
    fields.push(`expires_at = $${idx++}`);
    params.push(data.expires_at);
  }

  if (fields.length === 0) return existing;

  fields.push(`updated_at = NOW()`);
  params.push(id, tenantId);

  const result = await query(
    `UPDATE coupons SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function deleteCoupon(id, tenantId) {
  const result = await query(
    'DELETE FROM coupons WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rows.length > 0;
}

/**
 * Validate a coupon code against business rules
 */
async function validateCoupon(code, tenantId, { customer_id, order_amount, product_ids, category_ids } = {}) {
  const coupon = await getCouponByCode(code, tenantId);
  if (!coupon) {
    return { valid: false, reason: 'Coupon not found' };
  }

  // Check active
  if (!coupon.is_active) {
    return { valid: false, reason: 'Coupon is not active' };
  }

  // Check date range
  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return { valid: false, reason: 'Coupon has not started yet' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { valid: false, reason: 'Coupon has expired' };
  }

  // Check max uses
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return { valid: false, reason: 'Coupon usage limit reached' };
  }

  // Check per-customer usage
  if (customer_id && coupon.max_uses_per_customer) {
    const usageResult = await query(
      'SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = $1 AND customer_id = $2 AND tenant_id = $3',
      [coupon.id, customer_id, tenantId]
    );
    const customerUses = parseInt(usageResult.rows[0].count);
    if (customerUses >= coupon.max_uses_per_customer) {
      return { valid: false, reason: 'Per-customer usage limit reached' };
    }
  }

  // Check minimum order amount
  if (order_amount !== undefined && coupon.min_order_amount > 0) {
    if (parseFloat(order_amount) < parseFloat(coupon.min_order_amount)) {
      return { valid: false, reason: `Minimum order amount is ${coupon.min_order_amount}` };
    }
  }

  // Check applicable products
  const applicableProducts = typeof coupon.applicable_products === 'string'
    ? JSON.parse(coupon.applicable_products)
    : coupon.applicable_products || [];
  if (applicableProducts.length > 0 && product_ids && product_ids.length > 0) {
    const hasMatch = product_ids.some(pid => applicableProducts.includes(pid));
    if (!hasMatch) {
      return { valid: false, reason: 'Coupon does not apply to these products' };
    }
  }

  // Check applicable categories
  const applicableCategories = typeof coupon.applicable_categories === 'string'
    ? JSON.parse(coupon.applicable_categories)
    : coupon.applicable_categories || [];
  if (applicableCategories.length > 0 && category_ids && category_ids.length > 0) {
    const hasMatch = category_ids.some(cid => applicableCategories.includes(cid));
    if (!hasMatch) {
      return { valid: false, reason: 'Coupon does not apply to these categories' };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (order_amount !== undefined) {
    const amt = parseFloat(order_amount);
    if (coupon.discount_type === 'percentage') {
      discountAmount = Math.round(amt * parseFloat(coupon.discount_value) / 100 * 100) / 100;
    } else if (coupon.discount_type === 'fixed') {
      discountAmount = Math.min(parseFloat(coupon.discount_value), amt);
    } else if (coupon.discount_type === 'free_shipping') {
      discountAmount = 0; // Shipping discount handled by caller
    }

    // Cap at max_discount_amount
    if (coupon.max_discount_amount !== null && discountAmount > parseFloat(coupon.max_discount_amount)) {
      discountAmount = parseFloat(coupon.max_discount_amount);
    }
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      description: coupon.description
    },
    discount_amount: discountAmount,
    adjusted_total: order_amount !== undefined ? Math.max(0, parseFloat(order_amount) - discountAmount) : undefined
  };
}

/**
 * Apply a coupon to an order (records usage)
 */
async function applyCoupon(tenantId, { code, customer_id, order_id, order_amount, product_ids, category_ids }) {
  // First validate
  const validation = await validateCoupon(code, tenantId, { customer_id, order_amount, product_ids, category_ids });
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  // Record usage
  await query(
    `INSERT INTO coupon_usage (tenant_id, coupon_id, customer_id, order_id, discount_applied)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, validation.coupon.id, customer_id || null, order_id || null, validation.discount_amount]
  );

  // Increment uses_count
  await query(
    'UPDATE coupons SET uses_count = uses_count + 1, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
    [validation.coupon.id, tenantId]
  );

  try {
    await publishEnvelope('ecommerce.coupon.redeemed.v1', 1, {
      coupon_id: validation.coupon.id,
      code: validation.coupon.code,
      customer_id,
      order_id,
      discount_applied: validation.discount_amount
    });
  } catch (_) { /* non-blocking */ }

  return {
    success: true,
    data: {
      coupon: validation.coupon,
      discount_amount: validation.discount_amount,
      adjusted_total: validation.adjusted_total
    }
  };
}

/**
 * Get coupon analytics
 */
async function getAnalytics(tenantId) {
  // Top coupons by usage
  const topByUsage = await query(
    `SELECT c.id, c.code, c.discount_type, c.discount_value, c.uses_count,
            COALESCE(SUM(cu.discount_applied), 0) as total_discount_given,
            COUNT(cu.id) as redemption_count
     FROM coupons c
     LEFT JOIN coupon_usage cu ON cu.coupon_id = c.id AND cu.tenant_id = $1
     WHERE c.tenant_id = $1
     GROUP BY c.id, c.code, c.discount_type, c.discount_value, c.uses_count
     ORDER BY c.uses_count DESC
     LIMIT 10`,
    [tenantId]
  );

  // Total revenue saved (total discounts applied)
  const revenueSaved = await query(
    'SELECT COALESCE(SUM(discount_applied), 0) as total_revenue_saved, COUNT(*) as total_redemptions FROM coupon_usage WHERE tenant_id = $1',
    [tenantId]
  );

  // Active vs inactive coupons
  const couponStats = await query(
    `SELECT
       COUNT(*) FILTER (WHERE is_active = true) as active_count,
       COUNT(*) FILTER (WHERE is_active = false) as inactive_count,
       COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW()) as expired_count,
       COUNT(*) as total_count
     FROM coupons WHERE tenant_id = $1`,
    [tenantId]
  );

  // Unique customers who redeemed
  const uniqueCustomers = await query(
    'SELECT COUNT(DISTINCT customer_id) as unique_customers FROM coupon_usage WHERE tenant_id = $1 AND customer_id IS NOT NULL',
    [tenantId]
  );

  return {
    top_coupons: topByUsage.rows,
    total_revenue_saved: parseFloat(revenueSaved.rows[0]?.total_revenue_saved || 0),
    total_redemptions: parseInt(revenueSaved.rows[0]?.total_redemptions || 0),
    active_coupons: parseInt(couponStats.rows[0]?.active_count || 0),
    inactive_coupons: parseInt(couponStats.rows[0]?.inactive_count || 0),
    expired_coupons: parseInt(couponStats.rows[0]?.expired_count || 0),
    total_coupons: parseInt(couponStats.rows[0]?.total_count || 0),
    unique_customers: parseInt(uniqueCustomers.rows[0]?.unique_customers || 0)
  };
}

/**
 * Get usage history for a specific coupon
 */
async function getCouponUsage(couponId, tenantId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT * FROM coupon_usage WHERE coupon_id = $1 AND tenant_id = $2 ORDER BY used_at DESC LIMIT $3 OFFSET $4`,
    [couponId, tenantId, parseInt(limit), parseInt(offset)]
  );
  return result.rows;
}

module.exports = {
  listCoupons,
  getCoupon,
  getCouponByCode,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getAnalytics,
  getCouponUsage
};
