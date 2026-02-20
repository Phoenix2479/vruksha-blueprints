// Store Management - Store Configuration Routes
const express = require('express');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// STORE HOURS
// ============================================

// Get store hours
router.get('/:store_id/hours', async (req, res, next) => {
  try {
    const { store_id } = req.params;
    
    const result = await query(
      `SELECT * FROM store_hours WHERE store_id = $1 ORDER BY day_of_week`,
      [store_id]
    );
    
    // Fill in missing days with defaults
    const days = [0, 1, 2, 3, 4, 5, 6];
    const hours = days.map(day => {
      const existing = result.rows.find(h => h.day_of_week === day);
      return existing || {
        store_id,
        day_of_week: day,
        open_time: '09:00',
        close_time: '21:00',
        is_closed: day === 0, // Closed Sundays by default
        break_start: null,
        break_end: null
      };
    });
    
    res.json({ success: true, hours });
  } catch (error) {
    next(error);
  }
});

// Set store hours
router.put('/:store_id/hours', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const { store_id } = req.params;
    const { hours } = req.body; // Array of day configs
    
    await client.query('BEGIN');
    
    for (const h of hours) {
      await client.query(
        `INSERT INTO store_hours (store_id, day_of_week, open_time, close_time, is_closed, break_start, break_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (store_id, day_of_week) 
         DO UPDATE SET 
           open_time = EXCLUDED.open_time,
           close_time = EXCLUDED.close_time,
           is_closed = EXCLUDED.is_closed,
           break_start = EXCLUDED.break_start,
           break_end = EXCLUDED.break_end,
           updated_at = NOW()`,
        [store_id, h.day_of_week, h.open_time, h.close_time, h.is_closed || false, h.break_start, h.break_end]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true, message: 'Store hours updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Check if store is open
router.get('/:store_id/is-open', async (req, res, next) => {
  try {
    const { store_id } = req.params;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);
    
    // Check holidays first
    const holidayResult = await query(
      `SELECT * FROM store_holidays 
       WHERE (store_id = $1 OR store_id IS NULL) 
       AND holiday_date = CURRENT_DATE`,
      [store_id]
    );
    
    if (holidayResult.rows.length > 0) {
      const holiday = holidayResult.rows[0];
      if (holiday.is_closed) {
        return res.json({
          success: true,
          is_open: false,
          reason: 'holiday',
          holiday_name: holiday.name
        });
      }
      // Check special hours
      if (holiday.special_hours_open && holiday.special_hours_close) {
        const isOpen = currentTime >= holiday.special_hours_open && currentTime < holiday.special_hours_close;
        return res.json({
          success: true,
          is_open: isOpen,
          hours: {
            open: holiday.special_hours_open,
            close: holiday.special_hours_close
          },
          holiday_name: holiday.name
        });
      }
    }
    
    // Check regular hours
    const hoursResult = await query(
      `SELECT * FROM store_hours WHERE store_id = $1 AND day_of_week = $2`,
      [store_id, dayOfWeek]
    );
    
    if (hoursResult.rows.length === 0) {
      return res.json({ success: true, is_open: true, reason: 'no_hours_configured' });
    }
    
    const hours = hoursResult.rows[0];
    
    if (hours.is_closed) {
      return res.json({ success: true, is_open: false, reason: 'day_closed' });
    }
    
    // Check if within break
    if (hours.break_start && hours.break_end) {
      if (currentTime >= hours.break_start && currentTime < hours.break_end) {
        return res.json({
          success: true,
          is_open: false,
          reason: 'break',
          reopens_at: hours.break_end
        });
      }
    }
    
    const isOpen = currentTime >= hours.open_time && currentTime < hours.close_time;
    
    res.json({
      success: true,
      is_open: isOpen,
      hours: {
        open: hours.open_time,
        close: hours.close_time,
        break_start: hours.break_start,
        break_end: hours.break_end
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// HOLIDAYS
// ============================================

// Get holidays
router.get('/:store_id/holidays', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id } = req.params;
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear();
    
    const result = await query(
      `SELECT * FROM store_holidays 
       WHERE (store_id = $1 OR (store_id IS NULL AND tenant_id = $2))
       AND EXTRACT(YEAR FROM holiday_date) = $3
       ORDER BY holiday_date`,
      [store_id, tenantId, targetYear]
    );
    
    res.json({ success: true, holidays: result.rows });
  } catch (error) {
    next(error);
  }
});

// Add holiday
router.post('/:store_id/holidays', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id } = req.params;
    const { holiday_date, name, is_closed, special_hours_open, special_hours_close, recurring, apply_to_all } = req.body;
    
    const result = await query(
      `INSERT INTO store_holidays 
       (store_id, tenant_id, holiday_date, name, is_closed, special_hours_open, special_hours_close, recurring)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        apply_to_all ? null : store_id,
        tenantId,
        holiday_date,
        name,
        is_closed !== false,
        special_hours_open,
        special_hours_close,
        recurring || false
      ]
    );
    
    res.json({ success: true, holiday: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete holiday
router.delete('/holidays/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query('DELETE FROM store_holidays WHERE id = $1 RETURNING id', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    res.json({ success: true, message: 'Holiday deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================
// STORE SETTINGS
// ============================================

// Get all settings for store
router.get('/:store_id/settings', async (req, res, next) => {
  try {
    const { store_id } = req.params;
    
    const result = await query(
      'SELECT setting_key, setting_value, description FROM store_settings WHERE store_id = $1',
      [store_id]
    );
    
    // Convert to key-value object
    const settings = {};
    for (const row of result.rows) {
      settings[row.setting_key] = row.setting_value;
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
});

// Get single setting
router.get('/:store_id/settings/:key', async (req, res, next) => {
  try {
    const { store_id, key } = req.params;
    
    const result = await query(
      'SELECT * FROM store_settings WHERE store_id = $1 AND setting_key = $2',
      [store_id, key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Set/update setting
router.put('/:store_id/settings/:key', async (req, res, next) => {
  try {
    const { store_id, key } = req.params;
    const { value, description } = req.body;
    
    const result = await query(
      `INSERT INTO store_settings (store_id, setting_key, setting_value, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id, setting_key) 
       DO UPDATE SET setting_value = EXCLUDED.setting_value, description = COALESCE(EXCLUDED.description, store_settings.description), updated_at = NOW()
       RETURNING *`,
      [store_id, key, JSON.stringify(value), description]
    );
    
    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Bulk update settings
router.put('/:store_id/settings', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const { store_id } = req.params;
    const { settings } = req.body; // Object of key: value pairs
    
    await client.query('BEGIN');
    
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `INSERT INTO store_settings (store_id, setting_key, setting_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, setting_key) 
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
        [store_id, key, JSON.stringify(value)]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// REGISTERS
// ============================================

// Get registers for store
router.get('/:store_id/registers', async (req, res, next) => {
  try {
    const { store_id } = req.params;
    
    const result = await query(
      'SELECT * FROM registers WHERE store_id = $1 ORDER BY register_number',
      [store_id]
    );
    
    res.json({ success: true, registers: result.rows });
  } catch (error) {
    next(error);
  }
});

// Add register
router.post('/:store_id/registers', async (req, res, next) => {
  try {
    const { store_id } = req.params;
    const { register_number, name, hardware_id, ip_address, capabilities } = req.body;
    
    const result = await query(
      `INSERT INTO registers (store_id, register_number, name, hardware_id, ip_address, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [store_id, register_number, name, hardware_id, ip_address, capabilities ? JSON.stringify(capabilities) : null]
    );
    
    res.json({ success: true, register: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update register
router.patch('/registers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, hardware_id, ip_address, status, capabilities } = req.body;
    
    const updates = [];
    const params = [id];
    let idx = 2;
    
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (hardware_id !== undefined) { updates.push(`hardware_id = $${idx++}`); params.push(hardware_id); }
    if (ip_address !== undefined) { updates.push(`ip_address = $${idx++}`); params.push(ip_address); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
    if (capabilities !== undefined) { updates.push(`capabilities = $${idx++}`); params.push(JSON.stringify(capabilities)); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await query(
      `UPDATE registers SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Register not found' });
    }
    
    res.json({ success: true, register: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Heartbeat (register pinging back)
router.post('/registers/:id/heartbeat', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await query(
      'UPDATE registers SET last_seen_at = NOW() WHERE id = $1',
      [id]
    );
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
