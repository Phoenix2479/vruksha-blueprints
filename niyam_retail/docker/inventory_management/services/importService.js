// Bulk import business logic service

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('@vruksha/platform/db/postgres');
const kvStore = require('@vruksha/platform/nats/kv_store');
const { DEFAULT_STORE_ID, DEFAULT_USER_ID } = require('../config/constants');
const { normalizeRow } = require('../utils/normalizer');
const { ensureUniqueSku, generateSkuForProduct } = require('../utils/skuGenerator');

// OCR Support (Tesseract.js for images, pdf-parse for PDFs)
let Tesseract = null;
let pdfParse = null;
try {
  Tesseract = require('tesseract.js');
} catch (e) {
  console.log('Tesseract.js not installed - OCR for images disabled');
}
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.log('pdf-parse not installed - OCR for PDFs disabled');
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'storage', 'uploads');

// Parse products from OCR text (invoice/bill format)
function parseProductsFromText(text) {
  const products = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  // Common patterns in invoices
  // Pattern: Qty x Name @ Price or Name Qty Price
  const patterns = [
    // "2 x Widget @ 100.00" or "2x Widget 100.00"
    /(\d+)\s*x?\s+(.+?)\s*[@Rs.₹$]?\s*(\d+(?:\.\d{2})?)/gi,
    // "Widget 2 100.00" (name qty price)
    /^([A-Za-z][A-Za-z0-9\s\-]+?)\s+(\d+)\s+(?:Rs\.?|₹|\$)?\s*(\d+(?:\.\d{2})?)$/gm,
    // "Widget - Rs. 100.00" (name price, qty=1)
    /^([A-Za-z][A-Za-z0-9\s\-]+?)\s*[-–]\s*(?:Rs\.?|₹|\$)?\s*(\d+(?:\.\d{2})?)$/gm,
  ];

  for (const line of lines) {
    let match;
    
    // Try pattern 1: qty x name @ price
    const p1 = /(\d+)\s*x?\s+(.+?)\s*[@Rs.₹$]?\s*(\d+(?:\.\d{2})?)/i;
    match = line.match(p1);
    if (match && match[2].trim().length > 1) {
      products.push({
        name: match[2].trim(),
        quantity: parseInt(match[1]) || 1,
        unit_price: parseFloat(match[3]) || 0,
        _confidence: 0.8,
        _source: 'ocr'
      });
      continue;
    }

    // Try pattern 2: name qty price (table format)
    const p2 = /^([A-Za-z][A-Za-z0-9\s\-]{2,30})\s+(\d+)\s+(\d+(?:\.\d{2})?)$/;
    match = line.match(p2);
    if (match) {
      products.push({
        name: match[1].trim(),
        quantity: parseInt(match[2]) || 1,
        unit_price: parseFloat(match[3]) || 0,
        _confidence: 0.7,
        _source: 'ocr'
      });
      continue;
    }

    // Try pattern 3: name - price (single item)
    const p3 = /^([A-Za-z][A-Za-z0-9\s\-]{2,30})\s*[-–:]\s*(?:Rs\.?|₹|\$)?\s*(\d+(?:\.\d{2})?)$/;
    match = line.match(p3);
    if (match) {
      products.push({
        name: match[1].trim(),
        quantity: 1,
        unit_price: parseFloat(match[2]) || 0,
        _confidence: 0.6,
        _source: 'ocr'
      });
    }
  }

  return products;
}

// OCR for images using Tesseract.js
async function extractFromImage(filePath) {
  if (!Tesseract) {
    return { products: [], warning: 'Image OCR not available - install tesseract.js' };
  }

  try {
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
      logger: m => console.log(`OCR: ${m.status}`)
    });
    const products = parseProductsFromText(text);
    return { products, rawText: text };
  } catch (err) {
    return { products: [], warning: `Image OCR failed: ${err.message}` };
  }
}

// Extract text from PDF
async function extractFromPDF(filePath) {
  if (!pdfParse) {
    return { products: [], warning: 'PDF parsing not available - install pdf-parse' };
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const products = parseProductsFromText(data.text);
    return { products, rawText: data.text };
  } catch (err) {
    return { products: [], warning: `PDF parsing failed: ${err.message}` };
  }
}

// Generate SKU based on config
function generateAutoSKU(index, product, config) {
  if (!config || !config.enabled) return null;
  if (product.sku) return product.sku; // Already has SKU

  const num = (config.startNumber + index).toString().padStart(config.digits || 4, '0');
  const catPart = config.includeCategory && product.category
    ? `${product.category.substring(0, 3).toUpperCase()}${config.separator || '-'}`
    : '';
  return `${config.prefix || 'SKU'}${config.separator || '-'}${catPart}${num}`;
}

// Generate barcode based on config
function generateAutoBarcode(index, product, config) {
  if (!config || !config.enabled) return null;
  if (product.barcode) return product.barcode; // Already has barcode

  const num = config.startNumber + index;
  const prefix = config.prefix || '200';

  switch (config.format) {
    case 'EAN13':
      // 12 digits + check digit (we generate 12, DB can add check)
      return `${prefix}${num.toString().padStart(12 - prefix.length, '0')}`;
    case 'EAN8':
      return `${prefix}${num.toString().padStart(7 - prefix.length, '0')}`;
    case 'UPC':
      return `${prefix}${num.toString().padStart(11 - prefix.length, '0')}`;
    case 'CODE128':
    case 'CODE39':
    default:
      return `${prefix}${num.toString().padStart(6, '0')}`;
  }
}

async function createSession(tenantId) {
  const session_id = uuidv4();
  await kvStore.set(
    `import.session.${tenantId}.${session_id}`,
    { status: 'created', files: [], rows: [], warnings: [] },
    3600
  );
  return session_id;
}

async function uploadFiles(tenantId, sessionId, files) {
  const existing = (await kvStore.get(`import.session.${tenantId}.${sessionId}`)) || {
    files: [],
    rows: [],
    warnings: []
  };

  const savedFiles = [];
  for (const file of files || []) {
    const ext = path.extname(file.originalname).toLowerCase();
    const targetDir = path.join(UPLOAD_DIR, 'imports', sessionId);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, `${Date.now()}-${file.originalname}`);
    fs.renameSync(file.path, targetPath);
    savedFiles.push({
      filename: file.originalname,
      path: targetPath,
      mime: file.mimetype,
      size: file.size,
      ext
    });
  }

  existing.files = (existing.files || []).concat(savedFiles);

  // Parse files for preview
  const rows = [];
  const warnings = [];
  let sourceType = 'csv';

  for (const f of savedFiles) {
    if (f.ext === '.csv') {
      const content = fs.readFileSync(f.path, 'utf8');
      const records = parse(content, { columns: true, skip_empty_lines: true });
      records.forEach((r) => rows.push(normalizeRow(r)));
      sourceType = 'csv';
    } else if (f.ext === '.xlsx' || f.ext === '.xls') {
      const wb = XLSX.read(fs.readFileSync(f.path));
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(sheet);
      records.forEach((r) => rows.push(normalizeRow(r)));
      sourceType = 'excel';
    } else if (f.ext === '.pdf') {
      // PDF OCR extraction
      const result = await extractFromPDF(f.path);
      if (result.warning) warnings.push(result.warning);
      result.products.forEach((p) => rows.push({ ...p, id: `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }));
      sourceType = 'pdf_ocr';
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'].includes(f.ext)) {
      // Image OCR extraction
      const result = await extractFromImage(f.path);
      if (result.warning) warnings.push(result.warning);
      result.products.forEach((p) => rows.push({ ...p, id: `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }));
      sourceType = 'image_ocr';
    } else {
      warnings.push(`Unsupported file type: ${f.filename}`);
    }
  }

  existing.rows = rows;
  existing.warnings = (existing.warnings || []).concat(warnings);
  existing.status = 'parsed';
  existing.source_type = sourceType;
  await kvStore.set(`import.session.${tenantId}.${sessionId}`, existing, 3600);

  return { files: savedFiles.length, rows: rows.length, warnings, parsed_rows: rows, source_type: sourceType };
}

async function getPreview(tenantId, sessionId) {
  const data = await kvStore.get(`import.session.${tenantId}.${sessionId}`);
  if (!data) return null;
  return { rows: data.rows || [], warnings: data.warnings || [] };
}

async function commitImport(tenantId, sessionId, options) {
  const client = await getClient();
  const { 
    strategy = 'create', 
    default_tax = 0, 
    default_category = null, 
    rows: overrideRows, 
    import_notes,
    auto_sku,      // User-configured SKU generation
    auto_barcode   // User-configured barcode generation
  } = options;

  const data = await kvStore.get(`import.session.${tenantId}.${sessionId}`);
  if ((!data || !Array.isArray(data.rows)) && !Array.isArray(overrideRows)) {
    return { success: false, error: 'Session not found or empty' };
  }

  const rowsToProcess = Array.isArray(overrideRows)
    ? overrideRows.map(normalizeRow)
    : data.rows;

  let created = 0;
  let updated = 0;
  let stockAdded = 0;
  let skusGenerated = 0;
  let barcodesGenerated = 0;
  const warnings = [];

  try {
    await client.query('BEGIN');

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      try {
        let name = row.name || row.description || 'Unnamed Product';
        
        // SKU: Use existing, auto-generate from config, or fall back to system generator
        let sku = row.sku && row.sku.trim();
        if (!sku && auto_sku && auto_sku.enabled) {
          sku = generateAutoSKU(i, row, auto_sku);
          skusGenerated++;
        }
        if (!sku) {
          sku = await generateSkuForProduct({
            name,
            category: row.category || default_category,
            color: row.attributes?.color,
            material: row.attributes?.material,
            design: row.attributes?.design,
            edition: row.attributes?.edition,
            collection: row.attributes?.collection,
          });
        }
        sku = await ensureUniqueSku(sku);

        // Barcode: Use existing or auto-generate from config
        let barcode = row.barcode && row.barcode.trim();
        if (!barcode && auto_barcode && auto_barcode.enabled) {
          barcode = generateAutoBarcode(i, row, auto_barcode);
          barcodesGenerated++;
        }
        if (!barcode) {
          barcode = sku; // Default barcode to SKU if not provided
        }

        // Upsert by SKU if strategy = upsert
        let existing = null;
        if (strategy === 'upsert' && row.sku) {
          const ex = await client.query(
            'SELECT * FROM products WHERE tenant_id = $1 AND sku = $2',
            [tenantId, row.sku]
          );
          existing = ex.rows[0] || null;
        }

        let productId;
        if (existing) {
          await client.query(
            `UPDATE products SET name=$1, description=$2, category=$3, cost=$4, price=$5, tax_rate=$6, updated_at=NOW() WHERE id=$7`,
            [
              name,
              row.description || null,
              row.category || default_category,
              row.cost_price || null,
              row.unit_price || 0,
              row.tax_rate ?? default_tax,
              existing.id
            ]
          );
          productId = existing.id;
          updated += 1;
        } else {
          const pr = await client.query(
            `INSERT INTO products (tenant_id, sku, barcode, name, description, category, unit_of_measure, cost, price, tax_rate, taxable, track_inventory, min_stock_level, status, attributes)
             VALUES ($1,$2,$3,$4,$5,$6,'ea',$7,$8,$9,true,true,0,'active',$10)
             RETURNING *`,
            [
              tenantId,
              sku,
              barcode, // Use generated barcode instead of SKU
              name,
              row.description || null,
              row.category || default_category,
              row.cost_price || null,
              row.unit_price || 0,
              row.tax_rate ?? default_tax,
              row.attributes || null
            ]
          );
          productId = pr.rows[0].id;
          created += 1;
          await client.query(
            `INSERT INTO inventory (tenant_id, product_id, sku, store_id, quantity, reserved_quantity, reorder_point, reorder_quantity)
             VALUES ($1, $2, $3, $4, 0, 0, $5, $6)
             ON CONFLICT (product_id, store_id) DO NOTHING`,
            [tenantId, productId, sku, DEFAULT_STORE_ID, row.reorder_point || 0, row.reorder_quantity || 0]
          );
        }

        // Adjust stock if provided
        const qty = parseInt(row.quantity || 0, 10) || 0;
        if (qty > 0) {
          const inv = await client.query(
            `SELECT * FROM inventory WHERE product_id=$1 AND store_id=$2 AND tenant_id=$3 FOR UPDATE`,
            [productId, DEFAULT_STORE_ID, tenantId]
          );
          if (inv.rows.length === 0) {
            await client.query(
              `INSERT INTO inventory (tenant_id, product_id, sku, store_id, quantity, reserved_quantity, reorder_point, reorder_quantity)
               VALUES ($1, $2, (SELECT sku FROM products WHERE id=$2), $3, 0, 0, 0, 0)`,
              [tenantId, productId, DEFAULT_STORE_ID]
            );
          }
          await client.query(
            `UPDATE inventory SET quantity = quantity + $1, updated_at=NOW(), last_received_at=NOW() WHERE product_id=$2 AND store_id=$3 AND tenant_id=$4`,
            [qty, productId, DEFAULT_STORE_ID, tenantId]
          );
          await client.query(
            `INSERT INTO inventory_transactions (tenant_id, product_id, sku, store_id, transaction_type, quantity, old_quantity, new_quantity, reference_type, notes, created_by)
             VALUES ($1, $2, (SELECT sku FROM products WHERE id=$2), $3, 'import', $4, NULL, NULL, 'bulk_import', $5, $6)`,
            [tenantId, productId, DEFAULT_STORE_ID, qty, import_notes || 'Bulk import', DEFAULT_USER_ID]
          );
          stockAdded += qty;
        }
      } catch (rowErr) {
        warnings.push(`Row failed: ${row.name || row.sku || 'unknown'} -> ${rowErr.message}`);
      }
    }

    await client.query('COMMIT');
    await kvStore.set(
      `import.session.${tenantId}.${sessionId}`,
      { ...data, status: 'committed', committed_at: new Date().toISOString() },
      3600
    );

    return {
      success: true,
      summary: { 
        created, 
        updated, 
        stock_added: stockAdded,
        skus_generated: skusGenerated,
        barcodes_generated: barcodesGenerated
      },
      warnings
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createSession,
  uploadFiles,
  getPreview,
  commitImport,
  UPLOAD_DIR
};
