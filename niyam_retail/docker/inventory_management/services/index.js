// Services barrel export

const productService = require('./productService');
const stockService = require('./stockService');
const importService = require('./importService');
const aiExtractor = require('./aiExtractor');
const templateService = require('./templateService');
const sessionService = require('./sessionService');

module.exports = {
  productService,
  stockService,
  importService,
  aiExtractor,
  templateService,
  sessionService
};
