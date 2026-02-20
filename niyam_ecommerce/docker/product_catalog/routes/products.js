// Product routes

const express = require('express');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { productService } = require('../services');

const router = express.Router();

// Validation schemas
const ProductCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category_id: z.string().uuid().optional().nullable(),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  short_description: z.string().max(500).optional().nullable(),
  price: z.number().finite().min(0),
  compare_at_price: z.number().finite().min(0).optional().nullable(),
  cost_price: z.number().finite().min(0).optional().nullable(),
  tax_rate: z.number().finite().min(0).max(100).default(0),
  currency: z.string().length(3).default('USD'),
  status: z.enum(['draft', 'active', 'archived', 'out_of_stock']).default('draft'),
  tags: z.array(z.string()).default([]),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().optional(),
    primary: z.boolean().optional()
  })).default([]),
  metadata: z.record(z.any()).default({}),
  weight: z.number().finite().optional().nullable(),
  weight_unit: z.enum(['kg', 'g', 'lb', 'oz']).default('kg'),
  is_featured: z.boolean().default(false),
  is_digital: z.boolean().default(false),
  seo_title: z.string().max(255).optional().nullable(),
  seo_description: z.string().optional().nullable()
});

const ProductUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  category_id: z.string().uuid().optional().nullable(),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  short_description: z.string().max(500).optional().nullable(),
  price: z.number().finite().min(0).optional(),
  compare_at_price: z.number().finite().min(0).optional().nullable(),
  cost_price: z.number().finite().min(0).optional().nullable(),
  tax_rate: z.number().finite().min(0).max(100).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(['draft', 'active', 'archived', 'out_of_stock']).optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().optional(),
    primary: z.boolean().optional()
  })).optional(),
  metadata: z.record(z.any()).optional(),
  weight: z.number().finite().optional().nullable(),
  weight_unit: z.enum(['kg', 'g', 'lb', 'oz']).optional(),
  is_featured: z.boolean().optional(),
  is_digital: z.boolean().optional(),
  seo_title: z.string().max(255).optional().nullable(),
  seo_description: z.string().optional().nullable()
});

// List products with filtering, search, and pagination
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { search, category_id, status, tag, min_price, max_price, is_featured, limit, offset, sort_by, sort_order } = req.query;
    const result = await productService.listProducts(tenantId, {
      search, category_id, status, tag, min_price, max_price, is_featured,
      limit, offset, sort_by, sort_order
    });
    res.json({ success: true, data: result.products, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

// Get product by slug
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const product = await productService.getProductBySlug(req.params.slug, tenantId);
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

// Get single product
router.get('/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const product = await productService.getProduct(req.params.product_id, tenantId);
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

// Create product
router.post('/', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ProductCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const product = await productService.createProduct(tenantId, parsed.data);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Product with this SKU already exists' } });
    }
    next(error);
  }
});

// Update product
router.patch('/:product_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ProductUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const product = await productService.updateProduct(req.params.product_id, tenantId, parsed.data);
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Product with this SKU already exists' } });
    }
    next(error);
  }
});

// Delete product (soft delete - archive)
router.delete('/:product_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await productService.deleteProduct(req.params.product_id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }
    res.json({ success: true, data: { message: 'Product archived' } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
