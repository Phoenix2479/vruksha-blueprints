/**
 * Niyam API Keys Bridge
 * Fetches API keys from Niyam Base App's secure storage
 * 
 * Keys are stored encrypted in ~/.niyam/data/api_keys/keys.json
 * This module provides a bridge for Lite apps to access them
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Niyam Base App URL (Python FastAPI server)
const NIYAM_BASE_URL = process.env.NIYAM_BASE_URL || 'http://localhost:8000';

// Cache for keys (short TTL to respect any key changes)
const keyCache = new Map();
const CACHE_TTL = 60000; // 1 minute

// Supported providers
const PROVIDERS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
  OPENROUTER: 'openrouter'
};

/**
 * Fetch API key from Niyam Base App
 * Uses the internal endpoint that only works from localhost
 * 
 * @param {string} provider - Provider name (anthropic, openai, etc.)
 * @returns {Promise<string|null>} - Decrypted API key or null
 */
async function getApiKey(provider) {
  provider = provider.toLowerCase().trim();
  
  // Check cache first
  const cached = keyCache.get(provider);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.key;
  }
  
  try {
    const key = await fetchKeyFromNiyam(provider);
    
    // Cache the result (even null, to avoid repeated failed requests)
    keyCache.set(provider, { key, timestamp: Date.now() });
    
    return key;
  } catch (err) {
    console.error(`[NiyamApiKeys] Failed to fetch ${provider} key:`, err.message);
    return null;
  }
}

/**
 * Internal function to fetch key from Niyam's API
 */
function fetchKeyFromNiyam(provider) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/admin/api-keys/internal/${provider}/key`, NIYAM_BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.get(url.href, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'X-Internal-Request': 'true'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve(json.key || null);
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else if (res.statusCode === 404) {
          // No key configured - not an error
          resolve(null);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Check if Niyam Base App is running
 * @returns {Promise<boolean>}
 */
async function isNiyamRunning() {
  return new Promise((resolve) => {
    const url = new URL('/healthz', NIYAM_BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.get(url.href, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Get the best available AI provider
 * Checks which providers have keys configured
 * @returns {Promise<{provider: string, key: string}|null>}
 */
async function getBestAvailableProvider() {
  // Priority order: anthropic > openai > gemini > openrouter > ollama
  const priority = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'];
  
  for (const provider of priority) {
    const key = await getApiKey(provider);
    if (key) {
      return { provider, key };
    }
  }
  
  return null;
}

/**
 * Get all configured providers
 * @returns {Promise<string[]>} - List of provider names with keys
 */
async function getConfiguredProviders() {
  const configured = [];
  
  for (const provider of Object.values(PROVIDERS)) {
    const key = await getApiKey(provider);
    if (key) {
      configured.push(provider);
    }
  }
  
  return configured;
}

/**
 * Clear the key cache
 * Call this if you know keys have been updated
 */
function clearCache() {
  keyCache.clear();
}

/**
 * Get API key with fallback chain
 * Tries providers in order until one works
 * @param {string[]} providers - Provider names to try
 * @returns {Promise<{provider: string, key: string}|null>}
 */
async function getKeyWithFallback(providers) {
  for (const provider of providers) {
    const key = await getApiKey(provider);
    if (key) {
      return { provider, key };
    }
  }
  return null;
}

// ============================================
// Direct File Access (Fallback for offline)
// ============================================

/**
 * Check if keys file exists (for offline detection)
 * Note: We can't decrypt without Niyam running
 */
function hasLocalKeyFile() {
  const keyFile = path.join(os.homedir(), '.niyam', 'data', 'api_keys', 'keys.json');
  return fs.existsSync(keyFile);
}

/**
 * Get hint about which providers are configured
 * Reads the encrypted file to see provider names (not keys)
 * @returns {string[]} - Provider names that have keys (can't decrypt them)
 */
function getLocalProviderHints() {
  try {
    const keyFile = path.join(os.homedir(), '.niyam', 'data', 'api_keys', 'keys.json');
    if (!fs.existsSync(keyFile)) return [];
    
    const stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    const keys = stored?.data?.keys || {};
    return Object.keys(keys);
  } catch {
    return [];
  }
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Core functions
  getApiKey,
  getBestAvailableProvider,
  getConfiguredProviders,
  getKeyWithFallback,
  
  // Utilities
  isNiyamRunning,
  clearCache,
  hasLocalKeyFile,
  getLocalProviderHints,
  
  // Constants
  PROVIDERS,
  NIYAM_BASE_URL
};
