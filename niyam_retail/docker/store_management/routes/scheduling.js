// Store Management - Scheduling Routes
const express = require('express');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// EMPLOYEES (Extended)
// ============================================

const CreateEmployeeSchema = z.object({
  employee_number: z.string().optional(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.string().min(1),
  department: z.string().optional(),
  primary_store_id: z.string().uuid().optional(),
  hourly_rate: z.number().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract']).optional(),
  hire_date: z.string().optional()
});

// List employees
router.get('/employees', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id, status, role } = req.query;
    
    let sql = `
      SELECT e.*, s.name as store_name
      FROM employees e
      LEFT JOIN stores s ON e.primary_store_id = s.id
      WHERE e.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (store_id) {
      sql += ` AND e.primary_store_id = $${idx++}`;
      params.push(store_id);
    }
    if (status) {
      sql += ` AND e.status = $${idx++}`;
      params.push(status);
    }
    if (role) {
      sql += ` AND e.role = $${idx++}`;
      params.push(role);
    }
    
    sql += ' ORDER BY e.first_name, e.last_name';
    
    const result = await query(sql, params);
    res.json({ success: true, employees: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create employee
router.post('/employees', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const data = parsed.data;
    
    const result = await query(
      `INSERT INTO employees 
       (tenant_id, employee_number, first_name, last_name, email, phone, role, department, 
        primary_store_id, hourly_rate, employment_type, hire_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tenantId, data.employee_number, data.first_name, data.last_name,
        data.email, data.phone, data.role, data.department,
        data.primary_store_id, data.hourly_rate, data.employment_type || 'full_time',
        data.hire_date
      ]
    );
    
    res.json({ success: true, employee: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get employee by ID
router.get('/employees/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      `SELECT e.*, s.name as store_name,
              (SELECT json_agg(ea.*) FROM employee_availability ea WHERE ea.employee_id = e.id) as availability
       FROM employees e
       LEFT JOIN stores s ON e.primary_store_id = s.id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ success: true, employee: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update employee availability
router.put('/employees/:id/availability', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const { id } = req.params;
    const { availability } = req.body; // Array of { day_of_week, available_from, available_to, is_unavailable }
    
    await client.query('BEGIN');
    
    // Delete existing availability
    await client.query('DELETE FROM employee_availability WHERE employee_id = $1', [id]);
    
    // Insert new availability
    for (const av of availability) {
      await client.query(
        `INSERT INTO employee_availability (employee_id, day_of_week, available_from, available_to, is_unavailable, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, av.day_of_week, av.available_from, av.available_to, av.is_unavailable || false, av.notes]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true, message: 'Availability updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// SHIFTS
// ============================================

const CreateShiftSchema = z.object({
  store_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  shift_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  break_minutes: z.number().int().optional(),
  role: z.string().optional(),
  notes: z.string().optional()
});

// Get shifts for date range
router.get('/shifts', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id, employee_id, start_date, end_date, status } = req.query;
    
    let sql = `
      SELECT s.*, e.first_name, e.last_name, st.name as store_name
      FROM shifts s
      JOIN employees e ON s.employee_id = e.id
      JOIN stores st ON s.store_id = st.id
      WHERE s.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (store_id) {
      sql += ` AND s.store_id = $${idx++}`;
      params.push(store_id);
    }
    if (employee_id) {
      sql += ` AND s.employee_id = $${idx++}`;
      params.push(employee_id);
    }
    if (start_date) {
      sql += ` AND s.shift_date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND s.shift_date <= $${idx++}`;
      params.push(end_date);
    }
    if (status) {
      sql += ` AND s.status = $${idx++}`;
      params.push(status);
    }
    
    sql += ' ORDER BY s.shift_date, s.start_time';
    
    const result = await query(sql, params);
    res.json({ success: true, shifts: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create shift
router.post('/shifts', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateShiftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const data = parsed.data;
    const createdBy = req.user?.id || null;
    
    // Check for conflicts
    const conflictCheck = await query(
      `SELECT id FROM shifts 
       WHERE employee_id = $1 AND shift_date = $2 
       AND status NOT IN ('cancelled')
       AND (
         (start_time <= $3 AND end_time > $3) OR
         (start_time < $4 AND end_time >= $4) OR
         (start_time >= $3 AND end_time <= $4)
       )`,
      [data.employee_id, data.shift_date, data.start_time, data.end_time]
    );
    
    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Shift conflicts with existing schedule' });
    }
    
    const result = await query(
      `INSERT INTO shifts 
       (tenant_id, store_id, employee_id, shift_date, start_time, end_time, break_minutes, role, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantId, data.store_id, data.employee_id, data.shift_date,
        data.start_time, data.end_time, data.break_minutes || 0, data.role, data.notes, createdBy
      ]
    );
    
    await publishEnvelope('retail.shift.created.v1', 1, {
      shift_id: result.rows[0].id,
      employee_id: data.employee_id,
      shift_date: data.shift_date,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, shift: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update shift
router.patch('/shifts/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { start_time, end_time, break_minutes, role, status, notes } = req.body;
    
    const updates = [];
    const params = [id, tenantId];
    let idx = 3;
    
    if (start_time) { updates.push(`start_time = $${idx++}`); params.push(start_time); }
    if (end_time) { updates.push(`end_time = $${idx++}`); params.push(end_time); }
    if (break_minutes !== undefined) { updates.push(`break_minutes = $${idx++}`); params.push(break_minutes); }
    if (role) { updates.push(`role = $${idx++}`); params.push(role); }
    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await query(
      `UPDATE shifts SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    res.json({ success: true, shift: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Clock in
router.post('/shifts/:id/clock-in', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      `UPDATE shifts 
       SET status = 'started', actual_start = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status IN ('scheduled', 'confirmed')
       RETURNING *`,
      [id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Shift not found or already started' });
    }
    
    res.json({ success: true, shift: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Clock out
router.post('/shifts/:id/clock-out', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      `UPDATE shifts 
       SET status = 'completed', actual_end = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'started'
       RETURNING *`,
      [id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Shift not found or not started' });
    }
    
    res.json({ success: true, shift: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TIME OFF REQUESTS
// ============================================

// List time off requests
router.get('/time-off', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { employee_id, status } = req.query;
    
    let sql = `
      SELECT t.*, e.first_name, e.last_name
      FROM time_off_requests t
      JOIN employees e ON t.employee_id = e.id
      WHERE t.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (employee_id) {
      sql += ` AND t.employee_id = $${idx++}`;
      params.push(employee_id);
    }
    if (status) {
      sql += ` AND t.status = $${idx++}`;
      params.push(status);
    }
    
    sql += ' ORDER BY t.created_at DESC';
    
    const result = await query(sql, params);
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create time off request
router.post('/time-off', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { employee_id, request_type, start_date, end_date, hours_requested, reason } = req.body;
    
    const result = await query(
      `INSERT INTO time_off_requests 
       (tenant_id, employee_id, request_type, start_date, end_date, hours_requested, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, employee_id, request_type, start_date, end_date, hours_requested, reason]
    );
    
    res.json({ success: true, request: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Approve/reject time off
router.post('/time-off/:id/review', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'approve' or 'reject'
    const reviewedBy = req.user?.id || null;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }
    
    const status = action === 'approve' ? 'approved' : 'rejected';
    
    const result = await query(
      `UPDATE time_off_requests 
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
       WHERE id = $4 AND tenant_id = $5 AND status = 'pending'
       RETURNING *`,
      [status, reviewedBy, notes, id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found or already reviewed' });
    }
    
    res.json({ success: true, request: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
