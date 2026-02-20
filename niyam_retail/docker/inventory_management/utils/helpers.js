// General helper functions

function parseNumberFlexible(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const cleaned = val
    .trim()
    .replace(/%/g, '')
    .replace(/[^0-9+\-\.]/g, '')
    .replace(/(\.)(?=.*\.)/g, '');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

const pick = (obj, keys) => keys.reduce((acc, k) => {
  if (obj[k] != null) acc[k] = obj[k];
  return acc;
}, {});

module.exports = {
  parseNumberFlexible,
  pick
};
