// Group Reservations Service - Niyam Hospitality
// Group booking management with room blocks, rooming lists, and group billing

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
  kvStore = { connect: async () => {}, get: async () => null, put: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'group_reservations';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const groupsCreated = new promClient.Counter({ name: 'group_reservations_created_total', help: 'Total group reservations created', registers: [registry] });
const roomsBlocked = new promClient.Gauge({ name: 'group_reservations_rooms_blocked', help: 'Currently blocked rooms', registers: [registry] });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS connection
let natsReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    natsReady = true;
  } catch (e) {
    console.warn(`⚠️ ${SERVICE_NAME}: NATS KV connection failed, running in standalone mode`);
  }
})();

// ============================================
// GROUP BLOCKS
// ============================================

app.get('/groups', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, from_date, to_date, search } = req.query;
    
    let sql = `
      SELECT g.*,
             (SELECT COUNT(*) FROM hotel_group_rooms WHERE group_id = g.id) as total_rooms,
             (SELECT COUNT(*) FROM hotel_group_rooms WHERE group_id = g.id AND booking_id IS NOT NULL) as picked_up_rooms,
             (SELECT COUNT(*) FROM hotel_group_guests WHERE group_id = g.id) as rooming_list_count
      FROM hotel_group_reservations g
      WHERE g.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (status) {
      sql += ` AND g.status = $${paramIdx++}`;
      params.push(status);
    }
    if (from_date) {
      sql += ` AND g.arrival_date >= $${paramIdx++}`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND g.arrival_date <= $${paramIdx++}`;
      params.push(to_date);
    }
    if (search) {
      sql += ` AND (g.group_name ILIKE $${paramIdx} OR g.contact_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    
    sql += ' ORDER BY g.arrival_date DESC LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, groups: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/groups/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const groupRes = await query(`
      SELECT g.*,
             (SELECT COUNT(*) FROM hotel_group_rooms WHERE group_id = g.id) as total_rooms,
             (SELECT COUNT(*) FROM hotel_group_rooms WHERE group_id = g.id AND booking_id IS NOT NULL) as picked_up_rooms
      FROM hotel_group_reservations g
      WHERE g.id = $1 AND g.tenant_id = $2
    `, [id, tenantId]);
    
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Get blocked rooms
    const roomsRes = await query(`
      SELECT gr.*, r.room_number, r.room_type, r.floor_number, b.guest_id, g.full_name as guest_name
      FROM hotel_group_rooms gr
      JOIN hotel_rooms r ON gr.room_id = r.id
      LEFT JOIN hotel_bookings b ON gr.booking_id = b.id
      LEFT JOIN hotel_guests g ON b.guest_id = g.id
      WHERE gr.group_id = $1
      ORDER BY r.room_type, r.room_number
    `, [id]);
    
    // Get rooming list
    const guestsRes = await query(`
      SELECT gg.*, r.room_number, b.status as booking_status
      FROM hotel_group_guests gg
      LEFT JOIN hotel_group_rooms gr ON gg.assigned_room_id = gr.id
      LEFT JOIN hotel_rooms r ON gr.room_id = r.id
      LEFT JOIN hotel_bookings b ON gr.booking_id = b.id
      WHERE gg.group_id = $1
      ORDER BY gg.full_name
    `, [id]);
    
    res.json({
      success: true,
      group: groupRes.rows[0],
      rooms: roomsRes.rows,
      rooming_list: guestsRes.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const GroupSchema = z.object({
  group_name: z.string().min(1),
  group_type: z.enum(['corporate', 'wedding', 'conference', 'tour', 'family', 'other']).default('corporate'),
  contact_name: z.string().min(1),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  company_name: z.string().optional(),
  arrival_date: z.string(),
  departure_date: z.string(),
  room_blocks: z.array(z.object({
    room_type: z.string(),
    count: z.number().min(1),
    rate: z.number().positive()
  })),
  cutoff_date: z.string().optional(),
  notes: z.string().optional(),
  billing_type: z.enum(['master_account', 'individual', 'split']).default('master_account'),
  deposit_required: z.number().optional()
});

app.post('/groups', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = GroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    await client.query('BEGIN');
    
    // Create group
    const groupId = uuidv4();
    const groupCode = `GRP${Date.now().toString(36).toUpperCase()}`;
    
    // Calculate totals
    const totalRooms = data.room_blocks.reduce((sum, b) => sum + b.count, 0);
    const nights = Math.ceil((new Date(data.departure_date) - new Date(data.arrival_date)) / (1000 * 60 * 60 * 24));
    const estimatedRevenue = data.room_blocks.reduce((sum, b) => sum + (b.count * b.rate * nights), 0);
    
    await client.query(`
      INSERT INTO hotel_group_reservations (id, tenant_id, group_code, group_name, group_type, contact_name, contact_email, contact_phone, company_name, arrival_date, departure_date, cutoff_date, total_rooms, estimated_revenue, notes, billing_type, deposit_required, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'tentative')
    `, [groupId, tenantId, groupCode, data.group_name, data.group_type, data.contact_name, data.contact_email, data.contact_phone, data.company_name, data.arrival_date, data.departure_date, data.cutoff_date, totalRooms, estimatedRevenue, data.notes, data.billing_type, data.deposit_required]);
    
    // Block rooms for each room type
    for (const block of data.room_blocks) {
      // Find available rooms of this type
      const availableRooms = await client.query(`
        SELECT r.id FROM hotel_rooms r
        WHERE r.tenant_id = $1 AND r.room_type = $2 AND r.status = 'available'
          AND r.id NOT IN (
            SELECT room_id FROM hotel_group_rooms gr
            JOIN hotel_group_reservations g ON gr.group_id = g.id
            WHERE g.tenant_id = $1 AND g.status IN ('tentative', 'definite')
              AND (
                (g.arrival_date <= $3 AND g.departure_date > $3) OR
                (g.arrival_date < $4 AND g.departure_date >= $4) OR
                (g.arrival_date >= $3 AND g.departure_date <= $4)
              )
          )
        LIMIT $5
      `, [tenantId, block.room_type, data.arrival_date, data.departure_date, block.count]);
      
      if (availableRooms.rowCount < block.count) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Not enough ${block.room_type} rooms available. Requested: ${block.count}, Available: ${availableRooms.rowCount}` 
        });
      }
      
      // Create room blocks
      for (const room of availableRooms.rows) {
        await client.query(`
          INSERT INTO hotel_group_rooms (tenant_id, group_id, room_id, room_type, rate_per_night)
          VALUES ($1, $2, $3, $4, $5)
        `, [tenantId, groupId, room.id, block.room_type, block.rate]);
      }
    }
    
    await client.query('COMMIT');
    
    groupsCreated.inc();
    
    await publishEnvelope('hospitality.group_reservations.block_created.v1', 1, {
      group_id: groupId,
      group_code: groupCode,
      total_rooms: totalRooms,
      arrival_date: data.arrival_date
    });
    
    res.json({
      success: true,
      group: {
        id: groupId,
        group_code: groupCode,
        total_rooms: totalRooms,
        estimated_revenue: estimatedRevenue,
        status: 'tentative'
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// ROOMING LIST
// ============================================

app.get('/groups/:id/rooming-list', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      SELECT gg.*, r.room_number, r.room_type, gr.rate_per_night
      FROM hotel_group_guests gg
      LEFT JOIN hotel_group_rooms gr ON gg.assigned_room_id = gr.id
      LEFT JOIN hotel_rooms r ON gr.room_id = r.id
      WHERE gg.group_id = $1 AND gg.tenant_id = $2
      ORDER BY gg.full_name
    `, [id, tenantId]);
    
    res.json({ success: true, guests: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const RoomingListGuestSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  arrival_date: z.string().optional(),
  departure_date: z.string().optional(),
  room_preference: z.string().optional(),
  special_requests: z.string().optional(),
  sharing_with: z.string().optional()
});

app.post('/groups/:id/rooming-list', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const parsed = RoomingListGuestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    // Get group dates for defaults
    const groupRes = await query(`
      SELECT arrival_date, departure_date FROM hotel_group_reservations WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const group = groupRes.rows[0];
    
    const result = await query(`
      INSERT INTO hotel_group_guests (tenant_id, group_id, full_name, email, phone, arrival_date, departure_date, room_preference, special_requests, sharing_with)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [tenantId, id, data.full_name, data.email, data.phone, 
        data.arrival_date || group.arrival_date, data.departure_date || group.departure_date,
        data.room_preference, data.special_requests, data.sharing_with]);
    
    await publishEnvelope('hospitality.group_reservations.rooming_list_updated.v1', 1, {
      group_id: id,
      action: 'guest_added',
      guest_name: data.full_name
    });
    
    res.json({ success: true, guest: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/groups/:id/rooming-list/bulk', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { guests } = req.body;
    
    if (!Array.isArray(guests) || guests.length === 0) {
      return res.status(400).json({ error: 'guests array is required' });
    }
    
    // Get group dates
    const groupRes = await client.query(`
      SELECT arrival_date, departure_date FROM hotel_group_reservations WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const group = groupRes.rows[0];
    
    await client.query('BEGIN');
    
    const addedGuests = [];
    for (const guest of guests) {
      if (!guest.full_name) continue;
      
      const result = await client.query(`
        INSERT INTO hotel_group_guests (tenant_id, group_id, full_name, email, phone, arrival_date, departure_date, room_preference, special_requests)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, full_name
      `, [tenantId, id, guest.full_name, guest.email, guest.phone,
          guest.arrival_date || group.arrival_date, guest.departure_date || group.departure_date,
          guest.room_preference, guest.special_requests]);
      
      addedGuests.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.group_reservations.rooming_list_updated.v1', 1, {
      group_id: id,
      action: 'bulk_upload',
      count: addedGuests.length
    });
    
    res.json({ success: true, added: addedGuests.length, guests: addedGuests });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// ROOM ASSIGNMENT
// ============================================

app.post('/groups/:id/assign-room', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { guest_id, group_room_id } = req.body;
    
    await client.query('BEGIN');
    
    // Verify group room exists and is not already assigned
    const roomCheck = await client.query(`
      SELECT gr.*, r.room_number FROM hotel_group_rooms gr
      JOIN hotel_rooms r ON gr.room_id = r.id
      WHERE gr.id = $1 AND gr.group_id = $2 AND gr.tenant_id = $3
    `, [group_room_id, id, tenantId]);
    
    if (roomCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group room not found' });
    }
    
    // Update guest assignment
    await client.query(`
      UPDATE hotel_group_guests SET assigned_room_id = $1, updated_at = NOW()
      WHERE id = $2 AND group_id = $3 AND tenant_id = $4
    `, [group_room_id, guest_id, id, tenantId]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Guest assigned to room ${roomCheck.rows[0].room_number}`
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// PICKUP (Convert to individual bookings)
// ============================================

app.post('/groups/:id/pickup', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { guest_ids } = req.body; // Optional: specific guests to pick up
    
    await client.query('BEGIN');
    
    // Get group info
    const groupRes = await client.query(`
      SELECT * FROM hotel_group_reservations WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (groupRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const group = groupRes.rows[0];
    
    // Get guests to pick up (with room assignments)
    let guestQuery = `
      SELECT gg.*, gr.room_id, gr.rate_per_night, gr.id as group_room_id
      FROM hotel_group_guests gg
      JOIN hotel_group_rooms gr ON gg.assigned_room_id = gr.id
      WHERE gg.group_id = $1 AND gg.tenant_id = $2 AND gr.booking_id IS NULL
    `;
    const guestParams = [id, tenantId];
    
    if (guest_ids && guest_ids.length > 0) {
      guestQuery += ` AND gg.id = ANY($3)`;
      guestParams.push(guest_ids);
    }
    
    const guestsRes = await client.query(guestQuery, guestParams);
    
    if (guestsRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No eligible guests found for pickup' });
    }
    
    const bookings = [];
    for (const guest of guestsRes.rows) {
      // Create or find guest record
      let guestId;
      if (guest.email) {
        const existingGuest = await client.query(`
          SELECT id FROM hotel_guests WHERE email = $1 AND tenant_id = $2
        `, [guest.email, tenantId]);
        
        if (existingGuest.rowCount > 0) {
          guestId = existingGuest.rows[0].id;
        }
      }
      
      if (!guestId) {
        const newGuest = await client.query(`
          INSERT INTO hotel_guests (tenant_id, full_name, email, phone)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [tenantId, guest.full_name, guest.email, guest.phone]);
        guestId = newGuest.rows[0].id;
      }
      
      // Calculate nights and total
      const nights = Math.ceil((new Date(guest.departure_date) - new Date(guest.arrival_date)) / (1000 * 60 * 60 * 24));
      const totalAmount = parseFloat(guest.rate_per_night) * nights;
      
      // Create booking
      const bookingId = uuidv4();
      const confirmationNumber = `${group.group_code}-${bookings.length + 1}`;
      
      await client.query(`
        INSERT INTO hotel_bookings (id, tenant_id, guest_id, room_id, check_in_date, check_out_date, status, total_amount, source, group_id, confirmation_number)
        VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, 'group_pickup', $8, $9)
      `, [bookingId, tenantId, guestId, guest.room_id, guest.arrival_date, guest.departure_date, totalAmount, id, confirmationNumber]);
      
      // Link booking to group room
      await client.query(`
        UPDATE hotel_group_rooms SET booking_id = $1, picked_up_at = NOW() WHERE id = $2
      `, [bookingId, guest.group_room_id]);
      
      // Update guest record
      await client.query(`
        UPDATE hotel_group_guests SET status = 'picked_up', updated_at = NOW() WHERE id = $1
      `, [guest.id]);
      
      bookings.push({ id: bookingId, guest_name: guest.full_name, confirmation_number: confirmationNumber });
    }
    
    // Update group status if all rooms picked up
    const remainingRes = await client.query(`
      SELECT COUNT(*) FROM hotel_group_rooms WHERE group_id = $1 AND booking_id IS NULL
    `, [id]);
    
    if (parseInt(remainingRes.rows[0].count) === 0) {
      await client.query(`
        UPDATE hotel_group_reservations SET status = 'picked_up', updated_at = NOW() WHERE id = $1
      `, [id]);
    } else {
      await client.query(`
        UPDATE hotel_group_reservations SET status = 'definite', updated_at = NOW() WHERE id = $1 AND status = 'tentative'
      `, [id]);
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      picked_up: bookings.length,
      bookings 
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// CUTOFF MANAGEMENT
// ============================================

app.post('/groups/:id/release', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { room_ids } = req.body; // Optional: specific rooms to release
    
    await client.query('BEGIN');
    
    let releaseQuery = `
      DELETE FROM hotel_group_rooms 
      WHERE group_id = $1 AND tenant_id = $2 AND booking_id IS NULL
    `;
    const params = [id, tenantId];
    
    if (room_ids && room_ids.length > 0) {
      releaseQuery += ' AND id = ANY($3)';
      params.push(room_ids);
    }
    
    releaseQuery += ' RETURNING id';
    
    const result = await client.query(releaseQuery, params);
    
    // Update group room count
    await client.query(`
      UPDATE hotel_group_reservations 
      SET total_rooms = (SELECT COUNT(*) FROM hotel_group_rooms WHERE group_id = $1),
          updated_at = NOW()
      WHERE id = $1
    `, [id]);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.group_reservations.cutoff_reached.v1', 1, {
      group_id: id,
      rooms_released: result.rowCount
    });
    
    res.json({ success: true, released: result.rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// GROUP BILLING
// ============================================

app.get('/groups/:id/billing', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    // Get group with billing info
    const groupRes = await query(`
      SELECT g.*, 
             COALESCE(SUM(b.total_amount), 0) as total_booked_amount,
             COALESCE(SUM(b.paid_amount), 0) as total_paid_amount
      FROM hotel_group_reservations g
      LEFT JOIN hotel_bookings b ON b.group_id = g.id
      WHERE g.id = $1 AND g.tenant_id = $2
      GROUP BY g.id
    `, [id, tenantId]);
    
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const group = groupRes.rows[0];
    
    // Get individual booking charges if split billing
    const bookingsRes = await query(`
      SELECT b.id, b.confirmation_number, g.full_name as guest_name, r.room_number,
             b.total_amount, b.paid_amount, b.payment_status
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.group_id = $1 AND b.tenant_id = $2
      ORDER BY r.room_number
    `, [id, tenantId]);
    
    // Get group-level charges (events, F&B, etc.)
    const chargesRes = await query(`
      SELECT * FROM hotel_group_charges WHERE group_id = $1 AND tenant_id = $2
      ORDER BY charge_date DESC
    `, [id, tenantId]);
    
    res.json({
      success: true,
      billing: {
        group_code: group.group_code,
        group_name: group.group_name,
        billing_type: group.billing_type,
        estimated_revenue: parseFloat(group.estimated_revenue),
        total_booked: parseFloat(group.total_booked_amount),
        total_paid: parseFloat(group.total_paid_amount),
        balance: parseFloat(group.total_booked_amount) - parseFloat(group.total_paid_amount),
        deposit_required: parseFloat(group.deposit_required || 0),
        bookings: bookingsRes.rows,
        additional_charges: chargesRes.rows
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// STATUS UPDATES
// ============================================

app.patch('/groups/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['tentative', 'definite', 'cancelled', 'picked_up', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await query(`
      UPDATE hotel_group_reservations SET status = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [status, id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ success: true, group: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'tentative') as tentative_groups,
        COUNT(*) FILTER (WHERE status = 'definite') as definite_groups,
        COUNT(*) FILTER (WHERE arrival_date >= CURRENT_DATE AND arrival_date <= CURRENT_DATE + INTERVAL '30 days') as arriving_next_30_days,
        SUM(total_rooms) FILTER (WHERE status IN ('tentative', 'definite')) as total_blocked_rooms,
        SUM(estimated_revenue) FILTER (WHERE status IN ('tentative', 'definite')) as total_estimated_revenue
      FROM hotel_group_reservations
      WHERE tenant_id = $1
    `, [tenantId]);
    
    res.json({ success: true, stats: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded', nats: natsReady }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8933;
app.listen(PORT, () => {
  console.log(`✅ Group Reservations Service listening on ${PORT}`);
});
