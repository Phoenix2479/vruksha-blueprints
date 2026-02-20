/**
 * Supplier Template Service for Docker Version
 * Manages supplier templates for automatic column mapping
 */

const { getClient, query } = require('@vruksha/platform/db/postgres');

/**
 * Get all templates for a tenant
 */
async function getTemplates(tenantId) {
  const result = await query(
    `SELECT id, supplier_name, supplier_fingerprint, filename_pattern,
            column_mapping, default_values, use_count, confidence_score,
            created_at, last_used
     FROM supplier_templates
     WHERE tenant_id = $1
     ORDER BY use_count DESC, last_used DESC NULLS LAST`,
    [tenantId]
  );
  return result.rows;
}

/**
 * Get a single template by ID
 */
async function getTemplate(tenantId, templateId) {
  const result = await query(
    `SELECT * FROM supplier_templates
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, templateId]
  );
  return result.rows[0] || null;
}

/**
 * Find matching template based on fingerprint, headers, or filename
 * Returns best match with confidence score
 */
async function matchTemplate(tenantId, { fingerprint, headers, filename }) {
  let candidates = [];

  // Try fingerprint match first (highest confidence)
  if (fingerprint) {
    const fpResult = await query(
      `SELECT *, 1.0 as match_score
       FROM supplier_templates
       WHERE tenant_id = $1 AND supplier_fingerprint = $2`,
      [tenantId, fingerprint]
    );
    if (fpResult.rows.length > 0) {
      return { template: fpResult.rows[0], match_type: 'fingerprint', confidence: 1.0 };
    }
  }

  // Try header pattern match
  if (headers && Array.isArray(headers)) {
    const headerPattern = JSON.stringify(headers.slice(0, 10).map(h => h.toLowerCase().trim()));
    const headerResult = await query(
      `SELECT *, 
              CASE 
                WHEN header_pattern = $2::jsonb THEN 0.95
                ELSE 0.7
              END as match_score
       FROM supplier_templates
       WHERE tenant_id = $1 
         AND header_pattern IS NOT NULL
         AND (header_pattern = $2::jsonb OR header_pattern @> $2::jsonb OR $2::jsonb @> header_pattern)
       ORDER BY match_score DESC, use_count DESC
       LIMIT 1`,
      [tenantId, headerPattern]
    );
    if (headerResult.rows.length > 0) {
      candidates.push({
        template: headerResult.rows[0],
        match_type: 'headers',
        confidence: headerResult.rows[0].match_score
      });
    }
  }

  // Try filename pattern match
  if (filename) {
    const filenameResult = await query(
      `SELECT *, 0.6 as match_score
       FROM supplier_templates
       WHERE tenant_id = $1 
         AND filename_pattern IS NOT NULL
         AND $2 ~* filename_pattern
       ORDER BY use_count DESC
       LIMIT 1`,
      [tenantId, filename]
    );
    if (filenameResult.rows.length > 0) {
      candidates.push({
        template: filenameResult.rows[0],
        match_type: 'filename',
        confidence: 0.6
      });
    }
  }

  // Return best match
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0];
  }

  return null;
}

/**
 * Create a new template
 */
async function createTemplate(tenantId, data) {
  const {
    supplier_name,
    supplier_fingerprint = null,
    filename_pattern = null,
    header_pattern = null,
    column_mapping,
    default_values = {},
    ai_prompt_template = null
  } = data;

  if (!supplier_name || !column_mapping) {
    throw new Error('supplier_name and column_mapping are required');
  }

  const result = await query(
    `INSERT INTO supplier_templates
      (tenant_id, supplier_name, supplier_fingerprint, filename_pattern,
       header_pattern, column_mapping, default_values, ai_prompt_template)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenantId,
      supplier_name,
      supplier_fingerprint,
      filename_pattern,
      header_pattern ? JSON.stringify(header_pattern) : null,
      JSON.stringify(column_mapping),
      JSON.stringify(default_values),
      ai_prompt_template
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing template
 */
async function updateTemplate(tenantId, templateId, data) {
  const updates = [];
  const values = [tenantId, templateId];
  let paramIndex = 3;

  const allowedFields = [
    'supplier_name', 'supplier_fingerprint', 'filename_pattern',
    'header_pattern', 'column_mapping', 'default_values', 
    'ai_prompt_template', 'confidence_score'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      let value = data[field];
      // JSON stringify objects
      if (['header_pattern', 'column_mapping', 'default_values'].includes(field) && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      updates.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return getTemplate(tenantId, templateId);
  }

  const result = await query(
    `UPDATE supplier_templates
     SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a template
 */
async function deleteTemplate(tenantId, templateId) {
  const result = await query(
    `DELETE FROM supplier_templates
     WHERE tenant_id = $1 AND id = $2
     RETURNING id`,
    [tenantId, templateId]
  );
  return result.rowCount > 0;
}

/**
 * Record template usage (increment counter, update last_used)
 */
async function recordTemplateUse(tenantId, templateId) {
  const result = await query(
    `UPDATE supplier_templates
     SET use_count = use_count + 1, last_used = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING use_count, last_used`,
    [tenantId, templateId]
  );
  return result.rows[0] || null;
}

/**
 * Generate fingerprint from file content
 * Uses first N bytes hash + file size
 */
function generateFingerprint(buffer, filename) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  
  // Use first 4KB of file for fingerprint
  const sample = buffer.slice(0, 4096);
  hash.update(sample);
  
  // Include file extension in fingerprint
  const ext = (filename || '').split('.').pop()?.toLowerCase() || 'unknown';
  hash.update(ext);
  
  return hash.digest('hex').substring(0, 32);
}

/**
 * Detect column types from sample data
 */
function detectColumnTypes(headers, sampleRows) {
  const columnTypes = {};
  
  const patterns = {
    sku: /^(sku|item.?code|product.?code|code|item.?#|item.?no)/i,
    name: /^(name|product|description|item|title)/i,
    price: /^(price|sell|retail|mrp|sale)/i,
    cost: /^(cost|purchase|buy|wholesale)/i,
    quantity: /^(qty|quantity|stock|units|count)/i,
    barcode: /^(barcode|ean|upc|gtin)/i,
    category: /^(category|cat|type|group)/i,
    unit: /^(unit|uom|measure)/i,
    tax: /^(tax|vat|gst)/i
  };

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(normalized)) {
        columnTypes[header] = type;
        break;
      }
    }
  }

  return columnTypes;
}

module.exports = {
  getTemplates,
  getTemplate,
  matchTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  recordTemplateUse,
  generateFingerprint,
  detectColumnTypes
};
