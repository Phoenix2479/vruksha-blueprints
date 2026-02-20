// Utils barrel export

const { parseNumberFlexible, pick } = require('./helpers');
const { codePart, sanitizeSku, ensureUniqueSku, generateSkuForProduct } = require('./skuGenerator');
const { normalizeRow } = require('./normalizer');
const { mapProductRow, getProductWithInventory } = require('./productMapper');

module.exports = {
  parseNumberFlexible,
  pick,
  codePart,
  sanitizeSku,
  ensureUniqueSku,
  generateSkuForProduct,
  normalizeRow,
  mapProductRow,
  getProductWithInventory
};
