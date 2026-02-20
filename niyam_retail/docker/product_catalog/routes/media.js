// Product Catalog - Media Routes
const express = require('express');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');

const router = express.Router();

// ============================================
// PRODUCT MEDIA
// ============================================

const CreateMediaSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  media_type: z.enum(['image', 'video', 'document', '3d_model']),
  url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  alt_text: z.string().optional(),
  title: z.string().optional(),
  sort_order: z.number().int().optional(),
  is_primary: z.boolean().optional(),
  metadata: z.record(z.any()).optional()
});

// Get media for product
router.get('/product/:product_id', async (req, res, next) => {
  try {
    const { product_id } = req.params;
    const { variant_id } = req.query;
    
    let sql = 'SELECT * FROM product_media WHERE product_id = $1';
    const params = [product_id];
    
    if (variant_id) {
      sql += ' AND variant_id = $2';
      params.push(variant_id);
    }
    
    sql += ' ORDER BY is_primary DESC, sort_order ASC';
    
    const result = await query(sql, params);
    res.json({ success: true, media: result.rows });
  } catch (error) {
    next(error);
  }
});

// Add media
router.post('/', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const parsed = CreateMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const data = parsed.data;
    
    await client.query('BEGIN');
    
    // If this is primary, unset other primaries
    if (data.is_primary) {
      await client.query(
        'UPDATE product_media SET is_primary = false WHERE product_id = $1',
        [data.product_id]
      );
    }
    
    const result = await client.query(
      `INSERT INTO product_media 
       (product_id, variant_id, media_type, url, thumbnail_url, alt_text, title, sort_order, is_primary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.product_id, data.variant_id, data.media_type, data.url,
        data.thumbnail_url, data.alt_text, data.title,
        data.sort_order || 0, data.is_primary || false,
        data.metadata ? JSON.stringify(data.metadata) : null
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({ success: true, media: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Update media
router.patch('/:id', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const { id } = req.params;
    const { alt_text, title, sort_order, is_primary, url, thumbnail_url } = req.body;
    
    await client.query('BEGIN');
    
    // If setting as primary, unset others
    if (is_primary) {
      const mediaResult = await client.query('SELECT product_id FROM product_media WHERE id = $1', [id]);
      if (mediaResult.rows.length > 0) {
        await client.query(
          'UPDATE product_media SET is_primary = false WHERE product_id = $1 AND id != $2',
          [mediaResult.rows[0].product_id, id]
        );
      }
    }
    
    const updates = [];
    const params = [id];
    let idx = 2;
    
    if (alt_text !== undefined) { updates.push(`alt_text = $${idx++}`); params.push(alt_text); }
    if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(sort_order); }
    if (is_primary !== undefined) { updates.push(`is_primary = $${idx++}`); params.push(is_primary); }
    if (url !== undefined) { updates.push(`url = $${idx++}`); params.push(url); }
    if (thumbnail_url !== undefined) { updates.push(`thumbnail_url = $${idx++}`); params.push(thumbnail_url); }
    
    if (updates.length === 0) {
      await client.query('COMMIT');
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await client.query(
      `UPDATE product_media SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    
    await client.query('COMMIT');
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json({ success: true, media: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Delete media
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query('DELETE FROM product_media WHERE id = $1 RETURNING id', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json({ success: true, message: 'Media deleted' });
  } catch (error) {
    next(error);
  }
});

// Reorder media
router.post('/product/:product_id/reorder', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const { product_id } = req.params;
    const { order } = req.body; // Array of { id, sort_order }
    
    await client.query('BEGIN');
    
    for (const item of order) {
      await client.query(
        'UPDATE product_media SET sort_order = $1 WHERE id = $2 AND product_id = $3',
        [item.sort_order, item.id, product_id]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true, message: 'Media reordered' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// PRODUCT REVIEWS
// ============================================

// Get reviews for product
router.get('/reviews/product/:product_id', async (req, res, next) => {
  try {
    const { product_id } = req.params;
    const { status } = req.query;
    
    let sql = 'SELECT * FROM product_reviews WHERE product_id = $1';
    const params = [product_id];
    
    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    } else {
      sql += " AND status = 'approved'";
    }
    
    sql += ' ORDER BY reviewed_at DESC';
    
    const result = await query(sql, params);
    
    // Get aggregate stats
    const statsResult = await query(
      `SELECT 
         COUNT(*) as review_count,
         AVG(rating) as average_rating,
         COUNT(*) FILTER (WHERE rating = 5) as five_star,
         COUNT(*) FILTER (WHERE rating = 4) as four_star,
         COUNT(*) FILTER (WHERE rating = 3) as three_star,
         COUNT(*) FILTER (WHERE rating = 2) as two_star,
         COUNT(*) FILTER (WHERE rating = 1) as one_star
       FROM product_reviews 
       WHERE product_id = $1 AND status = 'approved'`,
      [product_id]
    );
    
    res.json({ 
      success: true, 
      reviews: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Add review
router.post('/reviews', async (req, res, next) => {
  try {
    const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
    
    const { product_id, customer_id, customer_name, rating, title, review_text, pros, cons, images } = req.body;
    
    const result = await query(
      `INSERT INTO product_reviews 
       (tenant_id, product_id, customer_id, customer_name, rating, title, review_text, pros, cons, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [tenantId, product_id, customer_id, customer_name, rating, title, review_text, pros, cons, images ? JSON.stringify(images) : null]
    );
    
    res.json({ success: true, review: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Approve/reject review
router.post('/reviews/:id/moderate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }
    
    const status = action === 'approve' ? 'approved' : 'rejected';
    const approvedAt = action === 'approve' ? 'NOW()' : 'NULL';
    
    const result = await query(
      `UPDATE product_reviews 
       SET status = $1, approved_at = ${action === 'approve' ? 'NOW()' : 'NULL'}
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [status, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Review not found or already moderated' });
    }
    
    res.json({ success: true, review: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
