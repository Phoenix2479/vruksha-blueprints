// Health and status routes

const express = require('express');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { stockService } = require('../services');

const router = express.Router();

let started = Date.now();
let dbReady = false;

function setDbReady(ready) {
  dbReady = ready;
}

function setStarted(time) {
  started = time;
}

// Status endpoint
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    service: 'inventory_management',
    description: 'Stock tracking, multi-location, transfers, low stock alerts',
    ready: dbReady
  });
});

// Health check
router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'inventory_management' });
});

// Readiness check
router.get('/readyz', (req, res) => {
  res.json({
    status: dbReady ? 'ready' : 'not_ready',
    service: 'inventory_management',
    nats_kv: dbReady
  });
});

// Stats endpoint
router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'inventory_management',
    version: '1.0.0'
  });
});

// Dead stock analysis
router.get('/inventory/dead-stock', async (req, res, next) => {
  try {
    const dead_stock = await stockService.getDeadStock();
    res.json({ success: true, dead_stock });
  } catch (error) {
    next(error);
  }
});

// Create Bundle/Kit (placeholder)
router.post('/bundles', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Bundle creation pending database migration' });
  } catch (error) {
    next(error);
  }
});

// Map Bin Location (placeholder)
router.post('/inventory/map-bin', async (req, res, next) => {
  try {
    const { product_id, location_id, zone, bin } = req.body;
    await publishEnvelope('retail.inventory.bin_mapped.v1', 1, { product_id, location_id, zone, bin });
    res.json({ success: true, message: `Mapped product ${product_id} to ${zone}-${bin}` });
  } catch (error) {
    next(error);
  }
});

// Calculate Safety Stock (placeholder)
router.post('/inventory/calculate-safety-stock', async (req, res, next) => {
  try {
    res.json({ success: true, message: 'Safety stock calculation job started' });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  setDbReady,
  setStarted
};
