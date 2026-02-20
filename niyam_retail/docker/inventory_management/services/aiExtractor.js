/**
 * AI Inventory Extractor for Docker Version
 * Extracts structured inventory data from images and PDFs
 * 
 * BYOK Architecture:
 * - API keys are fetched from Niyam Base App (encrypted storage)
 * - Falls back to environment variables if Niyam unavailable
 * - No keys are stored in Vruksha server
 * 
 * Features:
 * - OpenAI/Anthropic/Gemini Vision APIs
 * - Local Tesseract.js fallback
 * - PostgreSQL usage tracking
 * - NATS event publishing for analytics
 */

const { getClient, query } = require('@vruksha/platform/db/postgres');
const { publishNatsEvent } = require('@vruksha/platform/sdk/node');
const { aiGateway } = require('@vruksha/platform/sdk/node');

// Import Niyam API Keys bridge for BYOK
const { getApiKey, getBestAvailableProvider, isNiyamRunning, PROVIDERS } = require('../../shared/niyamApiKeys');

// System prompt for inventory extraction
const INVENTORY_EXTRACTION_PROMPT = `You are an inventory data extraction specialist. Extract product/inventory data from this document.

Return a JSON object with this exact structure:
{
  "products": [
    {
      "sku": "string or null if not visible",
      "name": "string (required - product name/description)",
      "cost": number or null,
      "price": number or null,
      "quantity": number or null,
      "unit": "string (pcs, kg, etc.) or null",
      "tax_rate": number or null,
      "barcode": "string or null",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "supplier_detected": "string or null",
  "document_type": "invoice" | "packing_list" | "catalog" | "purchase_order" | "unknown",
  "currency_detected": "string or null",
  "extraction_notes": "any issues or uncertainties"
}

Guidelines:
- Extract ALL products visible in the document
- Mark confidence as "low" if you had to guess or the text was unclear
- For prices, use the unit price (not total)
- If you see both cost and sell price, include both
- Preserve original SKU/item codes exactly as shown
- If a field is not visible or unclear, use null`;

// Pricing for cost estimation (approximate)
const PRICING = {
  openai: {
    'gpt-4-vision-preview': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 }
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
  }
};

/**
 * Track AI usage in PostgreSQL and publish to NATS
 */
async function trackAIUsage(tenantId, data) {
  const {
    service,
    model,
    operation = 'extract_inventory',
    tokensInput = 0,
    tokensOutput = 0,
    durationMs = 0,
    sessionId = null,
    success = true,
    errorMessage = null,
    metadata = null
  } = data;

  const tokensTotal = tokensInput + tokensOutput;
  
  // Calculate cost estimate
  let costEstimate = 0;
  const providerPricing = PRICING[service]?.[model];
  if (providerPricing) {
    costEstimate = (tokensInput / 1000 * providerPricing.input) + 
                   (tokensOutput / 1000 * providerPricing.output);
  }

  try {
    // Insert into PostgreSQL
    await query(
      `INSERT INTO ai_usage_log 
        (tenant_id, service, model, operation, tokens_input, tokens_output, tokens_total, 
         cost_estimate, duration_ms, session_id, success, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [tenantId, service, model, operation, tokensInput, tokensOutput, tokensTotal,
       costEstimate, durationMs, sessionId, success, errorMessage, 
       metadata ? JSON.stringify(metadata) : null]
    );

    // Publish to NATS for analytics dashboard
    await publishNatsEvent('analytics.ai.usage', {
      tenant_id: tenantId,
      service,
      model,
      operation,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      tokens_total: tokensTotal,
      cost_estimate: costEstimate,
      duration_ms: durationMs,
      session_id: sessionId,
      success,
      timestamp: new Date().toISOString()
    });

    console.log(`[AI Extractor] Usage tracked: ${service}/${model} - ${tokensTotal} tokens, $${costEstimate.toFixed(6)}`);
  } catch (err) {
    console.error('[AI Extractor] Failed to track usage:', err.message);
  }

  return { tokensTotal, costEstimate };
}

/**
 * Get AI usage stats for a tenant
 */
async function getAIUsageStats(tenantId) {
  try {
    // Get summary stats
    const summaryResult = await query(
      `SELECT 
        COUNT(*) as total_calls,
        SUM(tokens_total) as total_tokens,
        SUM(cost_estimate) as total_cost,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_calls
       FROM ai_usage_log 
       WHERE tenant_id = $1`,
      [tenantId]
    );

    // Get monthly breakdown
    const monthlyResult = await query(
      `SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as calls,
        SUM(tokens_total) as tokens,
        SUM(cost_estimate) as cost
       FROM ai_usage_log 
       WHERE tenant_id = $1 
       GROUP BY TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month DESC
       LIMIT 12`,
      [tenantId]
    );

    // Get by service
    const serviceResult = await query(
      `SELECT 
        service,
        model,
        COUNT(*) as calls,
        SUM(tokens_total) as tokens,
        SUM(cost_estimate) as cost
       FROM ai_usage_log 
       WHERE tenant_id = $1 
       GROUP BY service, model
       ORDER BY cost DESC`,
      [tenantId]
    );

    const summary = summaryResult.rows[0] || {};
    return {
      total_calls: parseInt(summary.total_calls || 0),
      total_tokens: parseInt(summary.total_tokens || 0),
      total_cost: parseFloat(summary.total_cost || 0),
      success_rate: summary.total_calls > 0 
        ? (summary.successful_calls / summary.total_calls * 100).toFixed(1) + '%'
        : 'N/A',
      by_month: monthlyResult.rows.reduce((acc, row) => {
        acc[row.month] = {
          calls: parseInt(row.calls),
          tokens: parseInt(row.tokens),
          cost: parseFloat(row.cost)
        };
        return acc;
      }, {}),
      by_service: serviceResult.rows.map(row => ({
        service: row.service,
        model: row.model,
        calls: parseInt(row.calls),
        tokens: parseInt(row.tokens),
        cost: parseFloat(row.cost)
      }))
    };
  } catch (err) {
    console.error('[AI Extractor] Failed to get usage stats:', err.message);
    return { total_calls: 0, total_tokens: 0, total_cost: 0, by_month: {}, by_service: [] };
  }
}

/**
 * Parse OCR text into structured data using heuristics
 */
function parseOCRText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const products = [];

  for (const line of lines) {
    // Pattern 1: qty x name @ price
    let match = line.match(/(\d+)\s*x?\s+(.+?)\s*[@Rs.₹$]?\s*(\d+(?:\.\d{2})?)/i);
    if (match && match[2].trim().length > 1) {
      products.push({
        name: match[2].trim(),
        quantity: parseInt(match[1]) || 1,
        price: parseFloat(match[3]) || 0,
        confidence: 'medium'
      });
      continue;
    }

    // Pattern 2: name qty price (table format)
    match = line.match(/^([A-Za-z][A-Za-z0-9\s\-]{2,30})\s+(\d+)\s+(\d+(?:\.\d{2})?)$/);
    if (match) {
      products.push({
        name: match[1].trim(),
        quantity: parseInt(match[2]) || 1,
        price: parseFloat(match[3]) || 0,
        confidence: 'low'
      });
      continue;
    }

    // Pattern 3: name - price
    match = line.match(/^([A-Za-z][A-Za-z0-9\s\-]{2,30})\s*[-–:]\s*(?:Rs\.?|₹|\$)?\s*(\d+(?:\.\d{2})?)$/);
    if (match) {
      products.push({
        name: match[1].trim(),
        quantity: 1,
        price: parseFloat(match[2]) || 0,
        confidence: 'low'
      });
    }
  }

  return {
    products,
    document_type: 'unknown',
    extraction_notes: `Heuristic parsing extracted ${products.length} products from OCR text`
  };
}

/**
 * Extract inventory data using AI Vision or OCR
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} mimeType - Image MIME type
 * @param {string} mode - 'local' (Tesseract) or 'cloud' (AI Vision)
 * @param {Object} apiConfig - API configuration { service, apiKey, model }
 * @param {string} tenantId - Tenant UUID
 * @param {string} sessionId - Optional session UUID for tracking
 */
async function extractInventoryData(imageBase64, mimeType, mode, apiConfig, tenantId, sessionId = null) {
  const startTime = Date.now();
  
  // Local OCR mode using Tesseract
  if (mode === 'local') {
    try {
      let Tesseract;
      try {
        Tesseract = require('tesseract.js');
      } catch (e) {
        return {
          success: false,
          error: 'Tesseract.js not installed',
          products: [],
          method: 'local_ocr'
        };
      }

      // Create buffer from base64
      const buffer = Buffer.from(imageBase64, 'base64');
      
      const { data: { text, confidence } } = await Tesseract.recognize(buffer, 'eng', {
        logger: m => console.log(`[Tesseract] ${m.status}: ${m.progress}`)
      });

      const durationMs = Date.now() - startTime;
      const result = parseOCRText(text);

      // Track usage (no tokens for local, but track duration)
      await trackAIUsage(tenantId, {
        service: 'tesseract',
        model: 'eng',
        operation: 'extract_inventory',
        tokensInput: 0,
        tokensOutput: 0,
        durationMs,
        sessionId,
        success: true,
        metadata: { confidence, productsFound: result.products.length }
      });

      return {
        success: true,
        ...result,
        raw_text: text,
        ocr_confidence: confidence,
        method: 'local_ocr',
        duration_ms: durationMs
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      await trackAIUsage(tenantId, {
        service: 'tesseract',
        model: 'eng',
        durationMs,
        sessionId,
        success: false,
        errorMessage: err.message
      });
      return {
        success: false,
        error: err.message,
        products: [],
        method: 'local_ocr'
      };
    }
  }

  // Cloud AI Vision mode
  // Fetch API keys from Niyam Base App (BYOK - keys stay local to user)
  let service = apiConfig?.service || apiConfig?.provider;
  let apiKey = apiConfig?.apiKey;
  let model = apiConfig?.model;

  // If no API key provided, fetch from Niyam
  if (!apiKey) {
    try {
      if (service) {
        // User specified a provider, fetch that key
        apiKey = await getApiKey(service);
        if (!apiKey) {
          return {
            success: false,
            error: `No API key configured for ${service}. Please add your key in Niyam Settings > API Keys.`,
            products: [],
            method: 'cloud_vision'
          };
        }
      } else {
        // Auto-select best available provider
        const best = await getBestAvailableProvider();
        if (!best) {
          return {
            success: false,
            error: 'No AI API keys configured. Please add your OpenAI or Anthropic key in Niyam Settings > API Keys.',
            products: [],
            method: 'cloud_vision'
          };
        }
        service = best.provider;
        apiKey = best.key;
      }
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch API key: ${err.message}`,
        products: [],
        method: 'cloud_vision'
      };
    }
  }
  
  // Ensure service is set
  service = service || 'openai';

  try {
    let result;
    let tokensInput = 0;
    let tokensOutput = 0;
    let modelUsed = model;

    if (service === 'openai') {
      modelUsed = model || 'gpt-4o-mini';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelUsed,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: INVENTORY_EXTRACTION_PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 4096,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      tokensInput = data.usage?.prompt_tokens || 0;
      tokensOutput = data.usage?.completion_tokens || 0;
      
      const content = data.choices?.[0]?.message?.content;
      result = JSON.parse(content);

    } else if (service === 'anthropic') {
      modelUsed = model || 'claude-3-5-sonnet-20241022';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelUsed,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: imageBase64
                  }
                },
                { type: 'text', text: INVENTORY_EXTRACTION_PROMPT }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      tokensInput = data.usage?.input_tokens || 0;
      tokensOutput = data.usage?.output_tokens || 0;
      
      const content = data.content?.[0]?.text;
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      result = JSON.parse(jsonMatch[1]);

    } else {
      throw new Error(`Unsupported AI service: ${service}`);
    }

    const durationMs = Date.now() - startTime;

    // Track usage
    await trackAIUsage(tenantId, {
      service,
      model: modelUsed,
      operation: 'extract_inventory',
      tokensInput,
      tokensOutput,
      durationMs,
      sessionId,
      success: true,
      metadata: { productsFound: result.products?.length || 0 }
    });

    return {
      success: true,
      ...result,
      method: 'cloud_vision',
      service,
      model: modelUsed,
      tokens_used: tokensInput + tokensOutput,
      duration_ms: durationMs
    };

  } catch (err) {
    const durationMs = Date.now() - startTime;
    await trackAIUsage(tenantId, {
      service,
      model: model || 'unknown',
      durationMs,
      sessionId,
      success: false,
      errorMessage: err.message
    });
    return {
      success: false,
      error: err.message,
      products: [],
      method: 'cloud_vision'
    };
  }
}

/**
 * Extract from PDF using pdf-parse
 */
async function extractFromPDF(pdfBuffer, tenantId, sessionId = null) {
  const startTime = Date.now();
  
  try {
    let pdfParse;
    try {
      pdfParse = require('pdf-parse');
    } catch (e) {
      return {
        success: false,
        error: 'pdf-parse not installed',
        products: [],
        method: 'pdf_text'
      };
    }

    const data = await pdfParse(pdfBuffer);
    const result = parseOCRText(data.text);
    const durationMs = Date.now() - startTime;

    await trackAIUsage(tenantId, {
      service: 'pdf-parse',
      model: 'text',
      operation: 'extract_inventory',
      durationMs,
      sessionId,
      success: true,
      metadata: { pages: data.numpages, productsFound: result.products.length }
    });

    return {
      success: true,
      ...result,
      raw_text: data.text,
      pages: data.numpages,
      method: 'pdf_text',
      duration_ms: durationMs
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      products: [],
      method: 'pdf_text'
    };
  }
}

module.exports = {
  extractInventoryData,
  extractFromPDF,
  trackAIUsage,
  getAIUsageStats,
  parseOCRText,
  INVENTORY_EXTRACTION_PROMPT
};
