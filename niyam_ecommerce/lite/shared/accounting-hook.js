/**
 * Accounting Integration Hook (Fire-and-forget)
 * Sends financial events to the accounting integration bridge.
 * Uses Node built-in http — no external dependencies.
 * Never throws or blocks the caller.
 */

const http = require('http');

const BRIDGE_HOST = process.env.ACCOUNTING_BRIDGE_HOST || 'localhost';
const BRIDGE_PORT = process.env.ACCOUNTING_BRIDGE_PORT || '8860';

function notifyAccounting(source, eventType, payload) {
  if (process.env.DISABLE_ACCOUNTING_HOOK === 'true') return;
  try {
    const data = JSON.stringify({ source, event_type: eventType, payload, timestamp: new Date().toISOString() });
    const req = http.request({
      hostname: BRIDGE_HOST,
      port: parseInt(BRIDGE_PORT, 10),
      path: '/api/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 3000
    });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(data);
    req.end();
  } catch (e) { /* silent — never break the caller */ }
}

module.exports = { notifyAccounting };
