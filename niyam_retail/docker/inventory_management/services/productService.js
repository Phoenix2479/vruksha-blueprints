// Product business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { DEFAULT_STORE_ID } = require('../config/constants');
const { mapProductRow, getProductWithInventory } = require('../utils/productMapper');
const { ensureUniqueSku, generateSkuForProduct } = require('../utils/skuGenerator');

async function listProducts(tenantId, { search, low_stock, category }) {
  const conditions = [];
  const params = [DEFAULT_STORE_ID, tenantId];
  let idx = params.length + 1;

  conditions.push(`p.status = 'active' AND p.tenant_id = $2`);

  if (search) {
    conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  if (category) {
    conditions.push(`p.category = $${idx}`);
    params.push(category);
    idx += 1;
  }

  if (low_stock && String(low_stock).toLowerCase() === 'true') {
    conditions.push('(COALESCE(i.available_quantity, 0) <= COALESCE(i.reorder_point, 0))');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT
       p.*,
       COALESCE(i.quantity, 0) AS quantity,
       COALESCE(i.available_quantity, 0) AS available_quantity,
       i.reorder_point,
       i.reorder_quantity
     FROM products p
     LEFT JOIN inventory i
       ON p.id = i.product_id AND i.store_id = $1 AND i.tenant_id = $2
     ${whereClause}
     ORDER BY p.created_at DESC`,
    params
  );

  return result.rows.map(mapProductRow);
}

async function getProduct(productId, tenantId) {
  const row = await getProductWithInventory(productId, tenantId);
  if (!row) return null;
  return mapProductRow(row);
}

async function getProductByBarcode(barcode, tenantId) {
  const result = await query(
    `SELECT
       p.*,
       COALESCE(i.quantity, 0) AS quantity,
       COALESCE(i.available_quantity, 0) AS available_quantity,
       i.reorder_point,
       i.reorder_quantity
     FROM products p
     LEFT JOIN inventory i
       ON p.id = i.product_id AND i.store_id = $1 AND i.tenant_id = $2
     WHERE p.tenant_id = $2 
       AND p.status = 'active'
       AND (p.barcode = $3 OR p.sku = $3)
     LIMIT 1`,
    [DEFAULT_STORE_ID, tenantId, barcode]
  );

  if (result.rows.length === 0) return null;
  return mapProductRow(result.rows[0]);
}

async function createProduct(tenantId, data) {
  const client = await getClient();
  const { name, sku, category, description, unit_price, cost_price, tax_rate, reorder_point, reorder_quantity } = data;

  try {
    await client.query('BEGIN');

    let finalSku = sku;
    if (!finalSku || !finalSku.trim()) {
      finalSku = await generateSkuForProduct({ name, category, color: null, material: null, date: new Date() });
    } else {
      finalSku = await ensureUniqueSku(finalSku);
    }

    const productResult = await client.query(
      `INSERT INTO products (
         tenant_id, sku, barcode, name, description, category, unit_of_measure,
         cost, price, tax_rate, taxable, track_inventory, min_stock_level, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                 $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        tenantId,
        finalSku,
        finalSku,
        name,
        description || null,
        category || null,
        'ea',
        cost_price != null ? cost_price : null,
        unit_price,
        tax_rate,
        true,
        true,
        reorder_point != null ? reorder_point : 0,
        'active',
      ]
    );

    const product = productResult.rows[0];

    await client.query(
      `INSERT INTO inventory (
         tenant_id, product_id, sku, store_id, quantity, reserved_quantity,
         reorder_point, reorder_quantity
       ) VALUES ($1, $2, $3, $4, 0, 0, $5, $6)
       ON CONFLICT (product_id, store_id)
       DO UPDATE SET
         reorder_point = EXCLUDED.reorder_point,
         reorder_quantity = EXCLUDED.reorder_quantity,
         updated_at = NOW()`,
      [tenantId, product.id, product.sku, DEFAULT_STORE_ID, reorder_point != null ? reorder_point : 0, reorder_quantity != null ? reorder_quantity : 0]
    );

    await client.query('COMMIT');

    const fullRow = await getProductWithInventory(product.id, tenantId);

    await publishEnvelope('retail.inventory.product.created.v1', 1, {
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      store_id: DEFAULT_STORE_ID,
      timestamp: new Date().toISOString(),
    });

    return { success: true, product: mapProductRow(fullRow) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateProduct(productId, tenantId, data) {
  const client = await getClient();
  const { name, sku, category, description, unit_price, cost_price, tax_rate, reorder_point, reorder_quantity, is_active } = data;

  try {
    const productFields = [];
    const productValues = [];
    let idx = 1;

    if (name !== undefined) {
      productFields.push(`name = $${idx}`);
      productValues.push(name);
      idx += 1;
    }
    if (sku !== undefined) {
      productFields.push(`sku = $${idx}`);
      productValues.push(sku);
      idx += 1;
    }
    if (category !== undefined) {
      productFields.push(`category = $${idx}`);
      productValues.push(category);
      idx += 1;
    }
    if (description !== undefined) {
      productFields.push(`description = $${idx}`);
      productValues.push(description);
      idx += 1;
    }
    if (unit_price !== undefined) {
      productFields.push(`price = $${idx}`);
      productValues.push(unit_price);
      idx += 1;
    }
    if (cost_price !== undefined) {
      productFields.push(`cost = $${idx}`);
      productValues.push(cost_price);
      idx += 1;
    }
    if (tax_rate !== undefined) {
      productFields.push(`tax_rate = $${idx}`);
      productValues.push(tax_rate);
      idx += 1;
    }
    if (is_active !== undefined) {
      productFields.push(`status = $${idx}`);
      productValues.push(is_active ? 'active' : 'inactive');
      idx += 1;
    }

    await client.query('BEGIN');

    if (productFields.length > 0) {
      productValues.push(productId, tenantId);
      await client.query(
        `UPDATE products SET ${productFields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
        productValues
      );
    }

    if (reorder_point !== undefined || reorder_quantity !== undefined) {
      const invFields = [];
      const invValues = [];
      let invIdx = 1;

      if (reorder_point !== undefined) {
        invFields.push(`reorder_point = $${invIdx}`);
        invValues.push(reorder_point);
        invIdx += 1;
      }

      if (reorder_quantity !== undefined) {
        invFields.push(`reorder_quantity = $${invIdx}`);
        invValues.push(reorder_quantity);
        invIdx += 1;
      }

      if (invFields.length > 0) {
        invValues.push(productId, DEFAULT_STORE_ID, tenantId);
        const updateResult = await client.query(
          `UPDATE inventory
           SET ${invFields.join(', ')}, updated_at = NOW()
           WHERE product_id = $${invIdx} AND store_id = $${invIdx + 1} AND tenant_id = $${invIdx + 2}`,
          invValues
        );

        if (updateResult.rowCount === 0) {
          await client.query(
            `INSERT INTO inventory (
               tenant_id, product_id, sku, store_id, quantity, reserved_quantity,
               reorder_point, reorder_quantity
             )
             VALUES (
               $1,
               $2,
               (SELECT sku FROM products WHERE id = $2),
               $3,
               0,
               0,
               $4,
               $5
             )`,
            [
              tenantId,
              productId,
              DEFAULT_STORE_ID,
              reorder_point != null ? reorder_point : 0,
              reorder_quantity != null ? reorder_quantity : 0,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');

    const row = await getProductWithInventory(productId, tenantId);
    if (!row) {
      return { success: false, error: 'Product not found' };
    }

    await publishEnvelope('retail.inventory.product.updated.v1', 1, {
      product_id: productId,
      sku: row.sku,
      name: row.name,
      store_id: DEFAULT_STORE_ID,
      timestamp: new Date().toISOString(),
    });

    return { success: true, product: mapProductRow(row) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteProduct(productId, tenantId) {
  const result = await query(
    `UPDATE products
     SET status = 'inactive', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [productId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: 'Product not found' };
  }

  await publishEnvelope('retail.inventory.product.deleted.v1', 1, {
    product_id: productId,
    store_id: DEFAULT_STORE_ID,
    timestamp: new Date().toISOString(),
  });

  return { success: true };
}

async function uploadProductImages(productId, tenantId, images) {
  await query(
    'UPDATE products SET images = COALESCE(images, \'[]\'::jsonb) || $1::jsonb, updated_at = NOW() WHERE tenant_id = $2 AND id = $3',
    [JSON.stringify(images), tenantId, productId]
  );
  return { success: true, images };
}

module.exports = {
  listProducts,
  getProduct,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages
};
