// Review business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

/**
 * Submit a new review
 */
async function submitReview(tenantId, data) {
  const { product_id, customer_id, customer_name, rating, title, body, is_verified_purchase = false } = data;

  const result = await query(
    `INSERT INTO reviews (tenant_id, product_id, customer_id, customer_name, rating, title, body, is_verified_purchase, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [tenantId, product_id, customer_id || null, customer_name || null, rating, title || null, body || null, is_verified_purchase]
  );

  const review = result.rows[0];

  await publishEnvelope('ecommerce.review.submitted.v1', 1, {
    review_id: review.id,
    product_id: review.product_id,
    customer_id: review.customer_id,
    rating: review.rating,
    timestamp: new Date().toISOString()
  });

  return { success: true, data: review };
}

/**
 * List reviews by product with pagination
 */
async function listByProduct(tenantId, productId, { status, page = 1, limit = 20 }) {
  const conditions = ['r.tenant_id = $1', 'r.product_id = $2'];
  const params = [tenantId, productId];
  let idx = 3;

  if (status) {
    conditions.push(`r.status = $${idx}`);
    params.push(status);
    idx += 1;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  const countResult = await query(
    `SELECT COUNT(*) as total FROM reviews r ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  params.push(parseInt(limit), offset);
  const result = await query(
    `SELECT r.* FROM reviews r ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return {
    data: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }
  };
}

/**
 * Get review by ID
 */
async function getReview(reviewId, tenantId) {
  const result = await query(
    'SELECT * FROM reviews WHERE id = $1 AND tenant_id = $2',
    [reviewId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Moderate review (approve/reject)
 */
async function moderateReview(reviewId, tenantId, status) {
  const result = await query(
    `UPDATE reviews SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [status, reviewId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' } };
  }

  const review = result.rows[0];

  if (status === 'approved') {
    await publishEnvelope('ecommerce.review.approved.v1', 1, {
      review_id: review.id,
      product_id: review.product_id,
      rating: review.rating,
      timestamp: new Date().toISOString()
    });
  }

  return { success: true, data: review };
}

/**
 * Admin respond to a review
 */
async function respondToReview(reviewId, tenantId, adminResponse) {
  const result = await query(
    `UPDATE reviews SET admin_response = $1, responded_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [adminResponse, reviewId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' } };
  }

  return { success: true, data: result.rows[0] };
}

/**
 * Increment helpful count
 */
async function markHelpful(reviewId, tenantId) {
  const result = await query(
    `UPDATE reviews SET helpful_count = helpful_count + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [reviewId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' } };
  }

  return { success: true, data: result.rows[0] };
}

/**
 * Increment reported count
 */
async function reportReview(reviewId, tenantId) {
  const result = await query(
    `UPDATE reviews SET reported_count = reported_count + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [reviewId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' } };
  }

  return { success: true, data: result.rows[0] };
}

/**
 * Get aggregate ratings for a product
 */
async function getProductSummary(tenantId, productId) {
  const result = await query(
    `SELECT
       COUNT(*) as total_reviews,
       COALESCE(AVG(rating), 0) as average_rating,
       COUNT(*) FILTER (WHERE rating = 1) as rating_1,
       COUNT(*) FILTER (WHERE rating = 2) as rating_2,
       COUNT(*) FILTER (WHERE rating = 3) as rating_3,
       COUNT(*) FILTER (WHERE rating = 4) as rating_4,
       COUNT(*) FILTER (WHERE rating = 5) as rating_5
     FROM reviews
     WHERE tenant_id = $1 AND product_id = $2 AND status = 'approved'`,
    [tenantId, productId]
  );

  const row = result.rows[0];
  return {
    product_id: productId,
    average_rating: parseFloat(parseFloat(row.average_rating).toFixed(2)),
    total_reviews: parseInt(row.total_reviews),
    rating_distribution: {
      1: parseInt(row.rating_1),
      2: parseInt(row.rating_2),
      3: parseInt(row.rating_3),
      4: parseInt(row.rating_4),
      5: parseInt(row.rating_5)
    }
  };
}

module.exports = {
  submitReview,
  listByProduct,
  getReview,
  moderateReview,
  respondToReview,
  markHelpful,
  reportReview,
  getProductSummary
};
