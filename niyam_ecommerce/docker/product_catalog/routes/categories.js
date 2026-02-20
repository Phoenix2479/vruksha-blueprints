// Category routes

const express = require('express');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { categoryService } = require('../services');

const router = express.Router();

// Validation schemas
const CategoryCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true)
});

const CategoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional()
});

// List categories (optionally hierarchical)
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { parent_id, is_active, include_children } = req.query;
    const categories = await categoryService.listCategories(tenantId, { parent_id, is_active, include_children });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

// Get single category with children and breadcrumb
router.get('/:category_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const category = await categoryService.getCategory(req.params.category_id, tenantId);
    if (!category) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
});

// Create category
router.post('/', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CategoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    // Verify parent exists if specified
    if (parsed.data.parent_id) {
      const parent = await categoryService.getCategory(parsed.data.parent_id, tenantId);
      if (!parent) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_PARENT', message: 'Parent category not found' } });
      }
    }

    const category = await categoryService.createCategory(tenantId, parsed.data);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Category with this slug already exists' } });
    }
    next(error);
  }
});

// Update category
router.patch('/:category_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CategoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const category = await categoryService.updateCategory(req.params.category_id, tenantId, parsed.data);
    if (!category) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
});

// Delete category
router.delete('/:category_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await categoryService.deleteCategory(req.params.category_id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    res.json({ success: true, data: { message: 'Category deleted' } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
