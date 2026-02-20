// Product routes

const express = require('express');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { productService } = require('../services');
const { UPLOAD_DIR } = require('../services/importService');

const router = express.Router();
const imageUpload = multer({ dest: path.join(UPLOAD_DIR, 'product_images') });

// Validation schemas
const ProductCreateSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  unit_price: z.number().finite(),
  cost_price: z.number().finite().optional().nullable(),
  tax_rate: z.number().finite().default(0), // Default to 0% tax if not provided
  reorder_point: z.number().int().optional().nullable(),
  reorder_quantity: z.number().int().optional().nullable(),
});

const ProductUpdateSchema = z.object({
  name: z.string().optional(),
  sku: z.string().optional(),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  unit_price: z.number().optional(),
  cost_price: z.number().optional().nullable(),
  tax_rate: z.number().optional(),
  reorder_point: z.number().int().optional().nullable(),
  reorder_quantity: z.number().int().optional().nullable(),
  is_active: z.boolean().optional(),
});

// List products
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { search, low_stock, category } = req.query;
    const products = await productService.listProducts(tenantId, { search, low_stock, category });
    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
});

// Get product by barcode (for POS barcode scanner)
router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { barcode } = req.params;
    
    const product = await productService.getProductByBarcode(barcode, tenantId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found', barcode });
    }

    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
});

// Get single product
router.get('/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const product = await productService.getProduct(product_id, tenantId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true, product });
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
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const { name, unit_price } = parsed.data;
    if (!name || unit_price == null) {
      return res.status(400).json({ error: 'name and unit_price are required' });
    }

    const result = await productService.createProduct(tenantId, parsed.data);
    res.status(201).json(result);
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(400).json({ error: 'Product with this SKU already exists' });
    }
    next(error);
  }
});

// Update product
router.patch('/:product_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const parsed = ProductUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const result = await productService.updateProduct(product_id, tenantId, parsed.data);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(400).json({ error: 'Product with this SKU already exists' });
    }
    next(error);
  }
});

// Delete product (soft delete)
router.delete('/:product_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const result = await productService.deleteProduct(product_id, tenantId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Upload product images
router.post('/:product_id/images', requireAnyRole(['admin', 'manager']), imageUpload.array('images', 5), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const images = files.map((f, idx) => ({
      url: `/files/product_images/${path.basename(f.path)}`,
      alt: req.body.alt || null,
      primary: idx === 0
    }));

    const result = await productService.uploadProductImages(product_id, tenantId, images);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
