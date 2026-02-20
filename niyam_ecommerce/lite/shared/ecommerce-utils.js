/**
 * Shared E-commerce Utility Functions
 * Ported from Python ecommerce_utils.py to JavaScript
 */

const { v4: uuidv4 } = require('uuid');

function generateId(prefix = 'ID') {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '');
  return `${prefix}-${ts}-${uuidv4().slice(0, 8)}`;
}

function generateOrderNumber(prefix = 'ORD') {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const serial = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${prefix}-${date}-${serial}`;
}

function calculateTax(subtotal, taxRate) {
  return Math.round(subtotal * (taxRate / 100) * 100) / 100;
}

function applyDiscount(amount, discountType, discountValue) {
  if (amount <= 0) return 0;
  const type = (discountType || '').toLowerCase();
  if (type === 'percentage') {
    return Math.round(amount * Math.min(Math.max(discountValue, 0), 100) / 100 * 100) / 100;
  }
  if (type === 'fixed') {
    return Math.round(Math.min(Math.max(discountValue, 0), amount) * 100) / 100;
  }
  if (type === 'free_shipping') return 0;
  return 0;
}

function formatCurrency(amount, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function validateEmail(email) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email || '');
}

function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
}

module.exports = {
  generateId,
  generateOrderNumber,
  calculateTax,
  applyDiscount,
  formatCurrency,
  validateEmail,
  calculatePercentage
};
