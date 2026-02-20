// Category business logic service

const { query } = require('@vruksha/platform/db/postgres');
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
    let sql = 'SELECT id FROM categories WHERE tenant_id = $1 AND slug = $2';
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

async function listCategories(tenantId, { parent_id, is_active, include_children }) {
  const conditions = ['tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (parent_id === 'root' || parent_id === 'null') {
    conditions.push('parent_id IS NULL');
  } else if (parent_id) {
    conditions.push(`parent_id = $${idx}`);
    params.push(parent_id);
    idx += 1;
  }

  if (is_active != null) {
    conditions.push(`is_active = $${idx}`);
    params.push(is_active === 'true' || is_active === true);
    idx += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.tenant_id = c.tenant_id) as product_count,
       (SELECT COUNT(*) FROM categories sc WHERE sc.parent_id = c.id AND sc.tenant_id = c.tenant_id) as subcategory_count
     FROM categories c
     ${whereClause}
     ORDER BY c.sort_order ASC, c.name ASC`,
    params
  );

  if (include_children === 'true' || include_children === true) {
    const categories = result.rows;
    for (const cat of categories) {
      const children = await query(
        `SELECT * FROM categories WHERE tenant_id = $1 AND parent_id = $2 ORDER BY sort_order ASC, name ASC`,
        [tenantId, cat.id]
      );
      cat.children = children.rows;
    }
    return categories;
  }

  return result.rows;
}

async function getCategory(categoryId, tenantId) {
  const result = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.tenant_id = c.tenant_id) as product_count
     FROM categories c
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [categoryId, tenantId]
  );
  if (result.rows.length === 0) return null;

  // Fetch children
  const children = await query(
    `SELECT * FROM categories WHERE tenant_id = $1 AND parent_id = $2 ORDER BY sort_order ASC, name ASC`,
    [tenantId, categoryId]
  );
  const category = result.rows[0];
  category.children = children.rows;

  // Build breadcrumb path
  const breadcrumb = [];
  let current = category;
  while (current) {
    breadcrumb.unshift({ id: current.id, name: current.name, slug: current.slug });
    if (current.parent_id) {
      const parent = await query(
        'SELECT id, name, slug, parent_id FROM categories WHERE id = $1 AND tenant_id = $2',
        [current.parent_id, tenantId]
      );
      current = parent.rows[0] || null;
    } else {
      current = null;
    }
  }
  category.breadcrumb = breadcrumb;

  return category;
}

async function createCategory(tenantId, data) {
  const id = uuidv4();
  const slug = await ensureUniqueSlug(tenantId, generateSlug(data.name));

  const result = await query(
    `INSERT INTO categories (id, tenant_id, name, slug, description, parent_id, image_url, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id, tenantId, data.name, slug,
      data.description || null, data.parent_id || null,
      data.image_url || null, data.sort_order || 0,
      data.is_active !== undefined ? data.is_active : true
    ]
  );

  return result.rows[0];
}

async function updateCategory(categoryId, tenantId, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx}`);
    values.push(data.name);
    idx += 1;
    const slug = await ensureUniqueSlug(tenantId, generateSlug(data.name), categoryId);
    fields.push(`slug = $${idx}`);
    values.push(slug);
    idx += 1;
  }

  if (data.description !== undefined) {
    fields.push(`description = $${idx}`);
    values.push(data.description);
    idx += 1;
  }

  if (data.parent_id !== undefined) {
    // Prevent circular reference
    if (data.parent_id === categoryId) {
      return null;
    }
    fields.push(`parent_id = $${idx}`);
    values.push(data.parent_id || null);
    idx += 1;
  }

  if (data.image_url !== undefined) {
    fields.push(`image_url = $${idx}`);
    values.push(data.image_url);
    idx += 1;
  }

  if (data.sort_order !== undefined) {
    fields.push(`sort_order = $${idx}`);
    values.push(data.sort_order);
    idx += 1;
  }

  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx}`);
    values.push(data.is_active);
    idx += 1;
  }

  if (fields.length === 0) return null;

  fields.push('updated_at = NOW()');
  values.push(categoryId, tenantId);

  const result = await query(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function deleteCategory(categoryId, tenantId) {
  // Reassign children to parent of deleted category
  const cat = await query(
    'SELECT parent_id FROM categories WHERE id = $1 AND tenant_id = $2',
    [categoryId, tenantId]
  );
  if (cat.rows.length === 0) return false;

  await query(
    'UPDATE categories SET parent_id = $1, updated_at = NOW() WHERE parent_id = $2 AND tenant_id = $3',
    [cat.rows[0].parent_id, categoryId, tenantId]
  );

  // Unlink products from this category
  await query(
    'UPDATE products SET category_id = NULL, updated_at = NOW() WHERE category_id = $1 AND tenant_id = $2',
    [categoryId, tenantId]
  );

  const result = await query(
    'DELETE FROM categories WHERE id = $1 AND tenant_id = $2',
    [categoryId, tenantId]
  );

  return result.rowCount > 0;
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
};
