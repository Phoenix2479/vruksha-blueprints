// Product Catalog Service
// Browse/search products; categories, attributes, media (Phase 1 minimal)

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');
const { runMigrations } = require('./db/init');

// Route modules
const variantsRouter = require('./routes/variants');
const mediaRouter = require('./routes/media');

const app = express();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED=['http://localhost:3001','http://localhost:3003','http://localhost:3004','http://localhost:3005'];
const ALLOW_ALL=(process.env.ALLOW_ALL_CORS||'true').toLowerCase()==='true';
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST=ALLOWED_ORIGINS.length?ALLOWED_ORIGINS:DEFAULT_ALLOWED;
app.use(cors({ origin:(origin,cb)=>{ if(ALLOW_ALL||!origin||ORIGIN_ALLOWLIST.includes(origin)) return cb(null,true); return cb(new Error('CORS not allowed'), false); }, allowedHeaders:['Content-Type','Authorization','X-Tenant-ID'] }));

app.use(express.json());

const started = Date.now();
let kvReady = false;

// Initialize on startup
(async () => {
  try {
    await runMigrations();
    console.log('✅ Catalog: Database migrations completed');
    
    await kvStore.connect();
    kvReady = true;
    console.log('✅ Catalog: KV connected');
  } catch (e) {
    console.error('❌ Catalog: Initialization error', e.message);
  }
})();

// Observability
const registry=new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram=new promClient.Histogram({ name:'catalog_http_request_duration_seconds', help:'HTTP duration', labelNames:['method','route','status'], buckets:[0.005,0.01,0.05,0.1,0.5,1,2,5]});
registry.registerMetric(httpHistogram);
app.use((req,res,next)=>{ const s=process.hrtime.bigint(); res.on('finish',()=>{ const d=Number(process.hrtime.bigint()-s)/1e9; const route=req.route?.path||req.path; httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d); }); next(); });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

function getTenantId(req){ const t=req.headers['x-tenant-id']; return (typeof t==='string'&&t.trim())? t.trim(): DEFAULT_TENANT_ID; }
const SKIP_AUTH=(process.env.SKIP_AUTH||'true').toLowerCase()==='true';
const JWT_SECRET=process.env.JWT_SECRET||'dev_secret_change_me';
function authenticate(req,_res,next){ if(SKIP_AUTH) return next(); const hdr=req.headers.authorization||''; const token=hdr.startsWith('Bearer ')?hdr.slice(7):null; if(!token) return next(); try{ req.user=jwt.verify(token, JWT_SECRET, {algorithms:['HS256']}); }catch(_){} next(); }
app.use(authenticate);

// Validation Schemas
const BrowseQuery = z.object({ 
  search: z.string().optional(), 
  category: z.string().optional(), 
  category_id: z.string().uuid().optional(), 
  brand_id: z.string().uuid().optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  min_price: z.coerce.number().optional(),
  max_price: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort_by: z.enum(['name', 'price', 'created_at', 'updated_at', 'stock']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional()
});

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().optional(),
  category_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  compare_at_price: z.number().min(0).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  tax_class: z.string().optional(),
  barcode: z.string().optional(),
  weight: z.number().optional(),
  weight_unit: z.enum(['kg', 'g', 'lb', 'oz']).optional(),
  dimensions: z.object({
    length: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    unit: z.enum(['cm', 'in', 'm']).optional()
  }).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  track_inventory: z.boolean().optional(),
  stock_quantity: z.number().int().optional(),
  low_stock_threshold: z.number().int().optional(),
  allow_backorder: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional()
});

const UpdateProductSchema = CreateProductSchema.partial();

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  parent_id: z.string().uuid().optional().nullable(),
  image_url: z.string().url().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional()
});

const UpdateCategorySchema = CreateCategorySchema.partial();

const CreateBrandSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  is_active: z.boolean().optional()
});

const UpdateBrandSchema = CreateBrandSchema.partial();

// Endpoints
app.get('/status', (req,res)=> res.json({ success:true, service:'product_catalog', ready: kvReady }));

// ============================================
// PRODUCTS CRUD
// ============================================

// List products with advanced filtering
app.get('/products', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const q = BrowseQuery.parse(req.query);
    
    let sql = `SELECT p.id, p.sku, p.name, p.description, p.category, p.price, p.cost,
                      p.compare_at_price, p.tax_rate, p.barcode, p.weight, p.status, 
                      p.track_inventory, p.stock_quantity, p.low_stock_threshold,
                      p.is_featured, p.created_at, p.updated_at,
                      c.name as category_name, b.name as brand_name,
                      (SELECT url FROM product_media pm WHERE pm.product_id = p.id AND pm.is_primary = true LIMIT 1) as image_url
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               LEFT JOIN brands b ON p.brand_id = b.id
               WHERE p.tenant_id = $1`;
    const params = [tenantId];
    let paramIdx = 2;

    if (q.category_id) {
      sql += ` AND (p.category_id = $${paramIdx} OR EXISTS (
        SELECT 1 FROM product_category_links pcl WHERE pcl.product_id = p.id AND pcl.category_id = $${paramIdx}
      ))`;
      params.push(q.category_id);
      paramIdx++;
    }
    if (q.brand_id) {
      sql += ` AND p.brand_id = $${paramIdx}`;
      params.push(q.brand_id);
      paramIdx++;
    }
    if (q.search) {
      sql += ` AND (LOWER(p.name) LIKE $${paramIdx} OR LOWER(p.sku) LIKE $${paramIdx} OR LOWER(p.barcode) LIKE $${paramIdx})`;
      params.push(`%${q.search.toLowerCase()}%`);
      paramIdx++;
    }
    if (q.category) {
      sql += ` AND p.category = $${paramIdx}`;
      params.push(q.category);
      paramIdx++;
    }
    if (q.status) {
      sql += ` AND p.status = $${paramIdx}`;
      params.push(q.status);
      paramIdx++;
    }
    if (q.min_price !== undefined) {
      sql += ` AND p.price >= $${paramIdx}`;
      params.push(q.min_price);
      paramIdx++;
    }
    if (q.max_price !== undefined) {
      sql += ` AND p.price <= $${paramIdx}`;
      params.push(q.max_price);
      paramIdx++;
    }

    // Sorting
    const sortColumn = {
      name: 'p.name',
      price: 'p.price',
      created_at: 'p.created_at',
      updated_at: 'p.updated_at',
      stock: 'p.stock_quantity'
    }[q.sort_by] || 'p.created_at';
    const sortOrder = q.sort_order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${sortOrder}`;

    // Pagination
    const limit = q.limit || 50;
    const offset = q.offset || 0;
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const result = await query(sql, params);

    // Get total count for pagination
    let countSql = `SELECT COUNT(*) FROM products p WHERE p.tenant_id = $1`;
    const countParams = [tenantId];
    // Note: simplified count - in production you'd mirror the WHERE clauses
    const countResult = await query(countSql, countParams);

    res.json({ 
      success: true, 
      products: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
        hasMore: offset + result.rows.length < parseInt(countResult.rows[0].count)
      }
    });
  } catch (e) { 
    next(e); 
  }
});

// Get single product with full details
app.get('/products/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await query(
      `SELECT p.*, 
              c.name as category_name,
              b.name as brand_name,
              (SELECT json_agg(pm.*) FROM product_media pm WHERE pm.product_id = p.id) as media,
              (SELECT json_agg(pv.*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true) as variants,
              (SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name, 'slug', pt.slug)) 
               FROM product_tags pt 
               JOIN product_tag_links ptl ON pt.id = ptl.tag_id 
               WHERE ptl.product_id = p.id) as tags
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true, product: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Create product
app.post('/products', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateProductSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const data = parsed.data;

    // Check SKU uniqueness
    const existing = await query(
      'SELECT id FROM products WHERE tenant_id = $1 AND sku = $2',
      [tenantId, data.sku]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'SKU already exists' });
    }

    const result = await query(
      `INSERT INTO products (
        tenant_id, sku, name, description, category, category_id, brand_id,
        price, cost, compare_at_price, tax_rate, tax_class, barcode,
        weight, weight_unit, dimensions, status, track_inventory,
        stock_quantity, low_stock_threshold, allow_backorder, is_featured,
        meta_title, meta_description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
      ) RETURNING *`,
      [
        tenantId, data.sku, data.name, data.description, data.category,
        data.category_id, data.brand_id, data.price, data.cost,
        data.compare_at_price, data.tax_rate || 0, data.tax_class, data.barcode,
        data.weight, data.weight_unit, data.dimensions ? JSON.stringify(data.dimensions) : null,
        data.status || 'active', data.track_inventory !== false,
        data.stock_quantity || 0, data.low_stock_threshold || 10,
        data.allow_backorder || false, data.is_featured || false,
        data.meta_title, data.meta_description
      ]
    );

    const product = result.rows[0];

    // Handle tags
    if (data.tags && data.tags.length > 0) {
      for (const tagName of data.tags) {
        // Find or create tag
        let tagResult = await query(
          'SELECT id FROM product_tags WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
          [tenantId, tagName]
        );
        
        let tagId;
        if (tagResult.rows.length === 0) {
          const slug = tagName.toLowerCase().replace(/\s+/g, '-');
          tagResult = await query(
            'INSERT INTO product_tags (tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id',
            [tenantId, tagName, slug]
          );
          tagId = tagResult.rows[0].id;
        } else {
          tagId = tagResult.rows[0].id;
        }
        
        await query(
          'INSERT INTO product_tag_links (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [product.id, tagId]
        );
      }
    }

    // Publish event
    try {
      await publishEnvelope('catalog.product.created', { productId: product.id, tenantId });
    } catch (pubErr) {
      console.warn('Failed to publish product created event:', pubErr.message);
    }

    res.status(201).json({ success: true, product });
  } catch (e) { 
    next(e); 
  }
});

// Update product
app.patch('/products/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const parsed = UpdateProductSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const data = parsed.data;

    // Check if product exists
    const existing = await query(
      'SELECT * FROM products WHERE tenant_id = $1 AND id = $2',
      [tenantId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check SKU uniqueness if changing
    if (data.sku && data.sku !== existing.rows[0].sku) {
      const skuCheck = await query(
        'SELECT id FROM products WHERE tenant_id = $1 AND sku = $2 AND id != $3',
        [tenantId, data.sku, id]
      );
      if (skuCheck.rows.length > 0) {
        return res.status(409).json({ error: 'SKU already exists' });
      }
    }

    // Build dynamic update
    const updates = [];
    const params = [id, tenantId];
    let idx = 3;

    const fields = [
      'sku', 'name', 'description', 'category', 'category_id', 'brand_id',
      'price', 'cost', 'compare_at_price', 'tax_rate', 'tax_class', 'barcode',
      'weight', 'weight_unit', 'status', 'track_inventory', 'stock_quantity',
      'low_stock_threshold', 'allow_backorder', 'is_featured', 'meta_title', 'meta_description'
    ];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(data[field]);
      }
    }

    if (data.dimensions !== undefined) {
      updates.push(`dimensions = $${idx++}`);
      params.push(JSON.stringify(data.dimensions));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );

    // Handle tags update
    if (data.tags !== undefined) {
      // Remove existing tags
      await query('DELETE FROM product_tag_links WHERE product_id = $1', [id]);
      
      // Add new tags
      for (const tagName of data.tags) {
        let tagResult = await query(
          'SELECT id FROM product_tags WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
          [tenantId, tagName]
        );
        
        let tagId;
        if (tagResult.rows.length === 0) {
          const slug = tagName.toLowerCase().replace(/\s+/g, '-');
          tagResult = await query(
            'INSERT INTO product_tags (tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id',
            [tenantId, tagName, slug]
          );
          tagId = tagResult.rows[0].id;
        } else {
          tagId = tagResult.rows[0].id;
        }
        
        await query(
          'INSERT INTO product_tag_links (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, tagId]
        );
      }
    }

    // Publish event
    try {
      await publishEnvelope('catalog.product.updated', { productId: id, tenantId, changes: Object.keys(data) });
    } catch (pubErr) {
      console.warn('Failed to publish product updated event:', pubErr.message);
    }

    res.json({ success: true, product: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Delete product (soft delete by setting status to archived)
app.delete('/products/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { hard } = req.query; // ?hard=true for permanent delete

    if (hard === 'true') {
      // Hard delete - removes product and all related data
      const result = await query(
        'DELETE FROM products WHERE tenant_id = $1 AND id = $2 RETURNING id, name',
        [tenantId, id]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json({ success: true, message: 'Product permanently deleted', product: result.rows[0] });
    } else {
      // Soft delete - archive the product
      const result = await query(
        `UPDATE products SET status = 'archived', updated_at = NOW() 
         WHERE tenant_id = $1 AND id = $2 RETURNING id, name`,
        [tenantId, id]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json({ success: true, message: 'Product archived', product: result.rows[0] });
    }

    // Publish event
    try {
      await publishEnvelope('catalog.product.deleted', { productId: id, tenantId, hard: hard === 'true' });
    } catch (pubErr) {
      console.warn('Failed to publish product deleted event:', pubErr.message);
    }
  } catch (e) { 
    next(e); 
  }
});

// Bulk operations
app.post('/products/bulk/update-status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_ids, status } = req.body;

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids must be a non-empty array' });
    }
    if (!['active', 'draft', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE products SET status = $1, updated_at = NOW() 
       WHERE tenant_id = $2 AND id = ANY($3::uuid[]) RETURNING id`,
      [status, tenantId, product_ids]
    );

    res.json({ success: true, updated: result.rowCount });
  } catch (e) { 
    next(e); 
  }
});

app.post('/products/bulk/delete', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_ids, hard } = req.body;

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids must be a non-empty array' });
    }

    if (hard) {
      const result = await query(
        'DELETE FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[]) RETURNING id',
        [tenantId, product_ids]
      );
      res.json({ success: true, deleted: result.rowCount });
    } else {
      const result = await query(
        `UPDATE products SET status = 'archived', updated_at = NOW() 
         WHERE tenant_id = $1 AND id = ANY($2::uuid[]) RETURNING id`,
        [tenantId, product_ids]
      );
      res.json({ success: true, archived: result.rowCount });
    }
  } catch (e) { 
    next(e); 
  }
});

// ============================================
// CATEGORIES CRUD
// ============================================

// List categories with hierarchy
app.get('/categories', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { flat, parent_id } = req.query;

    let sql = `SELECT c.*, 
                      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
                      (SELECT COUNT(*) FROM categories sub WHERE sub.parent_id = c.id) as subcategory_count
               FROM categories c 
               WHERE c.tenant_id = $1`;
    const params = [tenantId];

    if (parent_id) {
      sql += ` AND c.parent_id = $2`;
      params.push(parent_id);
    } else if (flat !== 'true') {
      sql += ` AND c.parent_id IS NULL`; // Only root categories
    }

    sql += ` ORDER BY c.sort_order ASC, c.name ASC`;

    const result = await query(sql, params);

    // If not flat, build hierarchy
    if (flat !== 'true' && !parent_id) {
      const categories = result.rows;
      
      // Get all children
      const allCategories = await query(
        `SELECT c.*, 
                (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
         FROM categories c WHERE c.tenant_id = $1 ORDER BY c.sort_order ASC, c.name ASC`,
        [tenantId]
      );

      // Build tree
      const buildTree = (parentId) => {
        return allCategories.rows
          .filter(c => c.parent_id === parentId)
          .map(c => ({
            ...c,
            children: buildTree(c.id)
          }));
      };

      const tree = buildTree(null);
      return res.json({ success: true, categories: tree });
    }

    res.json({ success: true, categories: result.rows });
  } catch (e) { 
    next(e); 
  }
});

// Get single category
app.get('/categories/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await query(
      `SELECT c.*, 
              p.name as parent_name,
              (SELECT COUNT(*) FROM products pr WHERE pr.category_id = c.id) as product_count,
              (SELECT json_agg(sub.*) FROM categories sub WHERE sub.parent_id = c.id) as subcategories
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true, category: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Create category
app.post('/categories', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateCategorySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const data = parsed.data;

    // Calculate level and path
    let level = 0;
    let path = '';
    
    if (data.parent_id) {
      const parent = await query(
        'SELECT level, path, name FROM categories WHERE tenant_id = $1 AND id = $2',
        [tenantId, data.parent_id]
      );
      if (parent.rows.length === 0) {
        return res.status(400).json({ error: 'Parent category not found' });
      }
      level = (parent.rows[0].level || 0) + 1;
      path = `${parent.rows[0].path || ''}/${parent.rows[0].name}`;
    }

    const result = await query(
      `INSERT INTO categories (tenant_id, name, description, parent_id, level, path, image_url, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, data.name, data.description, data.parent_id, level, path, data.image_url, data.sort_order || 0, data.is_active !== false]
    );

    res.status(201).json({ success: true, category: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Update category
app.patch('/categories/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const parsed = UpdateCategorySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const data = parsed.data;

    // Check if category exists
    const existing = await query(
      'SELECT * FROM categories WHERE tenant_id = $1 AND id = $2',
      [tenantId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Build update
    const updates = [];
    const params = [id, tenantId];
    let idx = 3;

    if (data.name !== undefined) { updates.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = $${idx++}`); params.push(data.description); }
    if (data.parent_id !== undefined) { 
      updates.push(`parent_id = $${idx++}`); 
      params.push(data.parent_id);
      // Recalculate level and path
      if (data.parent_id) {
        const parent = await query('SELECT level, path, name FROM categories WHERE id = $1', [data.parent_id]);
        if (parent.rows.length > 0) {
          updates.push(`level = $${idx++}`);
          params.push((parent.rows[0].level || 0) + 1);
          updates.push(`path = $${idx++}`);
          params.push(`${parent.rows[0].path || ''}/${parent.rows[0].name}`);
        }
      } else {
        updates.push(`level = 0`);
        updates.push(`path = ''`);
      }
    }
    if (data.image_url !== undefined) { updates.push(`image_url = $${idx++}`); params.push(data.image_url); }
    if (data.sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(data.sort_order); }
    if (data.is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(data.is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );

    res.json({ success: true, category: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Delete category
app.delete('/categories/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { reassign_to } = req.query; // Reassign products to another category

    // Check for subcategories
    const subs = await query(
      'SELECT COUNT(*) FROM categories WHERE tenant_id = $1 AND parent_id = $2',
      [tenantId, id]
    );
    if (parseInt(subs.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category with subcategories. Delete or move subcategories first.' });
    }

    // Reassign products if specified
    if (reassign_to) {
      await query(
        'UPDATE products SET category_id = $1 WHERE tenant_id = $2 AND category_id = $3',
        [reassign_to, tenantId, id]
      );
    } else {
      // Set products to no category
      await query(
        'UPDATE products SET category_id = NULL WHERE tenant_id = $1 AND category_id = $2',
        [tenantId, id]
      );
    }

    const result = await query(
      'DELETE FROM categories WHERE tenant_id = $1 AND id = $2 RETURNING id, name',
      [tenantId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted', category: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// ============================================
// BRANDS CRUD
// ============================================

// List brands
app.get('/brands', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { search, active_only } = req.query;

    let sql = `SELECT b.*, 
                      (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) as product_count
               FROM brands b 
               WHERE b.tenant_id = $1`;
    const params = [tenantId];
    let idx = 2;

    if (search) {
      sql += ` AND (LOWER(b.name) LIKE $${idx} OR LOWER(b.slug) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }
    if (active_only === 'true') {
      sql += ` AND b.is_active = true`;
    }

    sql += ` ORDER BY b.name ASC`;

    const result = await query(sql, params);
    res.json({ success: true, brands: result.rows });
  } catch (e) { 
    next(e); 
  }
});

// Get single brand
app.get('/brands/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await query(
      `SELECT b.*, 
              (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) as product_count
       FROM brands b
       WHERE b.tenant_id = $1 AND b.id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ success: true, brand: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Create brand
app.post('/brands', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateBrandSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const data = parsed.data;
    const slug = data.slug || data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check slug uniqueness
    const existing = await query(
      'SELECT id FROM brands WHERE tenant_id = $1 AND slug = $2',
      [tenantId, slug]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Brand slug already exists' });
    }

    const result = await query(
      `INSERT INTO brands (tenant_id, name, slug, description, logo_url, website_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, data.name, slug, data.description, data.logo_url, data.website_url, data.is_active !== false]
    );

    res.status(201).json({ success: true, brand: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Update brand
app.patch('/brands/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const parsed = UpdateBrandSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const data = parsed.data;

    // Build update
    const updates = [];
    const params = [id, tenantId];
    let idx = 3;

    if (data.name !== undefined) { updates.push(`name = $${idx++}`); params.push(data.name); }
    if (data.slug !== undefined) { 
      // Check slug uniqueness
      const slugCheck = await query(
        'SELECT id FROM brands WHERE tenant_id = $1 AND slug = $2 AND id != $3',
        [tenantId, data.slug, id]
      );
      if (slugCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Brand slug already exists' });
      }
      updates.push(`slug = $${idx++}`); 
      params.push(data.slug); 
    }
    if (data.description !== undefined) { updates.push(`description = $${idx++}`); params.push(data.description); }
    if (data.logo_url !== undefined) { updates.push(`logo_url = $${idx++}`); params.push(data.logo_url); }
    if (data.website_url !== undefined) { updates.push(`website_url = $${idx++}`); params.push(data.website_url); }
    if (data.is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(data.is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE brands SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ success: true, brand: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Delete brand
app.delete('/brands/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Remove brand from products
    await query(
      'UPDATE products SET brand_id = NULL WHERE tenant_id = $1 AND brand_id = $2',
      [tenantId, id]
    );

    const result = await query(
      'DELETE FROM brands WHERE tenant_id = $1 AND id = $2 RETURNING id, name',
      [tenantId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ success: true, message: 'Brand deleted', brand: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// ============================================
// SEARCH & FILTERS
// ============================================

// Get filter options for products
app.get('/filters', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const [categories, brands, priceRange, attributes] = await Promise.all([
      query(
        `SELECT c.id, c.name, COUNT(p.id) as count 
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
         WHERE c.tenant_id = $1 AND c.is_active = true
         GROUP BY c.id, c.name
         ORDER BY c.name`,
        [tenantId]
      ),
      query(
        `SELECT b.id, b.name, COUNT(p.id) as count
         FROM brands b
         LEFT JOIN products p ON p.brand_id = b.id AND p.status = 'active'
         WHERE b.tenant_id = $1 AND b.is_active = true
         GROUP BY b.id, b.name
         ORDER BY b.name`,
        [tenantId]
      ),
      query(
        `SELECT MIN(price) as min_price, MAX(price) as max_price
         FROM products WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId]
      ),
      query(
        `SELECT pa.id, pa.name, pa.code, pa.attribute_type, pa.options
         FROM product_attributes pa
         WHERE pa.tenant_id = $1 AND pa.is_filterable = true
         ORDER BY pa.sort_order, pa.name`,
        [tenantId]
      )
    ]);

    res.json({
      success: true,
      filters: {
        categories: categories.rows,
        brands: brands.rows,
        priceRange: priceRange.rows[0] || { min_price: 0, max_price: 0 },
        attributes: attributes.rows
      }
    });
  } catch (e) { 
    next(e); 
  }
});

// Full-text search
app.get('/search', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = q.toLowerCase();

    const result = await query(
      `SELECT p.id, p.sku, p.name, p.price, p.status,
              (SELECT url FROM product_media pm WHERE pm.product_id = p.id AND pm.is_primary = true LIMIT 1) as image_url,
              c.name as category_name,
              b.name as brand_name,
              ts_rank(
                to_tsvector('english', p.name || ' ' || COALESCE(p.description, '') || ' ' || p.sku),
                plainto_tsquery('english', $2)
              ) as rank
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.tenant_id = $1 
         AND p.status = 'active'
         AND (
           LOWER(p.name) LIKE $3 
           OR LOWER(p.sku) LIKE $3 
           OR LOWER(p.barcode) = $4
           OR to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $2)
         )
       ORDER BY rank DESC, p.name ASC
       LIMIT $5`,
      [tenantId, q, `%${searchTerm}%`, searchTerm, parseInt(limit)]
    );

    res.json({ success: true, products: result.rows });
  } catch (e) { 
    next(e); 
  }
});

// Get product by barcode
app.get('/products/barcode/:barcode', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { barcode } = req.params;

    // Check product barcode first
    let result = await query(
      `SELECT p.*, c.name as category_name, b.name as brand_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.tenant_id = $1 AND p.barcode = $2`,
      [tenantId, barcode]
    );

    if (result.rows.length === 0) {
      // Check variant barcode
      result = await query(
        `SELECT pv.*, p.name as product_name, p.category, c.name as category_name
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE pv.tenant_id = $1 AND pv.barcode = $2`,
        [tenantId, barcode]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found for barcode' });
      }
      
      return res.json({ success: true, variant: result.rows[0] });
    }

    res.json({ success: true, product: result.rows[0] });
  } catch (e) { 
    next(e); 
  }
});

// Extended routes
app.use('/variants', variantsRouter);
app.use('/media', mediaRouter);

// Errors & Health
app.use((err, req, res, next) => { console.error('[Catalog] Error:', err); res.status(err.status||500).json({ error: err.message || 'Internal server error' }); });
app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'product_catalog' }));
app.get('/readyz', (req,res)=> res.json({ status: kvReady?'ready':'not_ready', service:'product_catalog' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));

const PORT = process.env.PORT || 8831;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, ()=> console.log('Product Catalog service listening on', PORT));
