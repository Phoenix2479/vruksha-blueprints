/**
 * QR Code Generator Service - Lite Version
 * Generates dynamic QR codes with redirect support, bulk generation, and export
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8898;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static files for UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Logo storage directory
const LOGO_DIR = path.join(require('os').homedir(), '.niyam', 'data', 'qr_logos');
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}
app.use('/logos', express.static(LOGO_DIR));

// Product Catalog URL (for integration)
const PRODUCT_CATALOG_URL = process.env.PRODUCT_CATALOG_URL || 'http://localhost:8831';

// ============================================
// Health Check
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qr_code_generator', mode: 'lite', port: PORT });
});

// ============================================
// Settings Endpoints
// ============================================

app.get('/api/settings', (req, res) => {
  try {
    let settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    if (!settings) {
      // Create default settings
      run(`INSERT INTO qr_settings (id, business_name, base_url, default_branding) VALUES (?, ?, ?, ?)`,
        ['default', 'My Business', `http://localhost:${PORT}`, JSON.stringify({
          foreground_color: '#000000',
          background_color: '#FFFFFF',
          error_correction: 'M',
          size: 300,
          logo_path: null,
          logo_size_percent: 20
        })]);
      settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    }
    if (settings.default_branding) {
      settings.default_branding = JSON.parse(settings.default_branding);
    }
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const { business_name, base_url, default_branding } = req.body;
    run(`UPDATE qr_settings SET business_name = ?, base_url = ?, default_branding = ?, updated_at = datetime('now') WHERE id = ?`,
      [business_name, base_url, JSON.stringify(default_branding), 'default']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// QR Code CRUD Endpoints
// ============================================

// List all QR codes
app.get('/api/qr', (req, res) => {
  try {
    const { type, search, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM qr_codes WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (search) {
      sql += ' AND (label LIKE ? OR target_url LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const qrs = query(sql, params);
    
    // Parse JSON fields
    const parsed = qrs.map(qr => ({
      ...qr,
      metadata: qr.metadata ? JSON.parse(qr.metadata) : {},
      branding: qr.branding ? JSON.parse(qr.branding) : {}
    }));

    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single QR code
app.get('/api/qr/:id', (req, res) => {
  try {
    const qr = get('SELECT * FROM qr_codes WHERE id = ?', [req.params.id]);
    if (!qr) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }
    qr.metadata = qr.metadata ? JSON.parse(qr.metadata) : {};
    qr.branding = qr.branding ? JSON.parse(qr.branding) : {};
    res.json({ success: true, data: qr });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create QR code
app.post('/api/qr', (req, res) => {
  try {
    const { type, label, target_url, metadata, branding } = req.body;

    if (!type || !label) {
      return res.status(400).json({ success: false, error: 'type and label are required' });
    }

    const id = uuidv4();
    const settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    const baseUrl = settings?.base_url || `http://localhost:${PORT}`;

    // Determine actual target URL based on type
    let finalTargetUrl = target_url;
    if (!finalTargetUrl) {
      // For dynamic types, the QR points to our redirect endpoint
      if (['product', 'maker', 'custom'].includes(type)) {
        finalTargetUrl = metadata?.custom_url || metadata?.product_url || '';
      } else if (type === 'payment') {
        finalTargetUrl = buildUPIUrl(metadata, settings?.business_name);
      } else if (type === 'vcard') {
        finalTargetUrl = buildVCardData(metadata);
      } else if (type === 'wifi') {
        finalTargetUrl = buildWiFiData(metadata);
      } else if (type === 'text') {
        finalTargetUrl = metadata?.plain_text || '';
      }
    }

    run(`INSERT INTO qr_codes (id, type, label, target_url, metadata, branding) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, type, label, finalTargetUrl, JSON.stringify(metadata || {}), JSON.stringify(branding || {})]);

    res.json({ success: true, data: { id, redirect_url: `${baseUrl}/qr/r/${id}` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update QR code
app.put('/api/qr/:id', (req, res) => {
  try {
    const { label, target_url, metadata, branding } = req.body;
    const existing = get('SELECT * FROM qr_codes WHERE id = ?', [req.params.id]);
    
    if (!existing) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }

    run(`UPDATE qr_codes SET label = ?, target_url = ?, metadata = ?, branding = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        label || existing.label,
        target_url || existing.target_url,
        JSON.stringify(metadata || JSON.parse(existing.metadata || '{}')),
        JSON.stringify(branding || JSON.parse(existing.branding || '{}')),
        req.params.id
      ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete QR code
app.delete('/api/qr/:id', (req, res) => {
  try {
    run('DELETE FROM qr_codes WHERE id = ?', [req.params.id]);
    run('DELETE FROM qr_scan_log WHERE qr_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// QR Image Generation
// ============================================

app.get('/api/qr/:id/image', async (req, res) => {
  try {
    const { format = 'png', size = 300 } = req.query;
    const qr = get('SELECT * FROM qr_codes WHERE id = ?', [req.params.id]);
    
    if (!qr) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }

    const branding = qr.branding ? JSON.parse(qr.branding) : {};
    const settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    const baseUrl = settings?.base_url || `http://localhost:${PORT}`;

    // For dynamic QRs, encode the redirect URL
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
      
      // Add logo if specified
      if (branding.logo_path && fs.existsSync(branding.logo_path)) {
        const sharp = require('sharp');
        const logoSize = Math.floor(qrOptions.width * (branding.logo_size_percent || 20) / 100);
        const logo = await sharp(branding.logo_path)
          .resize(logoSize, logoSize)
          .toBuffer();
        
        const finalImage = await sharp(buffer)
          .composite([{
            input: logo,
            gravity: 'center'
          }])
          .png()
          .toBuffer();
        
        res.type('image/png').send(finalImage);
      } else {
        res.type('image/png').send(buffer);
      }
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Dynamic Redirect Endpoint (Public)
// ============================================

app.get('/qr/r/:id', (req, res) => {
  try {
    const qr = get('SELECT * FROM qr_codes WHERE id = ?', [req.params.id]);
    
    if (!qr) {
      return res.status(404).send('QR Code not found');
    }

    // Log the scan
    run('INSERT INTO qr_scan_log (id, qr_id, user_agent, ip_address) VALUES (?, ?, ?, ?)',
      [uuidv4(), qr.id, req.headers['user-agent'] || '', req.ip || '']);

    // Increment scan count (async)
    run('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = ?', [qr.id]);

    // Redirect to target
    res.redirect(302, qr.target_url);
  } catch (err) {
    res.status(500).send('Error processing QR redirect');
  }
});

// ============================================
// Bulk Generation
// ============================================

app.post('/api/qr/bulk', async (req, res) => {
  try {
    const { product_ids, type = 'product', branding } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'product_ids array is required' });
    }

    const settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    const baseUrl = settings?.base_url || `http://localhost:${PORT}`;
    const createdIds = [];

    for (const productId of product_ids) {
      // Get product info if available
      const product = get('SELECT * FROM products WHERE id = ?', [productId]);
      const label = product ? product.name : `Product ${productId}`;
      const targetUrl = product 
        ? `${baseUrl}/product/${productId}` 
        : `${baseUrl}/product/${productId}`;

      const id = uuidv4();
      run(`INSERT INTO qr_codes (id, type, label, target_url, metadata, branding) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, type, label, targetUrl, JSON.stringify({ product_id: productId, product_name: label }), JSON.stringify(branding || {})]);
      
      createdIds.push(id);
    }

    res.json({ success: true, data: { created: createdIds.length, ids: createdIds } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Export Endpoints
// ============================================

// Export as PDF
app.post('/api/export/pdf', async (req, res) => {
  try {
    const { qr_ids, layout = 'grid', columns = 3 } = req.body;

    if (!qr_ids || !Array.isArray(qr_ids) || qr_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'qr_ids array is required' });
    }

    const settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    const baseUrl = settings?.base_url || `http://localhost:${PORT}`;

    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=qr_codes.pdf');
    doc.pipe(res);

    const pageWidth = 595 - 60; // A4 width minus margins
    const qrSize = Math.floor(pageWidth / columns) - 10;
    let x = 30, y = 30;
    let count = 0;

    for (const qrId of qr_ids) {
      const qr = get('SELECT * FROM qr_codes WHERE id = ?', [qrId]);
      if (!qr) continue;

      const branding = qr.branding ? JSON.parse(qr.branding) : {};
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

      // Add QR image
      doc.image(qrBuffer, x, y, { width: qrSize });
      
      // Add label below
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

// Export as ZIP of PNGs
app.post('/api/export/zip', async (req, res) => {
  try {
    const { qr_ids, size = 300 } = req.body;

    if (!qr_ids || !Array.isArray(qr_ids) || qr_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'qr_ids array is required' });
    }

    const settings = get('SELECT * FROM qr_settings WHERE id = ?', ['default']);
    const baseUrl = settings?.base_url || `http://localhost:${PORT}`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=qr_codes.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const qrId of qr_ids) {
      const qr = get('SELECT * FROM qr_codes WHERE id = ?', [qrId]);
      if (!qr) continue;

      const branding = qr.branding ? JSON.parse(qr.branding) : {};
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

      // Sanitize filename
      const filename = qr.label.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      archive.append(qrBuffer, { name: `${filename}_${qr.id.substring(0, 8)}.png` });
    }

    await archive.finalize();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Analytics Endpoints
// ============================================

app.get('/api/analytics', (req, res) => {
  try {
    const totalQRs = get('SELECT COUNT(*) as count FROM qr_codes')?.count || 0;
    const totalScans = get('SELECT SUM(scan_count) as total FROM qr_codes')?.total || 0;
    
    const scansThisWeek = get(`
      SELECT COUNT(*) as count FROM qr_scan_log 
      WHERE datetime(scanned_at) > datetime('now', '-7 days')
    `)?.count || 0;

    const topQRs = query(`
      SELECT id, label, type, scan_count 
      FROM qr_codes 
      ORDER BY scan_count DESC 
      LIMIT 5
    `);

    const byType = query(`
      SELECT type, COUNT(*) as count 
      FROM qr_codes 
      GROUP BY type
    `);

    res.json({
      success: true,
      data: {
        total_qrs: totalQRs,
        total_scans: totalScans,
        scans_this_week: scansThisWeek,
        top_qrs: topQRs,
        by_type: byType
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/analytics/:id', (req, res) => {
  try {
    const qr = get('SELECT * FROM qr_codes WHERE id = ?', [req.params.id]);
    if (!qr) {
      return res.status(404).json({ success: false, error: 'QR code not found' });
    }

    const recentScans = query(`
      SELECT scanned_at, user_agent, ip_address 
      FROM qr_scan_log 
      WHERE qr_id = ? 
      ORDER BY scanned_at DESC 
      LIMIT 50
    `, [req.params.id]);

    const scansByDay = query(`
      SELECT DATE(scanned_at) as date, COUNT(*) as count 
      FROM qr_scan_log 
      WHERE qr_id = ? 
      GROUP BY DATE(scanned_at) 
      ORDER BY date DESC 
      LIMIT 30
    `, [req.params.id]);

    res.json({
      success: true,
      data: {
        qr_id: qr.id,
        label: qr.label,
        total_scans: qr.scan_count,
        recent_scans: recentScans,
        scans_by_day: scansByDay
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Product Catalog Integration
// ============================================

app.get('/api/products', async (req, res) => {
  try {
    // First try local products table
    const localProducts = query('SELECT id, sku, name, price, barcode, category FROM products WHERE active = 1 LIMIT 500');
    
    if (localProducts.length > 0) {
      return res.json({ success: true, data: localProducts, source: 'local' });
    }

    // Try product catalog service
    const response = await fetch(`${PRODUCT_CATALOG_URL}/api/products`);
    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, data: data.data || [], source: 'catalog' });
    }

    res.json({ success: true, data: [], source: 'none' });
  } catch (err) {
    // Graceful fallback
    res.json({ success: true, data: [], source: 'error', message: err.message });
  }
});

// ============================================
// Logo Upload
// ============================================

app.post('/api/logo/upload', express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
  try {
    const filename = `${uuidv4()}.png`;
    const filepath = path.join(LOGO_DIR, filename);
    
    // Convert and save as PNG
    const sharp = require('sharp');
    await sharp(req.body).png().toFile(filepath);

    res.json({ success: true, data: { path: filepath, url: `/logos/${filename}` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// Helper Functions
// ============================================

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

// ============================================
// SPA Fallback
// ============================================

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ service: 'qr_code_generator', status: 'running', ui: 'not built' });
  }
});

// ============================================
// Start Server
// ============================================

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[QR Code Generator] Running on http://localhost:${PORT}`);
    console.log(`[QR Code Generator] Mode: Niyam Lite (SQLite)`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
