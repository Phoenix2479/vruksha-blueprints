// Review routes

const express = require('express');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { reviewService } = require('../services');

const router = express.Router();

// Validation schemas
const ReviewSubmitSchema = z.object({
  product_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  is_verified_purchase: z.boolean().default(false)
});

const ModerateSchema = z.object({
  status: z.enum(['approved', 'rejected'])
});

const RespondSchema = z.object({
  admin_response: z.string().min(1)
});

// Submit a review
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ReviewSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await reviewService.submitReview(tenantId, parsed.data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// List reviews by product with pagination
router.get('/products/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { status, page, limit } = req.query;
    const result = await reviewService.listByProduct(tenantId, product_id, { status, page, limit });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get aggregate ratings for a product
router.get('/products/:product_id/summary', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const summary = await reviewService.getProductSummary(tenantId, product_id);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

// Get review by ID
router.get('/:review_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { review_id } = req.params;
    const review = await reviewService.getReview(review_id, tenantId);

    if (!review) {
      return res.status(404).json({ success: false, error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' } });
    }

    res.json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

// Moderate review (approve/reject)
router.patch('/:review_id/moderate', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { review_id } = req.params;
    const parsed = ModerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await reviewService.moderateReview(review_id, tenantId, parsed.data.status);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Admin respond to a review
router.patch('/:review_id/respond', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { review_id } = req.params;
    const parsed = RespondSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await reviewService.respondToReview(review_id, tenantId, parsed.data.admin_response);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Mark review as helpful
router.post('/:review_id/helpful', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { review_id } = req.params;
    const result = await reviewService.markHelpful(review_id, tenantId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Report review
router.post('/:review_id/report', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { review_id } = req.params;
    const result = await reviewService.reportReview(review_id, tenantId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
