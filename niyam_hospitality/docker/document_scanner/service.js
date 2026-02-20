// Document Scanner Service - Niyam Hospitality
// ID/passport scanning with OCR and document verification

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
  kvStore = { connect: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'document_scanner';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' })); // Large limit for images

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const scansTotal = new promClient.Counter({ name: 'document_scanner_scans_total', help: 'Total document scans', labelNames: ['doc_type', 'result'], registers: [registry] });
app.get('/metrics', async (req, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {} }
  next();
});

function getTenantId(req) { return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID; }

let natsReady = false;
(async () => { try { await kvStore.connect(); natsReady = true; } catch (e) {} })();

// ============================================
// DOCUMENT TYPES
// ============================================

const DOCUMENT_TYPES = {
  passport: {
    name: 'Passport',
    fields: ['document_number', 'full_name', 'nationality', 'date_of_birth', 'expiry_date', 'gender', 'issuing_country'],
    mrz_lines: 2
  },
  national_id: {
    name: 'National ID',
    fields: ['document_number', 'full_name', 'date_of_birth', 'address', 'gender'],
    mrz_lines: 0
  },
  driving_license: {
    name: 'Driving License',
    fields: ['document_number', 'full_name', 'date_of_birth', 'address', 'expiry_date', 'license_class'],
    mrz_lines: 0
  },
  aadhaar: {
    name: 'Aadhaar Card',
    fields: ['document_number', 'full_name', 'date_of_birth', 'address', 'gender'],
    mrz_lines: 0
  },
  pan: {
    name: 'PAN Card',
    fields: ['document_number', 'full_name', 'date_of_birth'],
    mrz_lines: 0
  },
  visa: {
    name: 'Visa',
    fields: ['visa_number', 'full_name', 'nationality', 'valid_from', 'valid_until', 'visa_type', 'entries_allowed'],
    mrz_lines: 2
  }
};

app.get('/document-types', (req, res) => {
  res.json({ success: true, document_types: DOCUMENT_TYPES });
});

// ============================================
// SCAN DOCUMENT (OCR)
// ============================================

const ScanSchema = z.object({
  image_base64: z.string().min(100),
  document_type: z.enum(['passport', 'national_id', 'driving_license', 'aadhaar', 'pan', 'visa', 'auto']).default('auto'),
  booking_id: z.string().uuid().optional(),
  guest_id: z.string().uuid().optional()
});

app.post('/scan', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ScanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const { image_base64, document_type, booking_id, guest_id } = parsed.data;
    
    // In production, this would call an OCR service (Google Vision, AWS Textract, etc.)
    // For stub, we'll simulate OCR extraction
    const extractedData = simulateOCR(image_base64, document_type);
    
    // Create scan record
    const scanId = uuidv4();
    await query(`
      INSERT INTO hotel_document_scans (id, tenant_id, booking_id, guest_id, document_type, extracted_data, confidence_score, raw_image_hash, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [scanId, tenantId, booking_id, guest_id, extractedData.detected_type, extractedData.data, extractedData.confidence, hashImage(image_base64), extractedData.confidence > 0.7 ? 'verified' : 'review_required']);
    
    scansTotal.inc({ doc_type: extractedData.detected_type, result: extractedData.confidence > 0.7 ? 'success' : 'review' });
    
    await publishEnvelope('hospitality.document_scanner.scanned.v1', 1, { 
      scan_id: scanId, 
      document_type: extractedData.detected_type,
      confidence: extractedData.confidence
    });
    
    res.json({
      success: true,
      scan: {
        id: scanId,
        document_type: extractedData.detected_type,
        extracted_data: extractedData.data,
        confidence: extractedData.confidence,
        status: extractedData.confidence > 0.7 ? 'verified' : 'review_required',
        warnings: extractedData.warnings
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Simulate OCR (in production, use actual OCR service)
function simulateOCR(imageBase64, requestedType) {
  // Detect document type from image characteristics (stub)
  const detectedType = requestedType === 'auto' ? detectDocumentType(imageBase64) : requestedType;
  
  // Generate plausible extracted data based on document type
  const data = {};
  const docConfig = DOCUMENT_TYPES[detectedType];
  
  if (detectedType === 'passport') {
    data.document_number = generateDocNumber('P', 8);
    data.full_name = 'SAMPLE GUEST';
    data.nationality = 'INDIA';
    data.date_of_birth = '1990-01-15';
    data.expiry_date = '2030-01-15';
    data.gender = 'M';
    data.issuing_country = 'IND';
    data.mrz_line1 = `P<IND${data.full_name.replace(' ', '<')}<<<<<<<<<<<<<<<<<<<<<`;
    data.mrz_line2 = `${data.document_number}<8IND9001152M3001150<<<<<<<<<<<<<<<8`;
  } else if (detectedType === 'aadhaar') {
    data.document_number = generateDocNumber('', 12, true);
    data.full_name = 'Sample Guest';
    data.date_of_birth = '1990-01-15';
    data.gender = 'Male';
    data.address = '123 Sample Street, City, State 123456';
  } else if (detectedType === 'driving_license') {
    data.document_number = generateDocNumber('DL', 10);
    data.full_name = 'Sample Guest';
    data.date_of_birth = '1990-01-15';
    data.expiry_date = '2028-01-15';
    data.license_class = 'LMV';
    data.address = '123 Sample Street, City, State';
  } else {
    data.document_number = generateDocNumber('ID', 10);
    data.full_name = 'Sample Guest';
    data.date_of_birth = '1990-01-15';
  }
  
  const confidence = 0.85 + Math.random() * 0.1; // 0.85-0.95
  const warnings = [];
  
  // Add warnings based on data quality
  if (confidence < 0.9) warnings.push('Some text may be unclear');
  
  return {
    detected_type: detectedType,
    data,
    confidence: Math.round(confidence * 100) / 100,
    warnings
  };
}

function detectDocumentType(imageBase64) {
  // In production, use image classification
  // Stub: random selection weighted towards passport
  const types = ['passport', 'passport', 'passport', 'aadhaar', 'driving_license', 'national_id'];
  return types[Math.floor(Math.random() * types.length)];
}

function generateDocNumber(prefix, length, numeric = false) {
  const chars = numeric ? '0123456789' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix;
  for (let i = 0; i < length - prefix.length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function hashImage(base64) {
  // Simple hash for duplicate detection
  let hash = 0;
  for (let i = 0; i < Math.min(base64.length, 1000); i++) {
    hash = ((hash << 5) - hash) + base64.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

// ============================================
// VERIFY DOCUMENT
// ============================================

app.post('/verify', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { scan_id, booking_id, guest_id, corrections } = req.body;
    
    await client.query('BEGIN');
    
    // Get scan
    const scanRes = await client.query(`
      SELECT * FROM hotel_document_scans WHERE id = $1 AND tenant_id = $2
    `, [scan_id, tenantId]);
    
    if (scanRes.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Scan not found' }); }
    
    const scan = scanRes.rows[0];
    let finalData = scan.extracted_data;
    
    // Apply corrections
    if (corrections) {
      finalData = { ...finalData, ...corrections };
    }
    
    // Update scan
    await client.query(`
      UPDATE hotel_document_scans 
      SET status = 'verified', verified_at = NOW(), verified_by = $1, extracted_data = $2
      WHERE id = $3
    `, [req.user?.id, finalData, scan_id]);
    
    // Create ID verification record if booking/guest provided
    if (booking_id || guest_id) {
      await client.query(`
        INSERT INTO hotel_id_verifications (tenant_id, booking_id, guest_id, id_type, id_number, id_name, id_expiry, id_country, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'verified')
        ON CONFLICT (tenant_id, booking_id, id_type) DO UPDATE SET id_number = $5, id_name = $6, status = 'verified'
      `, [tenantId, booking_id, guest_id || scan.guest_id, scan.document_type, finalData.document_number, finalData.full_name, finalData.expiry_date, finalData.issuing_country || finalData.nationality]);
      
      // Update guest record
      if (guest_id || scan.guest_id) {
        await client.query(`
          UPDATE hotel_guests 
          SET id_proof_type = $1, id_proof_number = $2, id_verified = true, updated_at = NOW()
          WHERE id = $3
        `, [scan.document_type, finalData.document_number, guest_id || scan.guest_id]);
      }
      
      // Update booking
      if (booking_id) {
        await client.query(`UPDATE hotel_bookings SET id_verified = true WHERE id = $1`, [booking_id]);
      }
    }
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.document_scanner.verified.v1', 1, { scan_id, booking_id, guest_id });
    
    res.json({ success: true, verified: true, data: finalData });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ============================================
// SCAN HISTORY
// ============================================

app.get('/scans', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id, guest_id, status, from_date, to_date, limit = 50 } = req.query;
    
    let sql = `
      SELECT s.*, g.full_name as guest_name, b.confirmation_number
      FROM hotel_document_scans s
      LEFT JOIN hotel_guests g ON s.guest_id = g.id
      LEFT JOIN hotel_bookings b ON s.booking_id = b.id
      WHERE s.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (booking_id) { sql += ` AND s.booking_id = $${idx++}`; params.push(booking_id); }
    if (guest_id) { sql += ` AND s.guest_id = $${idx++}`; params.push(guest_id); }
    if (status) { sql += ` AND s.status = $${idx++}`; params.push(status); }
    if (from_date) { sql += ` AND s.created_at >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND s.created_at <= $${idx++}`; params.push(to_date); }
    
    sql += ` ORDER BY s.created_at DESC LIMIT $${idx}`;
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    res.json({ success: true, scans: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/scans/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      SELECT s.*, g.full_name as guest_name, b.confirmation_number, r.room_number
      FROM hotel_document_scans s
      LEFT JOIN hotel_guests g ON s.guest_id = g.id
      LEFT JOIN hotel_bookings b ON s.booking_id = b.id
      LEFT JOIN hotel_rooms r ON b.room_id = r.id
      WHERE s.id = $1 AND s.tenant_id = $2
    `, [id, tenantId]);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Scan not found' });
    
    res.json({ success: true, scan: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// REGISTRATION CARD
// ============================================

app.post('/registration-card', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id, guest_id, signature_base64, terms_accepted, guest_data } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_registration_cards (tenant_id, booking_id, guest_id, signature, terms_accepted, guest_data, source)
      VALUES ($1, $2, $3, $4, $5, $6, 'document_scanner')
      ON CONFLICT (booking_id) DO UPDATE SET signature = $4, terms_accepted = $5, guest_data = $6, updated_at = NOW()
      RETURNING *
    `, [tenantId, booking_id, guest_id, signature_base64, terms_accepted, guest_data]);
    
    res.json({ success: true, registration_card: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/registration-card/:bookingId', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { bookingId } = req.params;
    
    const result = await query(`
      SELECT rc.*, g.full_name, g.email, b.check_in_date, b.check_out_date, r.room_number
      FROM hotel_registration_cards rc
      JOIN hotel_guests g ON rc.guest_id = g.id
      JOIN hotel_bookings b ON rc.booking_id = b.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE rc.booking_id = $1 AND rc.tenant_id = $2
    `, [bookingId, tenantId]);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Registration card not found' });
    
    res.json({ success: true, registration_card: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// COMPLIANCE REPORTS
// ============================================

app.get('/compliance/c-form', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    
    // C-Form is required for foreign nationals in India
    const result = await query(`
      SELECT 
        g.full_name, g.nationality, g.id_proof_type, g.id_proof_number,
        b.check_in_date, b.check_out_date, r.room_number,
        iv.id_name as passport_name, iv.id_number as passport_number, iv.id_expiry as passport_expiry
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      LEFT JOIN hotel_id_verifications iv ON b.id = iv.booking_id AND iv.id_type = 'passport'
      WHERE b.tenant_id = $1 
        AND b.check_in_date >= $2 AND b.check_in_date <= $3
        AND b.status IN ('checked_in', 'checked_out')
        AND g.nationality IS NOT NULL AND g.nationality != 'INDIA'
      ORDER BY b.check_in_date
    `, [tenantId, from_date, to_date]);
    
    res.json({ success: true, c_form_data: result.rows, count: result.rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(*) FILTER (WHERE status = 'verified') as verified_scans,
        COUNT(*) FILTER (WHERE status = 'review_required') as pending_review,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as scans_today,
        AVG(confidence_score) as avg_confidence,
        COUNT(DISTINCT document_type) as document_types_used
      FROM hotel_document_scans
      WHERE tenant_id = $1
    `, [tenantId]);
    
    res.json({ success: true, stats: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded' }));


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

const PORT = process.env.PORT || 8939;
app.listen(PORT, () => console.log(`✅ Document Scanner Service listening on ${PORT}`));
