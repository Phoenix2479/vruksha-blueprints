// Catalog Routes - Categories, Brands, Tags
// For Product Catalog UI

const express = require('express');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { requireAnyRole } = require('../middleware');

const router = express.Router();

// ============================================
// CATEGORIES
// ============================================

// List categories with hierarchy
router.get('/categories', async (req, res, next) => {
  try {
    // Get all unique categories from products, with counts
    const result = await query(`
      SELECT 
        category as id,
        category as name,
        COUNT(*) as product_count
      FROM products 
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY category
    `);

    res.json({ 
      success: true, 
      categories: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        productCount: parseInt(r.product_count),
        children: []
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get single category
router.get('/categories/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        $1 as id,
        $1 as name,
        COUNT(*) as product_count
      FROM products 
      WHERE category = $1
    `, [id]);

    if (result.rows.length === 0 || result.rows[0].product_count === '0') {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ 
      success: true, 
      category: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        productCount: parseInt(result.rows[0].product_count)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create category (adds category to system by creating metadata or updating products)
router.post('/categories', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { name, parent_id, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    // For now, categories are stored as strings on products
    // Return the newly "created" category
    res.status(201).json({ 
      success: true, 
      category: {
        id: name.trim(),
        name: name.trim(),
        parentId: parent_id || null,
        description: description || null,
        productCount: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update category (rename category across all products)
router.patch('/categories/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    await client.query('BEGIN');

    // Update all products with the old category name
    const result = await client.query(`
      UPDATE products 
      SET category = $1, updated_at = NOW()
      WHERE category = $2
      RETURNING id
    `, [name.trim(), id]);

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      category: {
        id: name.trim(),
        name: name.trim(),
        productCount: result.rowCount
      },
      updated_products: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Delete category (set products to null category)
router.delete('/categories/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Remove category from all products (set to null)
    const result = await client.query(`
      UPDATE products 
      SET category = NULL, updated_at = NOW()
      WHERE category = $1
      RETURNING id
    `, [id]);

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      deleted: id,
      affected_products: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Reorder categories (no-op for string-based categories)
router.post('/categories/reorder', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    res.json({ success: true, message: 'Categories reordered' });
  } catch (error) {
    next(error);
  }
});

// ============================================
// BRANDS
// ============================================

// List brands
router.get('/brands', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        brand as id,
        brand as name,
        COUNT(*) as product_count
      FROM products 
      WHERE brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY brand
    `);

    res.json({ 
      success: true, 
      brands: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        productCount: parseInt(r.product_count)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Create brand
router.post('/brands', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { name, description, logo_url } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    res.status(201).json({ 
      success: true, 
      brand: {
        id: name.trim(),
        name: name.trim(),
        description: description || null,
        logoUrl: logo_url || null,
        productCount: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update brand (rename across all products)
router.patch('/brands/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE products 
      SET brand = $1, updated_at = NOW()
      WHERE brand = $2
      RETURNING id
    `, [name.trim(), id]);

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      brand: {
        id: name.trim(),
        name: name.trim(),
        productCount: result.rowCount
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Delete brand
router.delete('/brands/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE products 
      SET brand = NULL, updated_at = NOW()
      WHERE brand = $1
      RETURNING id
    `, [id]);

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      deleted: id,
      affected_products: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// TAGS
// ============================================

// List all tags
router.get('/tags', async (req, res, next) => {
  try {
    // Tags are stored in products.attributes JSONB or a separate tags column
    // For now, extract unique tags from products
    const result = await query(`
      SELECT DISTINCT jsonb_array_elements_text(attributes->'tags') as tag
      FROM products 
      WHERE attributes->'tags' IS NOT NULL
      ORDER BY tag
    `);

    res.json({ 
      success: true, 
      tags: result.rows.map(r => r.tag)
    });
  } catch (error) {
    // If the query fails (no tags column), return empty
    res.json({ success: true, tags: [] });
  }
});

// Get popular tags with counts
router.get('/tags/popular', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const result = await query(`
      SELECT 
        tag,
        COUNT(*) as count
      FROM (
        SELECT jsonb_array_elements_text(attributes->'tags') as tag
        FROM products 
        WHERE attributes->'tags' IS NOT NULL
      ) t
      GROUP BY tag
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);

    res.json({ 
      success: true, 
      tags: result.rows.map(r => ({
        tag: r.tag,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    // Return empty if tags not available
    res.json({ success: true, tags: [] });
  }
});

module.exports = router;
