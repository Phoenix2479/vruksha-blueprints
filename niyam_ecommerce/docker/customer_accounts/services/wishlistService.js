// Wishlist business logic service

const { query } = require('@vruksha/platform/db/postgres');

/**
 * List wishlist items for a customer
 */
async function listWishlist(customerId, tenantId) {
  const result = await query(
    `SELECT * FROM wishlists WHERE customer_id = $1 AND tenant_id = $2 ORDER BY added_at DESC`,
    [customerId, tenantId]
  );
  return result.rows;
}

/**
 * Add product to wishlist
 */
async function addToWishlist(customerId, tenantId, productId) {
  try {
    const result = await query(
      `INSERT INTO wishlists (tenant_id, customer_id, product_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, customer_id, product_id) DO NOTHING
       RETURNING *`,
      [tenantId, customerId, productId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: { code: 'ERR_ALREADY_IN_WISHLIST', message: 'Product already in wishlist' } };
    }

    return { success: true, data: result.rows[0] };
  } catch (error) {
    if (error.code === '23505') {
      return { success: false, error: { code: 'ERR_ALREADY_IN_WISHLIST', message: 'Product already in wishlist' } };
    }
    throw error;
  }
}

/**
 * Remove product from wishlist
 */
async function removeFromWishlist(customerId, tenantId, productId) {
  const result = await query(
    `DELETE FROM wishlists WHERE customer_id = $1 AND tenant_id = $2 AND product_id = $3 RETURNING id`,
    [customerId, tenantId, productId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'ERR_NOT_IN_WISHLIST', message: 'Product not in wishlist' } };
  }

  return { success: true, data: { id: result.rows[0].id } };
}

module.exports = {
  listWishlist,
  addToWishlist,
  removeFromWishlist
};
