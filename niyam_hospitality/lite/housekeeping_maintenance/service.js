/**
 * Housekeeping & Maintenance Service - Niyam Hospitality (Max Lite)
 * Handles room cleaning, maintenance requests, staff assignments
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8912;
const SERVICE_NAME = 'housekeeping_maintenance';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ROOM STATUS BOARD
// ============================================

app.get('/api/rooms/status', (req, res) => {
  try {
    const { floor, condition, status } = req.query;
    let sql = `
      SELECT r.*, rt.name as room_type_name,
        (SELECT COUNT(*) FROM housekeeping_tasks WHERE room_id = r.id AND status = 'pending') as pending_tasks
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE 1=1
    `;
    const params = [];
    
    if (floor) {
      sql += ` AND r.floor = ?`;
      params.push(floor);
    }
    if (condition) {
      sql += ` AND r.condition = ?`;
      params.push(condition);
    }
    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY r.floor, r.room_number ASC`;
    
    const rooms = query(sql, params);
    res.json({ success: true, rooms });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/rooms/:id/condition', (req, res) => {
  try {
    const { condition, notes } = req.body;
    
    run(`
      UPDATE rooms SET 
        condition = ?,
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `, [condition, notes, timestamp(), req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// HOUSEKEEPING TASKS
// ============================================

app.get('/api/tasks', (req, res) => {
  try {
    const { status, assigned_to, room_id, task_type, date } = req.query;
    let sql = `
      SELECT t.*, r.room_number, r.floor, s.first_name as assigned_name
      FROM housekeeping_tasks t
      LEFT JOIN rooms r ON t.room_id = r.id
      LEFT JOIN staff s ON t.assigned_to = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND t.status = ?`;
      params.push(status);
    }
    if (assigned_to) {
      sql += ` AND t.assigned_to = ?`;
      params.push(assigned_to);
    }
    if (room_id) {
      sql += ` AND t.room_id = ?`;
      params.push(room_id);
    }
    if (task_type) {
      sql += ` AND t.task_type = ?`;
      params.push(task_type);
    }
    if (date) {
      sql += ` AND DATE(t.scheduled_date) = ?`;
      params.push(date);
    }
    
    sql += ` ORDER BY t.priority DESC, t.scheduled_date ASC`;
    
    const tasks = query(sql, params);
    res.json({ success: true, tasks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = get(`
      SELECT t.*, r.room_number, r.floor, s.first_name as assigned_name
      FROM housekeeping_tasks t
      LEFT JOIN rooms r ON t.room_id = r.id
      LEFT JOIN staff s ON t.assigned_to = s.id
      WHERE t.id = ?
    `, [req.params.id]);
    
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    
    res.json({ success: true, task });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { room_id, task_type, priority, assigned_to, scheduled_date, notes } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO housekeeping_tasks (
        id, room_id, task_type, priority, status, assigned_to, scheduled_date, notes, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `, [id, room_id, task_type, priority || 'normal', assigned_to, scheduled_date || timestamp().split('T')[0], notes, timestamp()]);
    
    res.json({ success: true, task: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const { task_type, priority, assigned_to, scheduled_date, notes, status } = req.body;
    
    let updateFields = [];
    let params = [];
    
    if (task_type !== undefined) { updateFields.push('task_type = ?'); params.push(task_type); }
    if (priority !== undefined) { updateFields.push('priority = ?'); params.push(priority); }
    if (assigned_to !== undefined) { updateFields.push('assigned_to = ?'); params.push(assigned_to); }
    if (scheduled_date !== undefined) { updateFields.push('scheduled_date = ?'); params.push(scheduled_date); }
    if (notes !== undefined) { updateFields.push('notes = ?'); params.push(notes); }
    if (status !== undefined) { 
      updateFields.push('status = ?'); 
      params.push(status);
      if (status === 'in_progress') {
        updateFields.push('started_at = ?');
        params.push(timestamp());
      } else if (status === 'completed') {
        updateFields.push('completed_at = ?');
        params.push(timestamp());
      }
    }
    
    if (updateFields.length === 0) {
      return res.json({ success: true });
    }
    
    params.push(req.params.id);
    run(`UPDATE housekeeping_tasks SET ${updateFields.join(', ')} WHERE id = ?`, params);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/tasks/:id/start', (req, res) => {
  try {
    run(`
      UPDATE housekeeping_tasks SET status = 'in_progress', started_at = ? WHERE id = ?
    `, [timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/tasks/:id/complete', (req, res) => {
  try {
    const { notes } = req.body;
    
    // Get task to update room
    const task = get(`SELECT room_id, task_type FROM housekeeping_tasks WHERE id = ?`, [req.params.id]);
    
    run(`
      UPDATE housekeeping_tasks SET 
        status = 'completed', 
        completed_at = ?,
        notes = COALESCE(?, notes)
      WHERE id = ?
    `, [timestamp(), notes, req.params.id]);
    
    // Update room condition if it was a cleaning task
    if (task?.room_id && ['checkout_clean', 'stayover_clean', 'deep_clean'].includes(task.task_type)) {
      run(`UPDATE rooms SET condition = 'clean', updated_at = ? WHERE id = ?`, [timestamp(), task.room_id]);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Bulk create tasks for departures
app.post('/api/tasks/generate-checkout', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's departures
    const departures = query(`
      SELECT r.room_id, rm.room_number
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      WHERE DATE(r.check_out_date) = ? AND r.status = 'checked_in'
    `, [today]);
    
    let created = 0;
    for (const dep of departures) {
      // Check if task already exists
      const existing = get(`
        SELECT id FROM housekeeping_tasks 
        WHERE room_id = ? AND task_type = 'checkout_clean' AND DATE(scheduled_date) = ?
      `, [dep.room_id, today]);
      
      if (!existing) {
        run(`
          INSERT INTO housekeeping_tasks (id, room_id, task_type, priority, status, scheduled_date, created_at)
          VALUES (?, ?, 'checkout_clean', 'high', 'pending', ?, ?)
        `, [generateId(), dep.room_id, today, timestamp()]);
        created++;
      }
    }
    
    res.json({ success: true, tasks_created: created });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MAINTENANCE REQUESTS
// ============================================

app.get('/api/maintenance', (req, res) => {
  try {
    const { status, priority, category, room_id } = req.query;
    let sql = `
      SELECT m.*, r.room_number, s.first_name as assigned_name
      FROM maintenance_requests m
      LEFT JOIN rooms r ON m.room_id = r.id
      LEFT JOIN staff s ON m.assigned_to = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND m.status = ?`;
      params.push(status);
    }
    if (priority) {
      sql += ` AND m.priority = ?`;
      params.push(priority);
    }
    if (category) {
      sql += ` AND m.category = ?`;
      params.push(category);
    }
    if (room_id) {
      sql += ` AND m.room_id = ?`;
      params.push(room_id);
    }
    
    sql += ` ORDER BY m.priority DESC, m.created_at DESC`;
    
    const requests = query(sql, params);
    res.json({ success: true, maintenance_requests: requests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/maintenance', (req, res) => {
  try {
    const { room_id, location, category, description, priority, reported_by, estimated_cost } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO maintenance_requests (
        id, room_id, location, category, description, priority, status, reported_by, estimated_cost, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `, [id, room_id, location, category, description, priority || 'normal', reported_by, estimated_cost, timestamp()]);
    
    // Mark room as needing maintenance if applicable
    if (room_id && priority === 'urgent') {
      run(`UPDATE rooms SET status = 'maintenance', updated_at = ? WHERE id = ?`, [timestamp(), room_id]);
    }
    
    res.json({ success: true, request: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/maintenance/:id', (req, res) => {
  try {
    const { assigned_to, status, priority, actual_cost, resolution_notes } = req.body;
    
    let updateFields = [];
    let params = [];
    
    if (assigned_to !== undefined) { updateFields.push('assigned_to = ?'); params.push(assigned_to); }
    if (priority !== undefined) { updateFields.push('priority = ?'); params.push(priority); }
    if (actual_cost !== undefined) { updateFields.push('actual_cost = ?'); params.push(actual_cost); }
    if (resolution_notes !== undefined) { updateFields.push('resolution_notes = ?'); params.push(resolution_notes); }
    if (status !== undefined) { 
      updateFields.push('status = ?'); 
      params.push(status);
      if (status === 'resolved') {
        updateFields.push('resolved_at = ?');
        params.push(timestamp());
      }
    }
    
    if (updateFields.length === 0) {
      return res.json({ success: true });
    }
    
    params.push(req.params.id);
    run(`UPDATE maintenance_requests SET ${updateFields.join(', ')} WHERE id = ?`, params);
    
    // If resolved, update room status
    if (status === 'resolved') {
      const req_data = get(`SELECT room_id FROM maintenance_requests WHERE id = ?`, [req.params.id]);
      if (req_data?.room_id) {
        const pendingMaint = get(`
          SELECT COUNT(*) as count FROM maintenance_requests 
          WHERE room_id = ? AND status != 'resolved'
        `, [req_data.room_id]);
        
        if (pendingMaint?.count === 0) {
          run(`UPDATE rooms SET status = 'available', updated_at = ? WHERE id = ? AND status = 'maintenance'`, 
            [timestamp(), req_data.room_id]);
        }
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STAFF ASSIGNMENTS
// ============================================

app.get('/api/staff/housekeeping', (req, res) => {
  try {
    const staff = query(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM housekeeping_tasks WHERE assigned_to = s.id AND status = 'pending') as pending_tasks,
        (SELECT COUNT(*) FROM housekeeping_tasks WHERE assigned_to = s.id AND status = 'in_progress') as active_tasks
      FROM staff s
      WHERE s.department = 'housekeeping' AND s.status = 'active'
      ORDER BY s.first_name ASC
    `);
    res.json({ success: true, staff });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/staff/maintenance', (req, res) => {
  try {
    const staff = query(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM maintenance_requests WHERE assigned_to = s.id AND status NOT IN ('resolved', 'closed')) as open_requests
      FROM staff s
      WHERE s.department = 'maintenance' AND s.status = 'active'
      ORDER BY s.first_name ASC
    `);
    res.json({ success: true, staff });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD & STATS
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const dirtyRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE condition = 'dirty'`);
    const cleanRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE condition = 'clean'`);
    const inspectRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE condition = 'inspected'`);
    const pendingTasks = get(`SELECT COUNT(*) as count FROM housekeeping_tasks WHERE status = 'pending'`);
    const inProgressTasks = get(`SELECT COUNT(*) as count FROM housekeeping_tasks WHERE status = 'in_progress'`);
    const openMaintenance = get(`SELECT COUNT(*) as count FROM maintenance_requests WHERE status = 'open'`);
    const urgentMaintenance = get(`SELECT COUNT(*) as count FROM maintenance_requests WHERE status = 'open' AND priority = 'urgent'`);
    
    res.json({
      success: true,
      stats: {
        dirty_rooms: dirtyRooms?.count || 0,
        clean_rooms: cleanRooms?.count || 0,
        inspected_rooms: inspectRooms?.count || 0,
        pending_tasks: pendingTasks?.count || 0,
        in_progress_tasks: inProgressTasks?.count || 0,
        open_maintenance: openMaintenance?.count || 0,
        urgent_maintenance: urgentMaintenance?.count || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ service: SERVICE_NAME, status: 'running', mode: 'lite' });
  }
});

// Start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[${SERVICE_NAME}] Lite service running on http://localhost:${PORT}`);
    });
  })
  .catch(e => {
    console.error(`[${SERVICE_NAME}] Failed to start:`, e);
    process.exit(1);
  });
