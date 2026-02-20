// Shipment routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { shipmentService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateShipmentSchema = z.object({
  order_id: z.string().uuid(),
  carrier_id: z.string().uuid().optional(),
  tracking_number: z.string().optional(),
  label_url: z.string().url().optional(),
  estimated_delivery: z.string().datetime().optional(),
  cost: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.object({
    length: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    unit: z.string().optional()
  }).optional(),
  origin_location: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const UpdateShipmentStatusSchema = z.object({
  status: z.enum(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled'])
});

// List shipments
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { order_id, carrier_id, status, limit, offset } = req.query;
    const shipments = await shipmentService.listShipments(tenantId, { order_id, carrier_id, status, limit, offset });
    res.json({ success: true, data: shipments });
  } catch (error) {
    next(error);
  }
});

// Get shipment by ID
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const shipment = await shipmentService.getShipment(tenantId, req.params.id);
    if (!shipment) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });
    }
    res.json({ success: true, data: shipment });
  } catch (error) {
    next(error);
  }
});

// Create shipment from order
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateShipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const shipment = await shipmentService.createShipment(tenantId, parsed.data);
    res.status(201).json({ success: true, data: shipment });
  } catch (error) {
    next(error);
  }
});

// Update shipment status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateShipmentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await shipmentService.updateShipmentStatus(tenantId, req.params.id, parsed.data.status);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'STATUS_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result.shipment });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
