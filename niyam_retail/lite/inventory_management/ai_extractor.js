/**
 * AI Inventory Extractor
 * Extracts structured inventory data from images and PDFs
 * 
 * BYOK Architecture:
 * - API keys are stored encrypted in Niyam Base App (~/.niyam/data/api_keys/)
 * - This module fetches keys from Niyam via internal localhost API
 * - No keys are sent to Vruksha server - everything stays local
 * - Falls back to local OCR if no AI keys configured
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import shared API key bridge
const { getApiKey, getBestAvailableProvider, isNiyamRunning, PROVIDERS } = require('../shared/niyamApiKeys');

const APP_ID = 'inventory_management';

// AI Usage tracking file (local backup, primary tracking in gateway)
const AI_USAGE_FILE = path.join(os.homedir(), '.niyam', 'data', 'ai_usage.json');

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

/**
 * Track AI usage for transparency
 */
function trackAIUsage(service, model, tokensUsed, sessionId) {
  try {
    const dataDir = path.dirname(AI_USAGE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let usage = { total_calls: 0, total_tokens: 0, by_month: {}, history: [] };
    if (fs.existsSync(AI_USAGE_FILE)) {
      usage = JSON.parse(fs.readFileSync(AI_USAGE_FILE, 'utf8'));
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    usage.total_calls++;
    usage.total_tokens += tokensUsed || 0;
    
    if (!usage.by_month[monthKey]) {
      usage.by_month[monthKey] = { calls: 0, tokens: 0 };
    }
    usage.by_month[monthKey].calls++;
    usage.by_month[monthKey].tokens += tokensUsed || 0;

    usage.history.push({
      timestamp: now.toISOString(),
      service,
      model,
      tokens: tokensUsed,
      session_id: sessionId
    });

    // Keep only last 1000 history entries
    if (usage.history.length > 1000) {
      usage.history = usage.history.slice(-1000);
    }

    fs.writeFileSync(AI_USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (err) {
    console.error('[AI Extractor] Failed to track usage:', err.message);
  }
}

/**
 * Get AI usage stats
 */
function getAIUsageStats() {
  try {
    if (!fs.existsSync(AI_USAGE_FILE)) {
      return { total_calls: 0, total_tokens: 0, by_month: {} };
    }
    const usage = JSON.parse(fs.readFileSync(AI_USAGE_FILE, 'utf8'));
    return {
      total_calls: usage.total_calls,
      total_tokens: usage.total_tokens,
      by_month: usage.by_month
    };
  } catch (err) {
    return { total_calls: 0, total_tokens: 0, by_month: {} };
  }
}

/**
 * Extract text using local OCR (Tesseract.js compatible output)
 * This is a placeholder - actual Tesseract.js runs in browser
 * Server-side we use simpler text extraction
 */
async function localOCRExtract(imageBuffer, mimeType) {
  // For PDFs, we'd use pdf-parse or similar
  // For images, Tesseract runs client-side
  // This server endpoint receives already-extracted text from client
  
  console.log('[AI Extractor] Local OCR requested - expecting client-side extraction');
  
  return {
    text: '',
    confidence: 0,
    method: 'client_ocr_required'
  };
}

/**
 * Parse OCR text into structured data using heuristics
 */
function parseOCRText(text, customPrompt) {
  const lines = text.split('\n').filter(l => l.trim());
  const products = [];
  
  // Common patterns for inventory data
  const patterns = {
    // SKU patterns: alphanumeric codes
    sku: /^([A-Z0-9][-A-Z0-9]{2,15})\s/i,
    // Price patterns: currency symbols or decimal numbers
    price: /(?:[$₹€£]|rs\.?|inr)\s*([0-9,]+\.?\d*)|([0-9,]+\.?\d*)\s*(?:[$₹€£]|rs\.?|inr)/i,
    // Quantity patterns
    quantity: /(\d+)\s*(?:pcs?|units?|nos?|qty|pieces?|items?)/i,
    // Rate/price per unit
    rate: /(?:rate|price|cost|mrp)\s*:?\s*([0-9,]+\.?\d*)/i,
  };
  
  let currentProduct = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Try to detect product line
    const skuMatch = trimmed.match(patterns.sku);
    const priceMatch = trimmed.match(patterns.price);
    const qtyMatch = trimmed.match(patterns.quantity);
    
    if (skuMatch || (trimmed.length > 5 && trimmed.length < 100)) {
      // Likely a product line
      if (currentProduct && currentProduct.name) {
        products.push(currentProduct);
      }
      
      currentProduct = {
        sku: skuMatch ? skuMatch[1] : null,
        name: skuMatch ? trimmed.replace(skuMatch[0], '').trim() : trimmed,
        confidence: 'low'
      };
      
      if (priceMatch) {
        const price = parseFloat((priceMatch[1] || priceMatch[2]).replace(/,/g, ''));
        currentProduct.cost = price;
      }
      
      if (qtyMatch) {
        currentProduct.quantity = parseInt(qtyMatch[1]);
      }
    } else if (currentProduct) {
      // Additional info for current product
      if (priceMatch && !currentProduct.cost) {
        currentProduct.cost = parseFloat((priceMatch[1] || priceMatch[2]).replace(/,/g, ''));
      }
      if (qtyMatch && !currentProduct.quantity) {
        currentProduct.quantity = parseInt(qtyMatch[1]);
      }
    }
  }
  
  if (currentProduct && currentProduct.name) {
    products.push(currentProduct);
  }
  
  return {
    products,
    supplier_detected: null,
    document_type: 'unknown',
    extraction_notes: 'Extracted using local OCR heuristics'
  };
}

/**
 * Call cloud AI for vision extraction
 * Fetches API keys from Niyam Base App (BYOK - keys stay local)
 */
async function cloudAIExtract(imageBase64, mimeType, apiConfig, sessionId) {
  // Check if Niyam Base App is running
  const niyamRunning = await isNiyamRunning();
  
  if (!niyamRunning) {
    throw new Error('Niyam Base App is not running. Please start Niyam to use AI features.');
  }
  
  // Get the best available provider from Niyam's key store
  let provider, apiKey;
  
  if (apiConfig?.provider) {
    // User requested specific provider
    provider = apiConfig.provider;
    apiKey = await getApiKey(provider);
    if (!apiKey) {
      throw new Error(`No API key configured for ${provider}. Please add your key in Niyam Settings > API Keys.`);
    }
  } else {
    // Auto-select best available provider
    const best = await getBestAvailableProvider();
    if (!best) {
      throw new Error('No AI API keys configured. Please add your OpenAI or Anthropic key in Niyam Settings > API Keys.');
    }
    provider = best.provider;
    apiKey = best.key;
  }
  
  console.log(`[AI Extractor] Using provider: ${provider}`);
  
  // Use specified model or provider defaults
  const model = apiConfig?.model || getDefaultModel(provider);
  
  let result;
  let tokensUsed = 0;
  
  if (provider === 'openai') {
    result = await callOpenAI(imageBase64, mimeType, apiKey, model);
    tokensUsed = result.usage?.total_tokens || 0;
  } else if (provider === 'anthropic') {
    result = await callAnthropic(imageBase64, mimeType, apiKey, model);
    tokensUsed = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);
  } else if (provider === 'gemini') {
    result = await callGemini(imageBase64, mimeType, apiKey, model);
    tokensUsed = result.usage?.total_tokens || 0;
  } else {
    throw new Error(`Unsupported AI provider: ${provider}. Supported: openai, anthropic, gemini.`);
  }
  
  trackAIUsage(provider, model, tokensUsed, sessionId);
  
  return result;
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider) {
  const defaults = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-pro'
  };
  return defaults[provider] || defaults.openai;
}

/**
 * Call OpenAI Vision API
 */
async function callOpenAI(imageBase64, mimeType, apiKey, model = 'gpt-4o') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: INVENTORY_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' }
            }
          ]
        }
      ],
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    data: JSON.parse(data.choices[0]?.message?.content),
    usage: data.usage,
    model: data.model,
    provider: 'openai'
  };
}

/**
 * Call Anthropic Claude Vision API
 */
async function callAnthropic(imageBase64, mimeType, apiKey, model = 'claude-3-5-sonnet-20241022') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: INVENTORY_EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: 'Extract inventory data from this document. Return JSON only.' }
        ]
      }]
    })
  });
  
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${await response.text()}`);
  }
  
  const data = await response.json();
  const content = data.content[0]?.text;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  
  return {
    data: JSON.parse(jsonMatch ? jsonMatch[0] : content),
    usage: data.usage,
    model: data.model,
    provider: 'anthropic'
  };
}

/**
 * Call Google Gemini Vision API
 */
async function callGemini(imageBase64, mimeType, apiKey, model = 'gemini-1.5-pro') {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: INVENTORY_EXTRACTION_PROMPT + '\n\nExtract inventory data from this document. Return JSON only.' },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${await response.text()}`);
  }
  
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const jsonMatch = content?.match(/\{[\s\S]*\}/);
  
  return {
    data: JSON.parse(jsonMatch ? jsonMatch[0] : content),
    usage: { total_tokens: data.usageMetadata?.totalTokenCount || 0 },
    model: model,
    provider: 'gemini'
  };
}

/**
 * Main extraction function
 */
async function extractInventoryData(options) {
  const {
    imageBuffer,
    imageBase64,
    mimeType,
    mode = 'local', // 'local' or 'cloud'
    ocrText, // Pre-extracted OCR text from client
    apiConfig, // { provider, apiKey, model }
    supplierTemplate,
    sessionId
  } = options;
  
  console.log(`[AI Extractor] Starting extraction, mode: ${mode}`);
  
  try {
    let result;
    
    if (mode === 'local') {
      // Use OCR text if provided, otherwise try local extraction
      if (ocrText) {
        result = parseOCRText(ocrText, supplierTemplate?.ai_prompt_template);
      } else {
        const ocr = await localOCRExtract(imageBuffer, mimeType);
        result = parseOCRText(ocr.text, supplierTemplate?.ai_prompt_template);
      }
      
      return {
        success: true,
        data: result,
        confidence: 0.5,
        method: 'local_ocr'
      };
    } else if (mode === 'cloud') {
      const base64 = imageBase64 || imageBuffer.toString('base64');
      const aiResult = await cloudAIExtract(base64, mimeType, apiConfig, sessionId);
      
      return {
        success: true,
        data: aiResult.data,
        confidence: 0.9,
        method: 'cloud_ai',
        model: aiResult.model,
        usage: aiResult.usage
      };
    } else {
      throw new Error(`Unknown extraction mode: ${mode}`);
    }
  } catch (err) {
    console.error('[AI Extractor] Extraction failed:', err);
    return {
      success: false,
      error: err.message,
      data: { products: [], extraction_notes: `Extraction failed: ${err.message}` }
    };
  }
}

module.exports = {
  extractInventoryData,
  parseOCRText,
  getAIUsageStats,
  trackAIUsage,
  INVENTORY_EXTRACTION_PROMPT
};
