// SKU generation and sanitization utilities

const { query } = require('@vruksha/platform/db/postgres');

function codePart(s, len = 3) {
  if (!s) return '';
  return s.toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);
}

function sanitizeSku(s) {
  return s
    .toString()
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|_/g, (m) => (m === '_' ? '_' : ''));
}

async function ensureUniqueSku(baseSku) {
  let candidate = sanitizeSku(baseSku);
  let suffix = 1;

  while (true) {
    const r = await query('SELECT 1 FROM products WHERE sku = $1', [candidate]);
    if (r.rows.length === 0) return candidate;
    candidate = `${sanitizeSku(baseSku)}-${String(suffix).padStart(2, '0')}`;
    suffix += 1;
    if (suffix > 99) {
      candidate = `${sanitizeSku(baseSku)}-${Date.now().toString().slice(-4)}`;
      const r2 = await query('SELECT 1 FROM products WHERE sku = $1', [candidate]);
      if (r2.rows.length === 0) return candidate;
      throw new Error('Unable to generate unique SKU');
    }
  }
}

async function generateSkuForProduct({ name, category, color, material, design, edition, collection, date }) {
  const now = date ? new Date(date) : new Date();
  const yymm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const parts = [
    codePart(category),
    codePart(color),
    codePart(material),
    yymm,
  ].filter(Boolean);
  let base = parts.join('-');
  if (!base) base = codePart(name, 6) || 'SKU';
  const suffixes = [design, edition, collection].filter(Boolean).map((x) => codePart(x, 2));
  if (suffixes.length) base = `${base}-${suffixes.join('')}`;
  return ensureUniqueSku(base);
}

module.exports = {
  codePart,
  sanitizeSku,
  ensureUniqueSku,
  generateSkuForProduct
};
