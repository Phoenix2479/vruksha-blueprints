// Warehouse Management Routes
// Locations, Transfers, Stock Counts, GRN

const express = require('express');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { getTenantId, requireAnyRole } = require('../middleware');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { DEFAULT_STORE_ID } = require('../config/constants');

const router = express.Router();

// ============================================
// WAREHOUSE LOCATIONS
// ============================================

// List locations
router.get('/locations', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id, zone, type, active_only } = req.query;
    
    let conditions = ['l.tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (store_id) {
      conditions.push(`l.store_id = $${idx++}`);
      params.push(store_id);
    }
    if (zone) {
      conditions.push(`l.zone = $${idx++}`);
      params.push(zone);
    }
    if (type) {
      conditions.push(`l.type = $${idx++}`);
      params.push(type);
    }
    if (active_only === 'true') {
      conditions.push('l.is_active = true');
    }

    const result = await query(`
      SELECT l.*, 
             p.name as parent_name,
             (SELECT COUNT(*) FROM inventory_locations il WHERE il.location_id = l.id) as item_count
      FROM warehouse_locations l
      LEFT JOIN warehouse_locations p ON l.parent_id = p.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.zone, l.aisle, l.shelf, l.bin
    `, params);

    res.json({ success: true, locations: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create location
router.post('/locations', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { code, name, zone, aisle, shelf, bin, type, capacity, parent_id, is_pickable, is_receivable } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'code and name are required' });
    }

    const result = await query(`
      INSERT INTO warehouse_locations 
        (tenant_id, store_id, code, name, zone, aisle, shelf, bin, type, capacity, parent_id, is_pickable, is_receivable)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [tenantId, DEFAULT_STORE_ID, code, name, zone, aisle, shelf, bin, type || 'shelf', capacity || 0, parent_id, is_pickable !== false, is_receivable !== false]);

    res.status(201).json({ success: true, location: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Location code already exists' });
    }
    next(error);
  }
});

// Get location contents
router.get('/locations/:location_id/contents', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { location_id } = req.params;

    const locationResult = await query(`
      SELECT * FROM warehouse_locations WHERE id = $1 AND tenant_id = $2
    `, [location_id, tenantId]);

    if (locationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const itemsResult = await query(`
      SELECT il.*, p.name as product_name, p.sku, p.price
      FROM inventory_locations il
      JOIN products p ON il.product_id = p.id
      WHERE il.location_id = $1 AND il.tenant_id = $2
      ORDER BY p.name
    `, [location_id, tenantId]);

    const location = locationResult.rows[0];
    const used = itemsResult.rows.reduce((sum, i) => sum + i.quantity, 0);

    res.json({
      success: true,
      location_id,
      location_code: location.code,
      items: itemsResult.rows,
      capacity: location.capacity,
      used,
      available: location.capacity - used
    });
  } catch (error) {
    next(error);
  }
});

// Move stock between locations
router.post('/locations/move', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { product_id, from_location_id, to_location_id, quantity, moved_by } = req.body;

    if (!product_id || !from_location_id || !to_location_id || !quantity) {
      return res.status(400).json({ error: 'product_id, from_location_id, to_location_id, and quantity are required' });
    }

    await client.query('BEGIN');

    // Check source has enough stock
    const sourceResult = await client.query(`
      SELECT quantity FROM inventory_locations
      WHERE product_id = $1 AND location_id = $2 AND tenant_id = $3
    `, [product_id, from_location_id, tenantId]);

    if (sourceResult.rows.length === 0 || sourceResult.rows[0].quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient stock at source location' });
    }

    // Deduct from source
    await client.query(`
      UPDATE inventory_locations SET quantity = quantity - $1, updated_at = NOW()
      WHERE product_id = $2 AND location_id = $3 AND tenant_id = $4
    `, [quantity, product_id, from_location_id, tenantId]);

    // Add to destination (upsert)
    await client.query(`
      INSERT INTO inventory_locations (tenant_id, product_id, location_id, quantity)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (product_id, location_id) DO UPDATE SET
        quantity = inventory_locations.quantity + $4,
        updated_at = NOW()
    `, [tenantId, product_id, to_location_id, quantity]);

    // Log the movement
    await client.query(`
      INSERT INTO inventory_audit_log 
        (tenant_id, product_id, location_id, action, quantity_change, reference_type, performed_by, reason)
      VALUES 
        ($1, $2, $3, 'transfer_out', $4, 'location_move', $5, $6),
        ($1, $2, $7, 'transfer_in', $8, 'location_move', $5, $6)
    `, [tenantId, product_id, from_location_id, -quantity, moved_by, 'Internal location move', to_location_id, quantity]);

    await client.query('COMMIT');

    res.json({
      success: true,
      move_id: `MOV-${Date.now()}`,
      product_id,
      from_location_id,
      to_location_id,
      quantity,
      moved_at: new Date().toISOString()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// STOCK TRANSFERS
// ============================================

// Create transfer
router.post('/transfers', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { from_store_id, from_location_id, to_store_id, to_location_id, items, reason, priority, requested_by } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'items are required' });
    }

    await client.query('BEGIN');

    // Generate transfer number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await client.query(`
      SELECT COUNT(*) FROM stock_transfers WHERE tenant_id = $1 AND transfer_number LIKE $2
    `, [tenantId, `TRF-${dateStr}%`]);
    const seq = parseInt(countResult.rows[0].count) + 1;
    const transferNumber = `TRF-${dateStr}-${String(seq).padStart(3, '0')}`;

    // Create transfer
    const transferResult = await client.query(`
      INSERT INTO stock_transfers 
        (tenant_id, transfer_number, from_store_id, from_location_id, to_store_id, to_location_id, reason, priority, requested_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [tenantId, transferNumber, from_store_id || DEFAULT_STORE_ID, from_location_id, to_store_id || DEFAULT_STORE_ID, to_location_id, reason, priority || 'normal', requested_by]);

    const transfer = transferResult.rows[0];

    // Add items
    for (const item of items) {
      await client.query(`
        INSERT INTO stock_transfer_items 
          (transfer_id, product_id, requested_quantity, batch_id, serial_numbers)
        VALUES ($1, $2, $3, $4, $5)
      `, [transfer.id, item.product_id, item.quantity, item.batch_id, item.serial_numbers]);
    }

    await client.query('COMMIT');

    await publishEnvelope('retail.inventory.transfer.created.v1', 1, {
      transfer_id: transfer.id,
      transfer_number: transferNumber,
      tenant_id: tenantId,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      transfer_id: transfer.id,
      transfer_number: transferNumber,
      status: 'pending',
      items_count: items.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// List transfers
router.get('/transfers', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, from_store, to_store, from_date, to_date, limit = 50 } = req.query;

    let conditions = ['t.tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (from_store) {
      conditions.push(`t.from_store_id = $${idx++}`);
      params.push(from_store);
    }
    if (to_store) {
      conditions.push(`t.to_store_id = $${idx++}`);
      params.push(to_store);
    }
    if (from_date) {
      conditions.push(`t.created_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`t.created_at <= $${idx++}`);
      params.push(to_date);
    }

    params.push(parseInt(limit));

    const result = await query(`
      SELECT t.*, 
             (SELECT COUNT(*) FROM stock_transfer_items WHERE transfer_id = t.id) as items_count,
             (SELECT SUM(requested_quantity) FROM stock_transfer_items WHERE transfer_id = t.id) as total_units
      FROM stock_transfers t
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
      LIMIT $${idx}
    `, params);

    res.json({ success: true, transfers: result.rows, total: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Get transfer details
router.get('/transfers/:transfer_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { transfer_id } = req.params;

    const transferResult = await query(`
      SELECT * FROM stock_transfers WHERE id = $1 AND tenant_id = $2
    `, [transfer_id, tenantId]);

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const itemsResult = await query(`
      SELECT ti.*, p.name as product_name, p.sku
      FROM stock_transfer_items ti
      JOIN products p ON ti.product_id = p.id
      WHERE ti.transfer_id = $1
    `, [transfer_id]);

    res.json({
      success: true,
      ...transferResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Approve transfer
router.post('/transfers/:transfer_id/approve', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { transfer_id } = req.params;
    const { approved_by } = req.body;

    const result = await query(`
      UPDATE stock_transfers 
      SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3 AND status = 'pending'
      RETURNING *
    `, [approved_by, transfer_id, tenantId]);

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Transfer not found or already processed' });
    }

    res.json({ success: true, transfer_id, status: 'approved', approved_at: result.rows[0].approved_at });
  } catch (error) {
    next(error);
  }
});

// Ship transfer
router.post('/transfers/:transfer_id/ship', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { transfer_id } = req.params;
    const { shipped_by, tracking_number, shipped_quantities } = req.body;

    await client.query('BEGIN');

    // Get transfer
    const transferResult = await client.query(`
      SELECT * FROM stock_transfers WHERE id = $1 AND tenant_id = $2 AND status = 'approved'
    `, [transfer_id, tenantId]);

    if (transferResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer not found or not approved' });
    }

    // Update item shipped quantities
    if (shipped_quantities && shipped_quantities.length) {
      for (const sq of shipped_quantities) {
        await client.query(`
          UPDATE stock_transfer_items SET shipped_quantity = $1
          WHERE transfer_id = $2 AND product_id = $3
        `, [sq.quantity, transfer_id, sq.product_id]);
      }
    } else {
      // Default: shipped = requested
      await client.query(`
        UPDATE stock_transfer_items SET shipped_quantity = requested_quantity
        WHERE transfer_id = $1
      `, [transfer_id]);
    }

    // Update transfer status
    await client.query(`
      UPDATE stock_transfers 
      SET status = 'in_transit', shipped_by = $1, shipped_at = NOW(), tracking_number = $2, updated_at = NOW()
      WHERE id = $3
    `, [shipped_by, tracking_number, transfer_id]);

    await client.query('COMMIT');

    res.json({ success: true, transfer_id, status: 'in_transit', shipped_at: new Date().toISOString(), tracking_number });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Receive transfer
router.post('/transfers/:transfer_id/receive', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { transfer_id } = req.params;
    const { received_items, received_by } = req.body;

    await client.query('BEGIN');

    // Get transfer
    const transferResult = await client.query(`
      SELECT * FROM stock_transfers WHERE id = $1 AND tenant_id = $2 AND status = 'in_transit'
    `, [transfer_id, tenantId]);

    if (transferResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer not found or not in transit' });
    }

    const transfer = transferResult.rows[0];

    // Get items
    const itemsResult = await client.query(`
      SELECT * FROM stock_transfer_items WHERE transfer_id = $1
    `, [transfer_id]);

    const variances = [];

    // Update received quantities and inventory
    for (const item of itemsResult.rows) {
      const receivedItem = received_items?.find(ri => ri.product_id === item.product_id);
      const receivedQty = receivedItem?.received_qty ?? item.shipped_quantity;

      await client.query(`
        UPDATE stock_transfer_items 
        SET received_quantity = $1, variance_reason = $2
        WHERE id = $3
      `, [receivedQty, receivedItem?.variance_reason, item.id]);

      // Update destination inventory
      await client.query(`
        UPDATE inventory SET 
          quantity = quantity + $1,
          available_quantity = available_quantity + $1,
          updated_at = NOW()
        WHERE product_id = $2 AND store_id = $3 AND tenant_id = $4
      `, [receivedQty, item.product_id, transfer.to_store_id, tenantId]);

      // Deduct from source inventory
      await client.query(`
        UPDATE inventory SET 
          quantity = quantity - $1,
          available_quantity = available_quantity - $1,
          updated_at = NOW()
        WHERE product_id = $2 AND store_id = $3 AND tenant_id = $4
      `, [receivedQty, item.product_id, transfer.from_store_id, tenantId]);

      // Log audit
      await client.query(`
        INSERT INTO inventory_audit_log 
          (tenant_id, product_id, store_id, action, quantity_change, reference_type, reference_id, performed_by)
        VALUES ($1, $2, $3, 'transfer_in', $4, 'transfer', $5, $6)
      `, [tenantId, item.product_id, transfer.to_store_id, receivedQty, transfer_id, received_by]);

      if (receivedQty !== item.shipped_quantity) {
        variances.push({
          product_id: item.product_id,
          shipped: item.shipped_quantity,
          received: receivedQty,
          variance: receivedQty - item.shipped_quantity,
          reason: receivedItem?.variance_reason
        });
      }
    }

    // Complete transfer
    await client.query(`
      UPDATE stock_transfers 
      SET status = 'completed', received_by = $1, received_at = NOW(), completed_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [received_by, transfer_id]);

    await client.query('COMMIT');

    await publishEnvelope('retail.inventory.transfer.completed.v1', 1, {
      transfer_id,
      transfer_number: transfer.transfer_number,
      tenant_id: tenantId,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, transfer_id, status: 'completed', received_at: new Date().toISOString(), variances });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// STOCK COUNTS
// ============================================

// Create stock count
router.post('/stock-counts', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { type, store_id, location_ids, category_ids, assigned_to, scheduled_date } = req.body;

    await client.query('BEGIN');

    // Generate count number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await client.query(`
      SELECT COUNT(*) FROM stock_counts WHERE tenant_id = $1 AND count_number LIKE $2
    `, [tenantId, `SC-${dateStr}%`]);
    const seq = parseInt(countResult.rows[0].count) + 1;
    const countNumber = `SC-${dateStr}-${String(seq).padStart(3, '0')}`;

    // Create count
    const result = await client.query(`
      INSERT INTO stock_counts 
        (tenant_id, count_number, type, store_id, assigned_to, scheduled_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tenantId, countNumber, type || 'cycle', store_id || DEFAULT_STORE_ID, assigned_to, scheduled_date]);

    const stockCount = result.rows[0];

    // Add items based on filters
    let itemConditions = ['i.tenant_id = $1'];
    const itemParams = [tenantId];
    let idx = 2;

    if (store_id) {
      itemConditions.push(`i.store_id = $${idx++}`);
      itemParams.push(store_id);
    } else {
      itemConditions.push(`i.store_id = $${idx++}`);
      itemParams.push(DEFAULT_STORE_ID);
    }

    if (location_ids && location_ids.length) {
      itemConditions.push(`il.location_id = ANY($${idx++})`);
      itemParams.push(location_ids);
    }

    if (category_ids && category_ids.length) {
      itemConditions.push(`p.category = ANY($${idx++})`);
      itemParams.push(category_ids);
    }

    // Insert items to count
    await client.query(`
      INSERT INTO stock_count_items (count_id, product_id, location_id, system_quantity)
      SELECT $1, i.product_id, il.location_id, COALESCE(il.quantity, i.quantity)
      FROM inventory i
      LEFT JOIN inventory_locations il ON i.product_id = il.product_id AND il.tenant_id = i.tenant_id
      JOIN products p ON i.product_id = p.id
      WHERE ${itemConditions.join(' AND ')} AND p.status = 'active'
    `, [stockCount.id, ...itemParams.slice(1)]);

    const itemsCount = await client.query(`
      SELECT COUNT(*) FROM stock_count_items WHERE count_id = $1
    `, [stockCount.id]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      count_id: stockCount.id,
      count_number: countNumber,
      type: type || 'cycle',
      status: 'draft',
      items_to_count: parseInt(itemsCount.rows[0].count),
      created_at: stockCount.created_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// List stock counts
router.get('/stock-counts', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, store_id, from_date, to_date } = req.query;

    let conditions = ['tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (store_id) {
      conditions.push(`store_id = $${idx++}`);
      params.push(store_id);
    }
    if (from_date) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(to_date);
    }

    const result = await query(`
      SELECT sc.*,
             (SELECT COUNT(*) FROM stock_count_items WHERE count_id = sc.id) as total_items,
             (SELECT COUNT(*) FROM stock_count_items WHERE count_id = sc.id AND counted_quantity IS NOT NULL) as counted_items,
             (SELECT COUNT(*) FROM stock_count_items WHERE count_id = sc.id AND variance != 0) as variance_count
      FROM stock_counts sc
      WHERE ${conditions.join(' AND ')}
      ORDER BY sc.created_at DESC
    `, params);

    res.json({ success: true, counts: result.rows, total: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Get stock count details
router.get('/stock-counts/:count_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { count_id } = req.params;

    const countResult = await query(`
      SELECT * FROM stock_counts WHERE id = $1 AND tenant_id = $2
    `, [count_id, tenantId]);

    if (countResult.rows.length === 0) {
      return res.status(404).json({ error: 'Stock count not found' });
    }

    const itemsResult = await query(`
      SELECT sci.*, p.name as product_name, p.sku, wl.code as location_code
      FROM stock_count_items sci
      JOIN products p ON sci.product_id = p.id
      LEFT JOIN warehouse_locations wl ON sci.location_id = wl.id
      WHERE sci.count_id = $1
      ORDER BY p.name
    `, [count_id]);

    const stockCount = countResult.rows[0];
    const items = itemsResult.rows;

    res.json({
      success: true,
      ...stockCount,
      items,
      summary: {
        total_items: items.length,
        counted: items.filter(i => i.counted_quantity !== null).length,
        pending: items.filter(i => i.counted_quantity === null).length,
        variances: items.filter(i => i.variance !== 0).length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Start stock count
router.post('/stock-counts/:count_id/start', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { count_id } = req.params;

    const result = await query(`
      UPDATE stock_counts 
      SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
      RETURNING *
    `, [count_id, tenantId]);

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Stock count not found or already started' });
    }

    res.json({ success: true, count_id, status: 'in_progress', started_at: result.rows[0].started_at });
  } catch (error) {
    next(error);
  }
});

// Record count for item
router.post('/stock-counts/:count_id/items', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { count_id } = req.params;
    const { product_id, location_id, counted_quantity, notes, counted_by } = req.body;

    // Verify count exists and is in progress
    const countResult = await query(`
      SELECT * FROM stock_counts WHERE id = $1 AND tenant_id = $2 AND status = 'in_progress'
    `, [count_id, tenantId]);

    if (countResult.rows.length === 0) {
      return res.status(400).json({ error: 'Stock count not found or not in progress' });
    }

    // Update or insert count item
    const result = await query(`
      UPDATE stock_count_items 
      SET counted_quantity = $1, counted_by = $2, counted_at = NOW(), notes = $3
      WHERE count_id = $4 AND product_id = $5 AND (location_id = $6 OR (location_id IS NULL AND $6 IS NULL))
      RETURNING *, (counted_quantity - system_quantity) as variance
    `, [counted_quantity, counted_by, notes, count_id, product_id, location_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found in count' });
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Complete stock count
router.post('/stock-counts/:count_id/complete', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { count_id } = req.params;
    const { apply_adjustments, approved_by, notes } = req.body;

    await client.query('BEGIN');

    // Get count
    const countResult = await client.query(`
      SELECT * FROM stock_counts WHERE id = $1 AND tenant_id = $2 AND status = 'in_progress'
    `, [count_id, tenantId]);

    if (countResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Stock count not found or not in progress' });
    }

    // Get items with variances
    const itemsResult = await client.query(`
      SELECT sci.*, p.price
      FROM stock_count_items sci
      JOIN products p ON sci.product_id = p.id
      WHERE sci.count_id = $1 AND sci.counted_quantity IS NOT NULL
    `, [count_id]);

    let totalVarianceUnits = 0;
    let totalVarianceValue = 0;

    // Apply adjustments if requested
    if (apply_adjustments) {
      for (const item of itemsResult.rows) {
        if (item.variance !== 0) {
          totalVarianceUnits += item.variance;
          totalVarianceValue += item.variance * (item.price || 0);

          // Update inventory
          await client.query(`
            UPDATE inventory 
            SET quantity = quantity + $1, available_quantity = available_quantity + $1, updated_at = NOW()
            WHERE product_id = $2 AND store_id = $3 AND tenant_id = $4
          `, [item.variance, item.product_id, countResult.rows[0].store_id, tenantId]);

          // Log audit
          await client.query(`
            INSERT INTO inventory_audit_log 
              (tenant_id, product_id, store_id, action, quantity_change, quantity_before, quantity_after, reference_type, reference_id, performed_by, reason)
            VALUES ($1, $2, $3, 'count_adjustment', $4, $5, $6, 'count', $7, $8, $9)
          `, [tenantId, item.product_id, countResult.rows[0].store_id, item.variance, item.system_quantity, item.counted_quantity, count_id, approved_by, 'Stock count adjustment']);

          // Update variance value
          await client.query(`
            UPDATE stock_count_items SET variance_value = $1 WHERE id = $2
          `, [item.variance * (item.price || 0), item.id]);
        }
      }
    }

    // Complete count
    await client.query(`
      UPDATE stock_counts 
      SET status = 'completed', completed_at = NOW(), approved_by = $1, approved_at = NOW(), notes = $2, updated_at = NOW()
      WHERE id = $3
    `, [approved_by, notes, count_id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      count_id,
      status: 'completed',
      completed_at: new Date().toISOString(),
      summary: {
        items_counted: itemsResult.rows.length,
        items_with_variance: itemsResult.rows.filter(i => i.variance !== 0).length,
        total_variance_units: totalVarianceUnits,
        total_variance_value: totalVarianceValue,
        adjustments_applied: apply_adjustments || false
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// LOCATION DETAILS & MANAGEMENT
// ============================================

// Get location details
router.get('/locations/:location_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { location_id } = req.params;

    const result = await query(`
      SELECT l.*, p.name as parent_name
      FROM warehouse_locations l
      LEFT JOIN warehouse_locations p ON l.parent_id = p.id
      WHERE l.id = $1 AND l.tenant_id = $2
    `, [location_id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true, location: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update location
router.patch('/locations/:location_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { location_id } = req.params;
    const { name, code, zone, aisle, shelf, bin, type, capacity, is_active, is_pickable, is_receivable } = req.body;

    const result = await query(`
      UPDATE warehouse_locations SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        zone = COALESCE($3, zone),
        aisle = COALESCE($4, aisle),
        shelf = COALESCE($5, shelf),
        bin = COALESCE($6, bin),
        type = COALESCE($7, type),
        capacity = COALESCE($8, capacity),
        is_active = COALESCE($9, is_active),
        is_pickable = COALESCE($10, is_pickable),
        is_receivable = COALESCE($11, is_receivable),
        updated_at = NOW()
      WHERE id = $12 AND tenant_id = $13
      RETURNING *
    `, [name, code, zone, aisle, shelf, bin, type, capacity, is_active, is_pickable, is_receivable, location_id, tenantId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true, location: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete location
router.delete('/locations/:location_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { location_id } = req.params;

    // Check if location has inventory
    const inventoryCheck = await query(`
      SELECT COUNT(*) FROM inventory_locations WHERE location_id = $1
    `, [location_id]);

    if (parseInt(inventoryCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete location with inventory items' });
    }

    const result = await query(`
      DELETE FROM warehouse_locations WHERE id = $1 AND tenant_id = $2
    `, [location_id, tenantId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true, deleted: true });
  } catch (error) {
    next(error);
  }
});

// Get location inventory
router.get('/locations/:location_id/inventory', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { location_id } = req.params;

    const result = await query(`
      SELECT 
        il.*,
        p.name as product_name,
        p.sku,
        p.category,
        p.cost,
        (il.quantity * p.cost) as total_value
      FROM inventory_locations il
      JOIN products p ON il.product_id = p.id
      WHERE il.location_id = $1 AND il.tenant_id = $2
      ORDER BY p.name
    `, [location_id, tenantId]);

    res.json({
      success: true,
      location_id,
      inventory: result.rows,
      total_items: result.rows.length,
      total_units: result.rows.reduce((sum, r) => sum + parseInt(r.quantity || 0), 0),
      total_value: result.rows.reduce((sum, r) => sum + parseFloat(r.total_value || 0), 0)
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PRODUCT VARIANTS
// ============================================

// Get product variants
router.get('/products/:product_id/variants', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { store_id } = req.query;
    const storeId = store_id || DEFAULT_STORE_ID;

    const result = await query(`
      SELECT 
        pv.*,
        COALESCE(i.quantity, 0) as stock,
        COALESCE(i.available_quantity, 0) as available
      FROM product_variants pv
      LEFT JOIN inventory i ON pv.id = i.variant_id AND i.store_id = $2
      WHERE pv.product_id = $1 AND pv.tenant_id = $3
      ORDER BY pv.created_at
    `, [product_id, storeId, tenantId]);

    res.json({
      success: true,
      product_id,
      variants: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    next(error);
  }
});

// Create product variant
router.post('/products/:product_id/variants', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { sku, name, attributes, price, cost_price } = req.body;

    const result = await query(`
      INSERT INTO product_variants 
        (tenant_id, product_id, sku, name, attributes, price, cost_price)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, product_id, sku, name, JSON.stringify(attributes || {}), price, cost_price]);

    res.status(201).json({ success: true, variant: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SERIAL NUMBER TRACKING
// ============================================

// Get product serials
router.get('/products/:product_id/serials', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { store_id, status } = req.query;
    const storeId = store_id || DEFAULT_STORE_ID;

    let conditions = ['ps.product_id = $1', 'ps.tenant_id = $2'];
    const params = [product_id, tenantId];
    let idx = 3;

    if (status) {
      conditions.push(`ps.status = $${idx++}`);
      params.push(status);
    }

    const result = await query(`
      SELECT ps.*
      FROM product_serials ps
      WHERE ${conditions.join(' AND ')}
      ORDER BY ps.created_at DESC
      LIMIT 500
    `, params);

    res.json({
      success: true,
      product_id,
      serials: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    next(error);
  }
});

// Add serial number
router.post('/products/:product_id/serials', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { serial_number, batch_id, store_id, notes } = req.body;
    const storeId = store_id || DEFAULT_STORE_ID;

    // Check if serial already exists
    const existingCheck = await query(`
      SELECT id FROM product_serials WHERE serial_number = $1 AND tenant_id = $2
    `, [serial_number, tenantId]);

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Serial number already exists' });
    }

    const result = await query(`
      INSERT INTO product_serials 
        (tenant_id, product_id, serial_number, batch_id, store_id, status, notes)
      VALUES ($1, $2, $3, $4, $5, 'available', $6)
      RETURNING *
    `, [tenantId, product_id, serial_number, batch_id, storeId, notes]);

    res.status(201).json({ success: true, serial: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ============================================
// BATCH / LOT TRACKING
// ============================================

// Get product batches
router.get('/products/:product_id/batches', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { store_id, include_expired } = req.query;
    const storeId = store_id || DEFAULT_STORE_ID;

    let conditions = ['pb.product_id = $1', 'pb.tenant_id = $2'];
    const params = [product_id, tenantId];

    if (include_expired !== 'true') {
      conditions.push('(pb.expiry_date IS NULL OR pb.expiry_date > NOW())');
    }

    const result = await query(`
      SELECT 
        pb.*,
        CASE 
          WHEN pb.expiry_date IS NULL THEN 'no_expiry'
          WHEN pb.expiry_date < NOW() THEN 'expired'
          WHEN pb.expiry_date < NOW() + INTERVAL '30 days' THEN 'expiring_soon'
          ELSE 'fresh'
        END as status,
        EXTRACT(DAY FROM pb.expiry_date - NOW()) as days_until_expiry
      FROM product_batches pb
      WHERE ${conditions.join(' AND ')}
      ORDER BY pb.expiry_date ASC NULLS LAST
    `, params);

    res.json({
      success: true,
      product_id,
      batches: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    next(error);
  }
});

// Add batch
router.post('/products/:product_id/batches', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const { batch_number, lot_number, quantity, manufacture_date, expiry_date, store_id, notes } = req.body;
    const storeId = store_id || DEFAULT_STORE_ID;

    const result = await query(`
      INSERT INTO product_batches 
        (tenant_id, product_id, batch_number, lot_number, quantity, manufacture_date, expiry_date, store_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [tenantId, product_id, batch_number, lot_number, quantity, manufacture_date, expiry_date, storeId, notes]);

    res.status(201).json({ success: true, batch: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ============================================
// STOCK COUNT VARIANCES
// ============================================

// Get stock count variances
router.get('/stock-counts/:count_id/variances', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { count_id } = req.params;

    const result = await query(`
      SELECT 
        sci.*,
        p.name as product_name,
        p.sku,
        p.cost,
        (sci.variance * COALESCE(p.cost, 0)) as variance_value
      FROM stock_count_items sci
      JOIN products p ON sci.product_id = p.id
      WHERE sci.count_id = $1 AND sci.variance != 0
      ORDER BY ABS(sci.variance) DESC
    `, [count_id]);

    const variances = result.rows;
    const positiveVariance = variances.filter(v => v.variance > 0).reduce((sum, v) => sum + v.variance, 0);
    const negativeVariance = variances.filter(v => v.variance < 0).reduce((sum, v) => sum + Math.abs(v.variance), 0);
    const netValue = variances.reduce((sum, v) => sum + parseFloat(v.variance_value || 0), 0);

    res.json({
      success: true,
      count_id,
      variances,
      summary: {
        positive_variance: positiveVariance,
        negative_variance: negativeVariance,
        net_variance: positiveVariance - negativeVariance,
        net_value: netValue.toFixed(2)
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TRANSFER ITEMS
// ============================================

// Add item to transfer
router.post('/transfers/:transfer_id/items', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { transfer_id } = req.params;
    const { product_id, quantity, batch_id, notes } = req.body;

    // Verify transfer exists and is in pending status
    const transferCheck = await query(`
      SELECT id, status FROM stock_transfers WHERE id = $1 AND tenant_id = $2
    `, [transfer_id, tenantId]);

    if (transferCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    if (transferCheck.rows[0].status !== 'pending' && transferCheck.rows[0].status !== 'approved') {
      return res.status(400).json({ error: 'Cannot add items to this transfer' });
    }

    const result = await query(`
      INSERT INTO stock_transfer_items 
        (transfer_id, product_id, requested_quantity, batch_id, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [transfer_id, product_id, quantity, batch_id, notes]);

    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ============================================
// BUNDLES / COMBO PRODUCTS
// ============================================

// List bundles
router.get('/bundles', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { active_only, category } = req.query;

    // Bundles table may not exist - return empty array gracefully
    try {
      let conditions = ['b.tenant_id = $1'];
      const params = [tenantId];
      let idx = 2;

      if (active_only === 'true') {
        conditions.push('b.is_active = true');
      }

      if (category) {
        conditions.push(`b.category = $${idx++}`);
        params.push(category);
      }

      const result = await query(`
        SELECT 
          b.*,
          (SELECT COUNT(*) FROM bundle_items bi WHERE bi.bundle_id = b.id) as component_count,
          (SELECT SUM(bi.quantity * p.cost) 
           FROM bundle_items bi 
           JOIN products p ON bi.product_id = p.id 
           WHERE bi.bundle_id = b.id) as component_value
        FROM product_bundles b
        WHERE ${conditions.join(' AND ')}
        ORDER BY b.name
      `, params);

      const bundles = result.rows.map(b => ({
        ...b,
        savings: parseFloat(b.component_value || 0) - parseFloat(b.price || 0)
      }));

      res.json({ success: true, bundles });
    } catch (tableError) {
      // Tables don't exist yet - return empty list
      res.json({ success: true, bundles: [], message: 'Bundles feature not yet configured' });
    }
  } catch (error) {
    next(error);
  }
});

// Get bundle details
router.get('/bundles/:bundle_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { bundle_id } = req.params;

    const bundleResult = await query(`
      SELECT * FROM product_bundles WHERE id = $1 AND tenant_id = $2
    `, [bundle_id, tenantId]);

    if (bundleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const itemsResult = await query(`
      SELECT 
        bi.*,
        p.name as product_name,
        p.sku,
        p.cost,
        COALESCE(i.quantity, 0) as available_stock
      FROM bundle_items bi
      JOIN products p ON bi.product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id AND i.store_id = $1
      WHERE bi.bundle_id = $2
    `, [DEFAULT_STORE_ID, bundle_id]);

    // Calculate available quantity based on component stock
    const minAvailable = itemsResult.rows.length > 0
      ? Math.min(...itemsResult.rows.map(i => Math.floor(i.available_stock / i.quantity)))
      : 0;

    res.json({
      success: true,
      bundle: {
        ...bundleResult.rows[0],
        components: itemsResult.rows,
        available_quantity: Math.max(0, minAvailable)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create bundle
router.post('/bundles', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { name, description, sku, price, components, category, is_active } = req.body;

    await client.query('BEGIN');

    const bundleResult = await client.query(`
      INSERT INTO product_bundles 
        (tenant_id, name, description, sku, price, category, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, name, description, sku, price, category, is_active !== false]);

    const bundle = bundleResult.rows[0];

    // Add components
    if (components && components.length > 0) {
      for (const comp of components) {
        await client.query(`
          INSERT INTO bundle_items (bundle_id, product_id, quantity, is_optional)
          VALUES ($1, $2, $3, $4)
        `, [bundle.id, comp.product_id, comp.quantity || 1, comp.is_optional || false]);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({ success: true, bundle });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Check bundle availability
router.get('/bundles/:bundle_id/availability', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { bundle_id } = req.params;
    const { store_id } = req.query;
    const storeId = store_id || DEFAULT_STORE_ID;

    const result = await query(`
      SELECT 
        bi.product_id,
        bi.quantity as required,
        p.name as product_name,
        COALESCE(i.available_quantity, 0) as available,
        FLOOR(COALESCE(i.available_quantity, 0) / bi.quantity) as can_fulfill
      FROM bundle_items bi
      JOIN products p ON bi.product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id AND i.store_id = $1
      WHERE bi.bundle_id = $2
    `, [storeId, bundle_id]);

    const components = result.rows;
    const canFulfill = components.length > 0
      ? Math.min(...components.map(c => parseInt(c.can_fulfill)))
      : 0;

    const unavailable = components.filter(c => parseInt(c.can_fulfill) === 0);

    res.json({
      success: true,
      bundle_id,
      available_quantity: Math.max(0, canFulfill),
      components,
      all_available: unavailable.length === 0,
      unavailable_components: unavailable
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GOODS RECEIVING (GRN)
// ============================================

// List receiving records
router.get('/receiving', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, supplier_id, limit = 50 } = req.query;

    let conditions = ['gr.tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`gr.status = $${idx++}`);
      params.push(status);
    }
    if (supplier_id) {
      conditions.push(`gr.supplier_id = $${idx++}`);
      params.push(supplier_id);
    }

    params.push(parseInt(limit));

    const result = await query(`
      SELECT gr.*,
             (SELECT COUNT(*) FROM goods_receiving_items WHERE grn_id = gr.id) as total_items,
             (SELECT SUM(received_quantity) FROM goods_receiving_items WHERE grn_id = gr.id) as total_quantity
      FROM goods_receiving gr
      WHERE ${conditions.join(' AND ')}
      ORDER BY gr.created_at DESC
      LIMIT $${idx}
    `, params);

    res.json({ success: true, receipts: result.rows, total: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Get receiving details
router.get('/receiving/:receipt_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { receipt_id } = req.params;

    const receiptResult = await query(`
      SELECT * FROM goods_receiving WHERE id = $1 AND tenant_id = $2
    `, [receipt_id, tenantId]);

    if (receiptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const itemsResult = await query(`
      SELECT gri.*, p.name as product_name, p.sku
      FROM goods_receiving_items gri
      JOIN products p ON gri.product_id = p.id
      WHERE gri.grn_id = $1
    `, [receipt_id]);

    res.json({
      success: true,
      ...receiptResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create receiving record
router.post('/receiving', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { po_number, supplier_name, location_id, notes } = req.body;

    await client.query('BEGIN');

    // Generate GRN number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await client.query(`
      SELECT COUNT(*) FROM goods_receiving WHERE tenant_id = $1 AND grn_number LIKE $2
    `, [tenantId, `GRN-${dateStr}%`]);
    const seq = parseInt(countResult.rows[0].count) + 1;
    const grnNumber = `GRN-${dateStr}-${String(seq).padStart(3, '0')}`;

    const result = await client.query(`
      INSERT INTO goods_receiving 
        (tenant_id, grn_number, purchase_order_id, supplier_id, store_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tenantId, grnNumber, po_number, supplier_name, DEFAULT_STORE_ID, notes]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      receipt: result.rows[0],
      grn_number: grnNumber
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Add item to receiving
router.post('/receiving/:receipt_id/items', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { receipt_id } = req.params;
    const { product_id, expected_quantity, received_quantity, batch_number, expiry_date } = req.body;

    // Verify receipt exists
    const receiptCheck = await query(`
      SELECT id FROM goods_receiving WHERE id = $1 AND tenant_id = $2
    `, [receipt_id, tenantId]);

    if (receiptCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const result = await query(`
      INSERT INTO goods_receiving_items 
        (grn_id, product_id, expected_quantity, received_quantity, batch_number, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [receipt_id, product_id, expected_quantity || 0, received_quantity || 0, batch_number, expiry_date]);

    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Complete receiving
router.post('/receiving/:receipt_id/complete', requireAnyRole(['admin', 'manager', 'warehouse']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { receipt_id } = req.params;
    const { received_by } = req.body;

    await client.query('BEGIN');

    // Get receipt
    const receiptResult = await client.query(`
      SELECT * FROM goods_receiving WHERE id = $1 AND tenant_id = $2 AND status != 'completed'
    `, [receipt_id, tenantId]);

    if (receiptResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Receipt not found or already completed' });
    }

    // Get items and update inventory
    const itemsResult = await client.query(`
      SELECT * FROM goods_receiving_items WHERE grn_id = $1
    `, [receipt_id]);

    for (const item of itemsResult.rows) {
      // Update inventory
      await client.query(`
        INSERT INTO inventory (tenant_id, product_id, store_id, quantity, available_quantity)
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (product_id, store_id) DO UPDATE SET
          quantity = inventory.quantity + $4,
          available_quantity = inventory.available_quantity + $4,
          updated_at = NOW()
      `, [tenantId, item.product_id, receiptResult.rows[0].store_id || DEFAULT_STORE_ID, item.received_quantity]);

      // Log audit
      await client.query(`
        INSERT INTO inventory_audit_log 
          (tenant_id, product_id, store_id, action, quantity_change, reference_type, reference_id, performed_by)
        VALUES ($1, $2, $3, 'receiving', $4, 'grn', $5, $6)
      `, [tenantId, item.product_id, receiptResult.rows[0].store_id || DEFAULT_STORE_ID, item.received_quantity, receipt_id, received_by]);
    }

    // Complete receipt
    await client.query(`
      UPDATE goods_receiving 
      SET status = 'completed', received_by = $1, completed_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [received_by, receipt_id]);

    await client.query('COMMIT');

    res.json({ success: true, receipt_id, status: 'completed', completed_at: new Date().toISOString() });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// STOCK WRITE-OFFS
// ============================================

// List write-offs
router.get('/write-offs', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, reason, limit = 50 } = req.query;

    let conditions = ['sw.tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`sw.status = $${idx++}`);
      params.push(status);
    }
    if (reason) {
      conditions.push(`sw.reason_category = $${idx++}`);
      params.push(reason);
    }

    params.push(parseInt(limit));

    const result = await query(`
      SELECT sw.*,
             (SELECT COUNT(*) FROM stock_writeoff_items WHERE writeoff_id = sw.id) as total_items,
             (SELECT SUM(quantity) FROM stock_writeoff_items WHERE writeoff_id = sw.id) as total_quantity
      FROM stock_writeoffs sw
      WHERE ${conditions.join(' AND ')}
      ORDER BY sw.created_at DESC
      LIMIT $${idx}
    `, params);

    res.json({ success: true, writeoffs: result.rows, total: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Get write-off details
router.get('/write-offs/:writeoff_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { writeoff_id } = req.params;

    const writeoffResult = await query(`
      SELECT * FROM stock_writeoffs WHERE id = $1 AND tenant_id = $2
    `, [writeoff_id, tenantId]);

    if (writeoffResult.rows.length === 0) {
      return res.status(404).json({ error: 'Write-off not found' });
    }

    const itemsResult = await query(`
      SELECT swi.*, p.name as product_name, p.sku
      FROM stock_writeoff_items swi
      JOIN products p ON swi.product_id = p.id
      WHERE swi.writeoff_id = $1
    `, [writeoff_id]);

    res.json({
      success: true,
      ...writeoffResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create write-off
router.post('/write-offs', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { reason_category, items, notes, requested_by } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'items are required' });
    }

    await client.query('BEGIN');

    // Generate write-off number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await client.query(`
      SELECT COUNT(*) FROM stock_writeoffs WHERE tenant_id = $1 AND writeoff_number LIKE $2
    `, [tenantId, `WO-${dateStr}%`]);
    const seq = parseInt(countResult.rows[0].count) + 1;
    const writeoffNumber = `WO-${dateStr}-${String(seq).padStart(3, '0')}`;

    // Calculate total value
    let totalValue = 0;
    for (const item of items) {
      totalValue += (item.quantity || 0) * (item.unit_cost || 0);
    }

    // Create write-off
    const writeoffResult = await client.query(`
      INSERT INTO stock_writeoffs 
        (tenant_id, writeoff_number, store_id, reason_category, total_value, requested_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, writeoffNumber, DEFAULT_STORE_ID, reason_category, totalValue, requested_by, notes]);

    const writeoff = writeoffResult.rows[0];

    // Add items
    for (const item of items) {
      await client.query(`
        INSERT INTO stock_writeoff_items 
          (writeoff_id, product_id, quantity, unit_cost, total_cost, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [writeoff.id, item.product_id, item.quantity, item.unit_cost || 0, (item.quantity || 0) * (item.unit_cost || 0), item.reason || reason_category]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      writeoff_id: writeoff.id,
      writeoff_number: writeoffNumber,
      status: 'pending',
      total_value: totalValue
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Approve write-off
router.post('/write-offs/:writeoff_id/approve', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { writeoff_id } = req.params;
    const { approved_by } = req.body;

    await client.query('BEGIN');

    // Get write-off
    const writeoffResult = await client.query(`
      SELECT * FROM stock_writeoffs WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
    `, [writeoff_id, tenantId]);

    if (writeoffResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Write-off not found or already processed' });
    }

    // Get items and deduct from inventory
    const itemsResult = await client.query(`
      SELECT * FROM stock_writeoff_items WHERE writeoff_id = $1
    `, [writeoff_id]);

    for (const item of itemsResult.rows) {
      // Deduct from inventory
      await client.query(`
        UPDATE inventory SET 
          quantity = quantity - $1,
          available_quantity = available_quantity - $1,
          updated_at = NOW()
        WHERE product_id = $2 AND store_id = $3 AND tenant_id = $4
      `, [item.quantity, item.product_id, writeoffResult.rows[0].store_id || DEFAULT_STORE_ID, tenantId]);

      // Log audit
      await client.query(`
        INSERT INTO inventory_audit_log 
          (tenant_id, product_id, store_id, action, quantity_change, reference_type, reference_id, performed_by, reason)
        VALUES ($1, $2, $3, 'write_off', $4, 'writeoff', $5, $6, $7)
      `, [tenantId, item.product_id, writeoffResult.rows[0].store_id || DEFAULT_STORE_ID, -item.quantity, writeoff_id, approved_by, item.reason]);
    }

    // Approve write-off
    await client.query(`
      UPDATE stock_writeoffs 
      SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [approved_by, writeoff_id]);

    await client.query('COMMIT');

    res.json({ success: true, writeoff_id, status: 'approved', approved_at: new Date().toISOString() });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Reject write-off
router.post('/write-offs/:writeoff_id/reject', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { writeoff_id } = req.params;
    const { rejected_by, reason } = req.body;

    const result = await query(`
      UPDATE stock_writeoffs 
      SET status = 'rejected', notes = COALESCE(notes || E'\\n', '') || $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3 AND status = 'pending'
      RETURNING *
    `, [`Rejected: ${reason || 'No reason provided'}`, writeoff_id, tenantId]);

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Write-off not found or already processed' });
    }

    res.json({ success: true, writeoff_id, status: 'rejected' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
