// Routes for QR Code Generator (Docker/PostgreSQL version)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { PRODUCT_CATALOG_URL, DEFAULT_TENANT_ID } = require('../config/constants');

let dbReady = false;
let startTime = Date.now();

const setDbReady = (val) => { dbReady = val; };
const setStarted = (val) => { startTime = val; };

// Health Router
const healthRouter = express.Router();

healthRouter.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'qr_code_generator',
    mode: 'docker',
    dbReady,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

healthRouter.get('/ready', (req, res) => {
  if (dbReady) {
    res.json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

// Settings Router
const settingsRouter = express.Router();

settingsRouter.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    let result = await query(
      'SELECT * FROM qr_settings WHERE tenant_id = $1 LIMIT 1',
      [tenantId]
    );
    
    if (result.rows.length === 0) {
      // Create default settings
      await query(
        `INSERT INTO qr_settings (id, tenant_id, business_name, base_url, default_branding)
         VALUES ($1, $2, $3, $4, $5)`,
        ['default', tenantId, 'My Business', 'http://localhost:8852', JSON.stringify({
          foreground_color: '#000000',
          background_color: '#FFFFFF',
          error_correction: 'M',
          size: 300
        })]
      );
      result = await query('SELECT * FROM qr_settings WHERE tenant_id = $1', [tenantId]);
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRouter.put('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { business_name, base_url, default_branding } = req.body;
    
    await query(
      `UPDATE qr_settings SET business_name = $1, base_url = $2, default_branding = $3, updated_at = NOW()
       WHERE tenant_id = $4`,
      [business_name, base_url, JSON.stringify(default_branding), tenantId]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// QR Router
const qrRouter = express.Router();

// List QR codes
qrRouter.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { type, search, limit = 100, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM qr_codes WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;
    
    if (type) {
      sql += ` AND type = $${paramIndex++}`;
      params.push(type);
    }
    if (search) {
      sql += ` AND (label ILIKE $${paramIndex} OR target_url ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single QR
qrRouter.get('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const result = await query(
      'SELECT * FROM qr_codes WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create QR
qrRouter.post('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { type, label, target_url, metadata, branding } = req.body;
    
    if (!type || !label) {
      return res.status(400).json({ success: false, error: 'type and label are required' });
    }
    
    // Get base URL from settings
    const settingsResult = await query(
      'SELECT base_url FROM qr_settings WHERE tenant_id = $1',
      [tenantId]
    );
    const baseUrl = settingsResult.rows[0]?.base_url || 'http://localhost:8852';
    
    // Determine final target URL
    let finalTargetUrl = target_url;
    if (!finalTargetUrl) {
      if (['product', 'maker', 'custom'].includes(type)) {
        finalTargetUrl = metadata?.custom_url || metadata?.product_url || '';
      } else if (type === 'payment') {
        finalTargetUrl = buildUPIUrl(metadata, settingsResult.rows[0]?.business_name);
      } else if (type === 'vcard') {
        finalTargetUrl = buildVCardData(metadata);
      } else if (type === 'wifi') {
        finalTargetUrl = buildWiFiData(metadata);
      } else if (type === 'text') {
        finalTargetUrl = metadata?.plain_text || '';
      }
    }
    
    const id = uuidv4();
    await query(
      `INSERT INTO qr_codes (id, tenant_id, type, label, target_url, metadata, branding, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, tenantId, type, label, finalTargetUrl, JSON.stringify(metadata || {}), JSON.stringify(branding || {}), req.userId]
    );
    
    // Publish NATS event for QR creation
    try {
      await publishEnvelope('retail.qr.created.v1', 1, {
        qr_id: id,
        type,
        label,
        target_url: finalTargetUrl,
        tenant_id: tenantId,
        created_by: req.userId,
        created_at: new Date().toISOString(),
        metadata: metadata || {}
      });
    } catch (natsErr) {
      console.warn('[QR] NATS publish failed (non-blocking):', natsErr.message);
    }
    
    res.json({ success: true, data: { id, redirect_url: `${baseUrl}/qr/r/${id}` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update QR
qrRouter.put('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { label, target_url, metadata, branding } = req.body;
    
    const existing = await query(
      'SELECT * FROM qr_codes WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }
    
    await query(
      `UPDATE qr_codes SET label = COALESCE($1, label), target_url = COALESCE($2, target_url),
       metadata = COALESCE($3, metadata), branding = COALESCE($4, branding), updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6`,
      [label, target_url, metadata ? JSON.stringify(metadata) : null, branding ? JSON.stringify(branding) : null, req.params.id, tenantId]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete QR
qrRouter.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    await query('DELETE FROM qr_codes WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get QR image
qrRouter.get('/:id/image', async (req, res) => {
  try {
    const { format = 'png', size = 300 } = req.query;
    
    // No tenant check for image - allow public access
    const result = await query('SELECT * FROM qr_codes WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }
    
    const qr = result.rows[0];
    const branding = qr.branding || {};
    
    // Get base URL
    const settingsResult = await query(
      'SELECT base_url FROM qr_settings WHERE tenant_id = $1',
      [qr.tenant_id]
    );
    const baseUrl = settingsResult.rows[0]?.base_url || 'http://localhost:8852';
    
    // Determine QR data
    let qrData = qr.target_url;
    if (['product', 'maker', 'custom'].includes(qr.type)) {
      qrData = `${baseUrl}/qr/r/${qr.id}`;
    }
    
    const qrOptions = {
      width: parseInt(size) || branding.size || 300,
      margin: 2,
      color: {
        dark: branding.foreground_color || '#000000',
        light: branding.background_color || '#FFFFFF'
      },
      errorCorrectionLevel: branding.error_correction || 'M'
    };
    
    if (format === 'svg') {
      const svg = await QRCode.toString(qrData, { ...qrOptions, type: 'svg' });
      res.type('image/svg+xml').send(svg);
    } else {
      const buffer = await QRCode.toBuffer(qrData, qrOptions);
      res.type('image/png').send(buffer);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Redirect Router (public - no auth)
const redirectRouter = express.Router();

redirectRouter.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM qr_codes WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('QR Code not found');
    }
    
    const qr = result.rows[0];
    const scanId = uuidv4();
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const referrer = req.headers.referer || '';
    
    // Log the scan to database
    await query(
      `INSERT INTO qr_scan_log (id, qr_id, tenant_id, user_agent, ip_address, referrer)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [scanId, qr.id, qr.tenant_id, userAgent, ipAddress, referrer]
    );
    
    // Increment scan count
    await query('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = $1', [qr.id]);
    
    // Publish NATS event for real-time analytics
    try {
      await publishEnvelope('retail.qr.scanned.v1', 1, {
        scan_id: scanId,
        qr_id: qr.id,
        qr_type: qr.type,
        qr_label: qr.label,
        tenant_id: qr.tenant_id,
        target_url: qr.target_url,
        user_agent: userAgent,
        ip_address: ipAddress,
        referrer: referrer,
        scanned_at: new Date().toISOString(),
        metadata: qr.metadata
      });
    } catch (natsErr) {
      console.warn('[QR] NATS publish failed (non-blocking):', natsErr.message);
    }
    
    res.redirect(302, qr.target_url);
  } catch (err) {
    res.status(500).send('Error processing QR redirect');
  }
});

// Bulk Router
const bulkRouter = express.Router();

bulkRouter.post('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { product_ids, type = 'product', branding } = req.body;
    
    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'product_ids array is required' });
    }
    
    const settingsResult = await query('SELECT base_url FROM qr_settings WHERE tenant_id = $1', [tenantId]);
    const baseUrl = settingsResult.rows[0]?.base_url || 'http://localhost:8852';
    
    const createdIds = [];
    
    for (const productId of product_ids) {
      const id = uuidv4();
      const label = `Product ${productId}`;
      const targetUrl = `${baseUrl}/product/${productId}`;
      
      await query(
        `INSERT INTO qr_codes (id, tenant_id, type, label, target_url, metadata, branding, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, tenantId, type, label, targetUrl, JSON.stringify({ product_id: productId }), JSON.stringify(branding || {}), req.userId]
      );
      
      createdIds.push(id);
    }
    
    res.json({ success: true, data: { created: createdIds.length, ids: createdIds } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Router
const exportRouter = express.Router();

exportRouter.post('/pdf', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { qr_ids, columns = 3 } = req.body;
    
    if (!qr_ids || !Array.isArray(qr_ids) || qr_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'qr_ids array is required' });
    }
    
    const settingsResult = await query('SELECT base_url FROM qr_settings WHERE tenant_id = $1', [tenantId]);
    const baseUrl = settingsResult.rows[0]?.base_url || 'http://localhost:8852';
    
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=qr_codes.pdf');
    doc.pipe(res);
    
    const pageWidth = 595 - 60;
    const qrSize = Math.floor(pageWidth / columns) - 10;
    let x = 30, y = 30;
    let count = 0;
    
    for (const qrId of qr_ids) {
      const result = await query('SELECT * FROM qr_codes WHERE id = $1 AND tenant_id = $2', [qrId, tenantId]);
      if (result.rows.length === 0) continue;
      
      const qr = result.rows[0];
      const branding = qr.branding || {};
      
      let qrData = qr.target_url;
      if (['product', 'maker', 'custom'].includes(qr.type)) {
        qrData = `${baseUrl}/qr/r/${qr.id}`;
      }
      
      const qrBuffer = await QRCode.toBuffer(qrData, {
        width: qrSize,
        margin: 1,
        color: {
          dark: branding.foreground_color || '#000000',
          light: branding.background_color || '#FFFFFF'
        }
      });
      
      doc.image(qrBuffer, x, y, { width: qrSize });
      doc.fontSize(8).text(qr.label, x, y + qrSize + 2, { width: qrSize, align: 'center' });
      
      x += qrSize + 10;
      count++;
      
      if (count % columns === 0) {
        x = 30;
        y += qrSize + 30;
        
        if (y > 750) {
          doc.addPage();
          y = 30;
        }
      }
    }
    
    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

exportRouter.post('/zip', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const { qr_ids, size = 300 } = req.body;
    
    if (!qr_ids || !Array.isArray(qr_ids) || qr_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'qr_ids array is required' });
    }
    
    const settingsResult = await query('SELECT base_url FROM qr_settings WHERE tenant_id = $1', [tenantId]);
    const baseUrl = settingsResult.rows[0]?.base_url || 'http://localhost:8852';
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=qr_codes.zip');
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    for (const qrId of qr_ids) {
      const result = await query('SELECT * FROM qr_codes WHERE id = $1 AND tenant_id = $2', [qrId, tenantId]);
      if (result.rows.length === 0) continue;
      
      const qr = result.rows[0];
      const branding = qr.branding || {};
      
      let qrData = qr.target_url;
      if (['product', 'maker', 'custom'].includes(qr.type)) {
        qrData = `${baseUrl}/qr/r/${qr.id}`;
      }
      
      const qrBuffer = await QRCode.toBuffer(qrData, {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: branding.foreground_color || '#000000',
          light: branding.background_color || '#FFFFFF'
        }
      });
      
      const filename = qr.label.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      archive.append(qrBuffer, { name: `${filename}_${qr.id.substring(0, 8)}.png` });
    }
    
    await archive.finalize();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Analytics Router
const analyticsRouter = express.Router();

analyticsRouter.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    
    const totalQRs = await query('SELECT COUNT(*) as count FROM qr_codes WHERE tenant_id = $1', [tenantId]);
    const totalScans = await query('SELECT COALESCE(SUM(scan_count), 0) as total FROM qr_codes WHERE tenant_id = $1', [tenantId]);
    const scansThisWeek = await query(
      `SELECT COUNT(*) as count FROM qr_scan_log WHERE tenant_id = $1 AND scanned_at > NOW() - INTERVAL '7 days'`,
      [tenantId]
    );
    const topQRs = await query(
      'SELECT id, label, type, scan_count FROM qr_codes WHERE tenant_id = $1 ORDER BY scan_count DESC LIMIT 5',
      [tenantId]
    );
    const byType = await query(
      'SELECT type, COUNT(*) as count FROM qr_codes WHERE tenant_id = $1 GROUP BY type',
      [tenantId]
    );
    
    res.json({
      success: true,
      data: {
        total_qrs: parseInt(totalQRs.rows[0]?.count || 0),
        total_scans: parseInt(totalScans.rows[0]?.total || 0),
        scans_this_week: parseInt(scansThisWeek.rows[0]?.count || 0),
        top_qrs: topQRs.rows,
        by_type: byType.rows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

analyticsRouter.get('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    
    const qr = await query('SELECT * FROM qr_codes WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (qr.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }
    
    const recentScans = await query(
      `SELECT scanned_at, user_agent, ip_address FROM qr_scan_log WHERE qr_id = $1 ORDER BY scanned_at DESC LIMIT 50`,
      [req.params.id]
    );
    
    const scansByDay = await query(
      `SELECT DATE(scanned_at) as date, COUNT(*) as count FROM qr_scan_log 
       WHERE qr_id = $1 GROUP BY DATE(scanned_at) ORDER BY date DESC LIMIT 30`,
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: {
        qr_id: qr.rows[0].id,
        label: qr.rows[0].label,
        total_scans: qr.rows[0].scan_count,
        recent_scans: recentScans.rows,
        scans_by_day: scansByDay.rows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Products Router (integration)
const productsRouter = express.Router();

productsRouter.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    
    // First try local products table (if exists)
    try {
      const localResult = await query(
        `SELECT id, sku, name, price, barcode, category FROM products 
         WHERE tenant_id = $1 AND active = true LIMIT 500`,
        [tenantId]
      );
      
      if (localResult.rows.length > 0) {
        return res.json({ success: true, data: localResult.rows, source: 'local' });
      }
    } catch (localErr) {
      // Products table may not exist, continue to catalog service
    }
    
    // Try to fetch from product catalog service
    const fetch = require('node-fetch');
    const response = await fetch(`${PRODUCT_CATALOG_URL}/api/products`, {
      headers: { 'X-Tenant-ID': tenantId }
    });
    
    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, data: data.data || [], source: 'catalog' });
    }
    
    res.json({ success: true, data: [], source: 'none' });
  } catch (err) {
    res.json({ success: true, data: [], source: 'error', message: err.message });
  }
});

// Helper functions
function buildUPIUrl(metadata, businessName) {
  const { upi_id, amount, currency = 'INR', note } = metadata || {};
  if (!upi_id) return '';
  
  let url = `upi://pay?pa=${encodeURIComponent(upi_id)}`;
  if (businessName) url += `&pn=${encodeURIComponent(businessName)}`;
  if (amount) url += `&am=${amount}`;
  url += `&cu=${currency}`;
  if (note) url += `&tn=${encodeURIComponent(note)}`;
  
  return url;
}

function buildVCardData(metadata) {
  const { vcard_name, vcard_phone, vcard_email, vcard_company, vcard_title, vcard_url } = metadata || {};
  
  let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
  if (vcard_name) vcard += `FN:${vcard_name}\n`;
  if (vcard_phone) vcard += `TEL:${vcard_phone}\n`;
  if (vcard_email) vcard += `EMAIL:${vcard_email}\n`;
  if (vcard_company) vcard += `ORG:${vcard_company}\n`;
  if (vcard_title) vcard += `TITLE:${vcard_title}\n`;
  if (vcard_url) vcard += `URL:${vcard_url}\n`;
  vcard += 'END:VCARD';
  
  return vcard;
}

function buildWiFiData(metadata) {
  const { wifi_ssid, wifi_password, wifi_encryption = 'WPA', wifi_hidden = false } = metadata || {};
  if (!wifi_ssid) return '';
  
  let data = `WIFI:T:${wifi_encryption};S:${wifi_ssid};`;
  if (wifi_password) data += `P:${wifi_password};`;
  if (wifi_hidden) data += 'H:true;';
  data += ';';
  
  return data;
}

module.exports = {
  healthRouter,
  settingsRouter,
  qrRouter,
  redirectRouter,
  bulkRouter,
  exportRouter,
  analyticsRouter,
  productsRouter,
  setDbReady,
  setStarted
};
