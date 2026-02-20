// Concierge Services - Niyam Hospitality
// Handles guest requests, bookings, transport, and recommendations

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'concierge_services';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
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

// In-memory storage for requests (would be DB table in production)
const guestRequests = new Map();
let requestIdCounter = 1000;

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// GUEST REQUESTS
// ============================================

app.get('/requests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, room_number, category } = req.query;
    
    let requests = Array.from(guestRequests.values())
      .filter(r => r.tenant_id === tenantId);
    
    if (status) requests = requests.filter(r => r.status === status);
    if (room_number) requests = requests.filter(r => r.room_number === room_number);
    if (category) requests = requests.filter(r => r.category === category);
    
    requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({ success: true, requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/requests/:id', async (req, res) => {
  try {
    const request = guestRequests.get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true, request });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const RequestSchema = z.object({
  room_number: z.string(),
  guest_name: z.string(),
  category: z.enum(['housekeeping', 'maintenance', 'amenities', 'transport', 'dining', 'spa', 'tours', 'other']),
  description: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  scheduled_time: z.string().optional()
});

app.post('/requests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const requestId = `REQ-${++requestIdCounter}`;
    
    const request = {
      id: requestId,
      tenant_id: tenantId,
      ...data,
      status: 'pending',
      assigned_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    guestRequests.set(requestId, request);
    
    await publishEnvelope('hospitality.concierge.request_created.v1', 1, {
      request_id: requestId,
      room_number: data.room_number,
      category: data.category,
      priority: data.priority
    });
    
    res.json({ success: true, request });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/requests/:id', async (req, res) => {
  try {
    const request = guestRequests.get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    
    const { status, assigned_to, notes } = req.body;
    
    if (status) request.status = status;
    if (assigned_to) request.assigned_to = assigned_to;
    if (notes) request.notes = notes;
    request.updated_at = new Date().toISOString();
    
    if (status === 'completed') {
      request.completed_at = new Date().toISOString();
    }
    
    guestRequests.set(req.params.id, request);
    
    await publishEnvelope('hospitality.concierge.request_updated.v1', 1, {
      request_id: req.params.id,
      status: request.status
    });
    
    res.json({ success: true, request });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// TRANSPORT BOOKINGS
// ============================================

const transportBookings = new Map();
let transportIdCounter = 100;

app.get('/transport', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { date, status } = req.query;
    
    let bookings = Array.from(transportBookings.values())
      .filter(b => b.tenant_id === tenantId);
    
    if (date) bookings = bookings.filter(b => b.pickup_date === date);
    if (status) bookings = bookings.filter(b => b.status === status);
    
    bookings.sort((a, b) => new Date(a.pickup_time) - new Date(b.pickup_time));
    
    res.json({ success: true, bookings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const TransportSchema = z.object({
  room_number: z.string(),
  guest_name: z.string(),
  type: z.enum(['airport_pickup', 'airport_drop', 'city_tour', 'point_to_point', 'car_rental']),
  pickup_location: z.string(),
  drop_location: z.string(),
  pickup_date: z.string(),
  pickup_time: z.string(),
  passengers: z.number().min(1).default(1),
  vehicle_type: z.enum(['sedan', 'suv', 'van', 'luxury']).default('sedan'),
  special_requests: z.string().optional()
});

app.post('/transport', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TransportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const bookingId = `TRN-${++transportIdCounter}`;
    
    // Calculate estimated cost
    const basePrices = { sedan: 50, suv: 75, van: 100, luxury: 150 };
    const typeMultipliers = { airport_pickup: 1, airport_drop: 1, city_tour: 2, point_to_point: 1.5, car_rental: 3 };
    const estimatedCost = basePrices[data.vehicle_type] * typeMultipliers[data.type];
    
    const booking = {
      id: bookingId,
      tenant_id: tenantId,
      ...data,
      estimated_cost: estimatedCost,
      status: 'confirmed',
      driver: null,
      vehicle_number: null,
      created_at: new Date().toISOString()
    };
    
    transportBookings.set(bookingId, booking);
    
    await publishEnvelope('hospitality.concierge.transport_booked.v1', 1, {
      booking_id: bookingId,
      room_number: data.room_number,
      type: data.type
    });
    
    res.json({ success: true, booking });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/transport/:id', async (req, res) => {
  try {
    const booking = transportBookings.get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    
    const { status, driver, vehicle_number } = req.body;
    
    if (status) booking.status = status;
    if (driver) booking.driver = driver;
    if (vehicle_number) booking.vehicle_number = vehicle_number;
    booking.updated_at = new Date().toISOString();
    
    transportBookings.set(req.params.id, booking);
    
    res.json({ success: true, booking });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// RECOMMENDATIONS
// ============================================

app.get('/recommendations', async (req, res) => {
  try {
    const { category } = req.query;
    
    const recommendations = {
      restaurants: [
        { name: 'The Grand Bistro', cuisine: 'French', rating: 4.5, distance: '0.5 km', priceRange: '$$$' },
        { name: 'Spice Garden', cuisine: 'Indian', rating: 4.3, distance: '1.2 km', priceRange: '$$' },
        { name: 'Sakura', cuisine: 'Japanese', rating: 4.7, distance: '0.8 km', priceRange: '$$$$' }
      ],
      attractions: [
        { name: 'City Museum', type: 'Museum', rating: 4.6, distance: '2 km', duration: '2-3 hours' },
        { name: 'Botanical Gardens', type: 'Nature', rating: 4.4, distance: '3 km', duration: '1-2 hours' },
        { name: 'Old Town Square', type: 'Historic', rating: 4.8, distance: '1.5 km', duration: '1-2 hours' }
      ],
      shopping: [
        { name: 'Central Mall', type: 'Mall', distance: '1 km' },
        { name: 'Artisan Market', type: 'Local Market', distance: '0.5 km' },
        { name: 'Fashion Street', type: 'Shopping District', distance: '2 km' }
      ],
      nightlife: [
        { name: 'Sky Lounge', type: 'Rooftop Bar', rating: 4.5 },
        { name: 'The Jazz Club', type: 'Live Music', rating: 4.3 },
        { name: 'Club Neon', type: 'Nightclub', rating: 4.0 }
      ]
    };
    
    if (category && recommendations[category]) {
      res.json({ success: true, recommendations: recommendations[category] });
    } else {
      res.json({ success: true, recommendations });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// WAKE-UP CALLS
// ============================================

const wakeUpCalls = new Map();

app.get('/wakeup', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const calls = Array.from(wakeUpCalls.values())
      .filter(c => c.tenant_id === tenantId && c.status === 'scheduled')
      .sort((a, b) => a.time.localeCompare(b.time));
    
    res.json({ success: true, wakeup_calls: calls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/wakeup', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_number, guest_name, date, time, notes } = req.body;
    
    const callId = `WU-${Date.now()}`;
    const call = {
      id: callId,
      tenant_id: tenantId,
      room_number,
      guest_name,
      date,
      time,
      notes,
      status: 'scheduled',
      created_at: new Date().toISOString()
    };
    
    wakeUpCalls.set(callId, call);
    
    res.json({ success: true, wakeup_call: call });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/wakeup/:id', async (req, res) => {
  try {
    const call = wakeUpCalls.get(req.params.id);
    if (!call) return res.status(404).json({ error: 'Wake-up call not found' });
    
    call.status = 'cancelled';
    wakeUpCalls.set(req.params.id, call);
    
    res.json({ success: true, message: 'Wake-up call cancelled' });
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
    
    const requests = Array.from(guestRequests.values()).filter(r => r.tenant_id === tenantId);
    const transports = Array.from(transportBookings.values()).filter(t => t.tenant_id === tenantId);
    
    const today = new Date().toISOString().split('T')[0];
    
    res.json({
      success: true,
      stats: {
        pending_requests: requests.filter(r => r.status === 'pending').length,
        in_progress_requests: requests.filter(r => r.status === 'in_progress').length,
        completed_today: requests.filter(r => r.status === 'completed' && r.completed_at?.startsWith(today)).length,
        transport_bookings_today: transports.filter(t => t.pickup_date === today).length,
        urgent_requests: requests.filter(r => r.priority === 'urgent' && r.status !== 'completed').length
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


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

const PORT = process.env.PORT || 8928;
app.listen(PORT, () => {
  console.log(`✅ Concierge Services listening on ${PORT}`);
});
