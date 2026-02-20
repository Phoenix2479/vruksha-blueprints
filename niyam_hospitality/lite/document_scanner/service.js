/**
 * Document Scanner Service - Niyam Hospitality (Max Lite)
 * ID/passport scanning with OCR and document verification
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8922;
const SERVICE_NAME = 'document_scanner';

app.use(cors());
app.use(express.json({ limit: '20mb' })); // Large limit for images

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
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Scanned documents
  db.run(`
    CREATE TABLE IF NOT EXISTS scanned_documents (
      id TEXT PRIMARY KEY,
      guest_id TEXT,
      reservation_id TEXT,
      document_type TEXT NOT NULL,
      document_number TEXT,
      full_name TEXT,
      date_of_birth TEXT,
      gender TEXT,
      nationality TEXT,
      issuing_country TEXT,
      expiry_date TEXT,
      address TEXT,
      mrz_data TEXT,
      raw_ocr_data TEXT,
      image_path TEXT,
      confidence_score REAL DEFAULT 0,
      verification_status TEXT DEFAULT 'pending',
      verified_by TEXT,
      verified_at TEXT,
      scan_source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Document verification log
  db.run(`
    CREATE TABLE IF NOT EXISTS document_verification_log (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT,
      details TEXT,
      performed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Blacklist for fraud detection
  db.run(`
    CREATE TABLE IF NOT EXISTS document_blacklist (
      id TEXT PRIMARY KEY,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      reason TEXT,
      added_by TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_type, document_number)
    )
  `);
  
  return db;
}

// ============================================
// SCAN DOCUMENT (OCR Simulation)
// ============================================

app.post('/scan', async (req, res) => {
  try {
    await ensureTables();
    const { document_type, image_base64, guest_id, reservation_id } = req.body;
    
    if (!document_type || !DOCUMENT_TYPES[document_type]) {
      return res.status(400).json({ success: false, error: 'Invalid document type' });
    }
    
    // In real implementation, this would call an OCR service
    // For lite version, we simulate with manual entry support
    const id = generateId();
    
    run(`
      INSERT INTO scanned_documents (id, guest_id, reservation_id, document_type, scan_source, verification_status, created_at)
      VALUES (?, ?, ?, ?, 'scan', 'pending', ?)
    `, [id, guest_id, reservation_id, document_type, timestamp()]);
    
    // Log scan action
    run(`INSERT INTO document_verification_log (id, document_id, action, result, created_at) VALUES (?, ?, 'scan', 'initiated', ?)`,
      [generateId(), id, timestamp()]);
    
    res.json({
      success: true,
      scan: {
        id,
        document_type,
        status: 'pending',
        message: 'Document scan initiated. Please verify and complete the extracted data.',
        required_fields: DOCUMENT_TYPES[document_type].fields
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MANUAL ENTRY / UPDATE EXTRACTED DATA
// ============================================

app.post('/documents', async (req, res) => {
  try {
    await ensureTables();
    const { document_type, document_number, full_name, date_of_birth, gender, nationality, issuing_country, expiry_date, address, guest_id, reservation_id } = req.body;
    
    if (!document_type || !document_number || !full_name) {
      return res.status(400).json({ success: false, error: 'Document type, number, and name are required' });
    }
    
    // Check blacklist
    const blacklisted = get(`SELECT * FROM document_blacklist WHERE document_type = ? AND document_number = ? AND active = 1`,
      [document_type, document_number]);
    
    if (blacklisted) {
      run(`INSERT INTO document_verification_log (id, document_id, action, result, details, created_at) VALUES (?, ?, 'blacklist_check', 'blocked', ?, ?)`,
        [generateId(), 'N/A', `Document ${document_number} is blacklisted: ${blacklisted.reason}`, timestamp()]);
      
      return res.status(403).json({ 
        success: false, 
        error: 'Document is blacklisted',
        reason: blacklisted.reason
      });
    }
    
    const id = generateId();
    run(`
      INSERT INTO scanned_documents (id, guest_id, reservation_id, document_type, document_number, full_name, date_of_birth, gender, nationality, issuing_country, expiry_date, address, scan_source, verification_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'verified', ?)
    `, [id, guest_id, reservation_id, document_type, document_number, full_name, date_of_birth, gender, nationality, issuing_country, expiry_date, address, timestamp()]);
    
    // Update guest if linked
    if (guest_id) {
      run(`UPDATE guests SET id_type = ?, id_number = ?, nationality = ?, updated_at = ? WHERE id = ?`,
        [document_type, document_number, nationality, timestamp(), guest_id]);
    }
    
    run(`INSERT INTO document_verification_log (id, document_id, action, result, created_at) VALUES (?, ?, 'manual_entry', 'success', ?)`,
      [generateId(), id, timestamp()]);
    
    res.json({ success: true, document: { id, document_type, document_number, full_name, status: 'verified' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/documents/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { document_number, full_name, date_of_birth, gender, nationality, issuing_country, expiry_date, address, confidence_score } = req.body;
    
    run(`
      UPDATE scanned_documents SET
        document_number = COALESCE(?, document_number),
        full_name = COALESCE(?, full_name),
        date_of_birth = COALESCE(?, date_of_birth),
        gender = COALESCE(?, gender),
        nationality = COALESCE(?, nationality),
        issuing_country = COALESCE(?, issuing_country),
        expiry_date = COALESCE(?, expiry_date),
        address = COALESCE(?, address),
        confidence_score = COALESCE(?, confidence_score)
      WHERE id = ?
    `, [document_number, full_name, date_of_birth, gender, nationality, issuing_country, expiry_date, address, confidence_score, id]);
    
    res.json({ success: true, message: 'Document updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// VERIFICATION
// ============================================

app.post('/documents/:id/verify', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { verified_by, notes } = req.body;
    
    const doc = get(`SELECT * FROM scanned_documents WHERE id = ?`, [id]);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    // Check blacklist
    if (doc.document_number) {
      const blacklisted = get(`SELECT * FROM document_blacklist WHERE document_type = ? AND document_number = ? AND active = 1`,
        [doc.document_type, doc.document_number]);
      
      if (blacklisted) {
        run(`UPDATE scanned_documents SET verification_status = 'rejected' WHERE id = ?`, [id]);
        run(`INSERT INTO document_verification_log (id, document_id, action, result, details, created_at) VALUES (?, ?, 'verify', 'rejected', 'Blacklisted document', ?)`,
          [generateId(), id, timestamp()]);
        
        return res.status(403).json({ success: false, error: 'Document is blacklisted', reason: blacklisted.reason });
      }
    }
    
    // Check expiry
    if (doc.expiry_date) {
      const expiry = new Date(doc.expiry_date);
      if (expiry < new Date()) {
        run(`UPDATE scanned_documents SET verification_status = 'expired' WHERE id = ?`, [id]);
        run(`INSERT INTO document_verification_log (id, document_id, action, result, details, created_at) VALUES (?, ?, 'verify', 'expired', 'Document has expired', ?)`,
          [generateId(), id, timestamp()]);
        
        return res.status(400).json({ success: false, error: 'Document has expired', expiry_date: doc.expiry_date });
      }
    }
    
    // Verify
    run(`UPDATE scanned_documents SET verification_status = 'verified', verified_by = ?, verified_at = ? WHERE id = ?`,
      [verified_by, timestamp(), id]);
    
    // Update guest
    if (doc.guest_id) {
      run(`UPDATE guests SET id_type = ?, id_number = ?, nationality = ?, updated_at = ? WHERE id = ?`,
        [doc.document_type, doc.document_number, doc.nationality, timestamp(), doc.guest_id]);
    }
    
    run(`INSERT INTO document_verification_log (id, document_id, action, result, details, performed_by, created_at) VALUES (?, ?, 'verify', 'verified', ?, ?, ?)`,
      [generateId(), id, notes, verified_by, timestamp()]);
    
    res.json({ success: true, message: 'Document verified', status: 'verified' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/documents/:id/reject', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { reason, rejected_by } = req.body;
    
    run(`UPDATE scanned_documents SET verification_status = 'rejected' WHERE id = ?`, [id]);
    run(`INSERT INTO document_verification_log (id, document_id, action, result, details, performed_by, created_at) VALUES (?, ?, 'reject', 'rejected', ?, ?, ?)`,
      [generateId(), id, reason, rejected_by, timestamp()]);
    
    res.json({ success: true, message: 'Document rejected' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DOCUMENT RETRIEVAL
// ============================================

app.get('/documents', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, status, document_type, limit = 50 } = req.query;
    
    let sql = `SELECT * FROM scanned_documents WHERE 1=1`;
    const params = [];
    
    if (guest_id) {
      sql += ` AND guest_id = ?`;
      params.push(guest_id);
    }
    if (reservation_id) {
      sql += ` AND reservation_id = ?`;
      params.push(reservation_id);
    }
    if (status) {
      sql += ` AND verification_status = ?`;
      params.push(status);
    }
    if (document_type) {
      sql += ` AND document_type = ?`;
      params.push(document_type);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const documents = query(sql, params);
    res.json({ success: true, documents });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/documents/:id', async (req, res) => {
  try {
    await ensureTables();
    const doc = get(`SELECT * FROM scanned_documents WHERE id = ?`, [req.params.id]);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    const logs = query(`SELECT * FROM document_verification_log WHERE document_id = ? ORDER BY created_at DESC`, [req.params.id]);
    
    res.json({ success: true, document: doc, verification_log: logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// BLACKLIST MANAGEMENT
// ============================================

app.get('/blacklist', async (req, res) => {
  try {
    await ensureTables();
    const blacklist = query(`SELECT * FROM document_blacklist WHERE active = 1 ORDER BY created_at DESC`);
    res.json({ success: true, blacklist });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/blacklist', async (req, res) => {
  try {
    await ensureTables();
    const { document_type, document_number, reason, added_by } = req.body;
    
    if (!document_type || !document_number) {
      return res.status(400).json({ success: false, error: 'Document type and number required' });
    }
    
    const id = generateId();
    run(`INSERT INTO document_blacklist (id, document_type, document_number, reason, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, document_type, document_number, reason, added_by, timestamp()]);
    
    res.json({ success: true, blacklist_entry: { id, document_type, document_number } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/blacklist/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE document_blacklist SET active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Removed from blacklist' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    
    const today = new Date().toISOString().split('T')[0];
    
    const todayScans = get(`SELECT COUNT(*) as count FROM scanned_documents WHERE DATE(created_at) = ?`, [today]);
    const totalDocs = get(`SELECT COUNT(*) as count FROM scanned_documents`);
    const byStatus = query(`SELECT verification_status, COUNT(*) as count FROM scanned_documents GROUP BY verification_status`);
    const byType = query(`SELECT document_type, COUNT(*) as count FROM scanned_documents GROUP BY document_type ORDER BY count DESC`);
    const blacklistCount = get(`SELECT COUNT(*) as count FROM document_blacklist WHERE active = 1`);
    
    res.json({
      success: true,
      stats: {
        today_scans: todayScans?.count || 0,
        total_documents: totalDocs?.count || 0,
        by_status: byStatus,
        by_type: byType,
        blacklist_count: blacklistCount?.count || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
