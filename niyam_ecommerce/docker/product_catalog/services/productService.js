// Product business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { v4: uuidv4 } = require('uuid');

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

async function ensureUniqueSlug(tenantId, slug, excludeId) {
  let candidate = slug;
  let suffix = 1;
  while (true) {
    const params = [tenantId, candidate];
    let sql = 'SELECT id FROM products WHERE tenant_id = $1 AND slug = $2';
    if (excludeId) {
      sql += ' AND id != $3';
      params.push(excludeId);
    }
    const result = await query(sql, params);
    if (result.rows.length === 0) return candidate;
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
}

async function listProducts(tenantId, { search, category_id, status, tag, min_price, max_price, is_featured, limit, offset, sort_by, sort_order }) {
  const conditions = ['p.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (search) {
    conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx} OR p.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  if (category_id) {
    conditions.push(`p.category_id = $${idx}`);
    params.push(category_id);
    idx += 1;
  }

  if (status) {
    conditions.push(`p.status = $${idx}`);
    params.push(status);
    idx += 1;
  }

  if (tag) {
    conditions.push(`$${idx} = ANY(p.tags)`);
    params.push(tag);
    idx += 1;
  }

  if (min_price != null) {
    conditions.push(`p.price >= $${idx}`);
    params.push(min_price);
    idx += 1;
  }

  if (max_price != null) {
    conditions.push(`p.price <= $${idx}`);
    params.push(max_price);
    idx += 1;
  }

  if (is_featured != null) {
    conditions.push(`p.is_featured = $${idx}`);
    params.push(is_featured === 'true' || is_featured === true);
    idx += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const validSortFields = ['name', 'price', 'created_at', 'updated_at'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
  const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

  const effectiveLimit = Math.min(parseInt(limit) || 50, 200);
  const effectiveOffset = parseInt(offset) || 0;

  const countResult = await query(
    `SELECT COUNT(*) as total FROM products p ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  params.push(effectiveLimit, effectiveOffset);
  const result = await query(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     ${whereClause}
     ORDER BY p.${sortField} ${sortDir}
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return {
    products: result.rows,
    pagination: {
      page: Math.floor(effectiveOffset / effectiveLimit) + 1,
      limit: effectiveLimit,
      total
    }
  };
}

async function getProduct(productId, tenantId) {
  const result = await query(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [productId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function getProductBySlug(slug, tenantId) {
  const result = await query(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.slug = $1 AND p.tenant_id = $2`,
    [slug, tenantId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function createProduct(tenantId, data) {
  const id = uuidv4();
  const slug = await ensureUniqueSlug(tenantId, generateSlug(data.name));

  const result = await query(
    `INSERT INTO products (
       id, tenant_id, category_id, name, slug, sku, description, short_description,
       price, compare_at_price, cost_price, tax_rate, currency, status,
       tags, images, metadata, weight, weight_unit, is_featured, is_digital,
       seo_title, seo_description
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21,
       $22, $23
     ) RETURNING *`,
    [
      id, tenantId, data.category_id || null, data.name, slug,
      data.sku || null, data.description || null, data.short_description || null,
      data.price, data.compare_at_price || null, data.cost_price || null,
      data.tax_rate || 0, data.currency || 'USD', data.status || 'draft',
      data.tags || [], JSON.stringify(data.images || []),
      JSON.stringify(data.metadata || {}), data.weight || null,
      data.weight_unit || 'kg', data.is_featured || false, data.is_digital || false,
      data.seo_title || null, data.seo_description || null
    ]
  );

  const product = result.rows[0];

  try {
    await publishEnvelope('ecommerce.product.created.v1', 1, {
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      category_id: product.category_id,
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* event publish failure is non-fatal */ }

  return product;
}

async function updateProduct(productId, tenantId, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const updatableFields = [
    'name', 'category_id', 'sku', 'description', 'short_description',
    'price', 'compare_at_price', 'cost_price', 'tax_rate', 'currency',
    'status', 'tags', 'metadata', 'weight', 'weight_unit',
    'is_featured', 'is_digital', 'seo_title', 'seo_description'
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      if (field === 'metadata' || field === 'images') {
        fields.push(`${field} = $${idx}::jsonb`);
        values.push(JSON.stringify(data[field]));
      } else {
        fields.push(`${field} = $${idx}`);
        values.push(data[field]);
      }
      idx += 1;
    }
  }

  if (data.images !== undefined) {
    fields.push(`images = $${idx}::jsonb`);
    values.push(JSON.stringify(data.images));
    idx += 1;
  }

  if (data.name !== undefined) {
    const slug = await ensureUniqueSlug(tenantId, generateSlug(data.name), productId);
    fields.push(`slug = $${idx}`);
    values.push(slug);
    idx += 1;
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push('updated_at = NOW()');
  values.push(productId, tenantId);

  const result = await query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return null;

  const updated = result.rows[0];
  try {
    await publishEnvelope('ecommerce.product.updated.v1', 1, {
      product_id: updated.id,
      name: updated.name,
      price: updated.price,
      status: updated.status,
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* event publish failure is non-fatal */ }

  return updated;
}

async function deleteProduct(productId, tenantId) {
  const result = await query(
    `UPDATE products SET status = 'archived', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [productId, tenantId]
  );

  if (result.rowCount > 0) {
    try {
      await publishEnvelope('ecommerce.product.deleted.v1', 1, {
        product_id: productId,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* event publish failure is non-fatal */ }
  }

  return result.rowCount > 0;
}

module.exports = {
  listProducts,
  getProduct,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  generateSlug,
  ensureUniqueSlug
};
