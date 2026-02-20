// Services barrel export

const taxCodeService = require('./taxCodeService');
const tdsService = require('./tdsService');
const gstService = require('./gstService');

module.exports = {
  taxCodeService,
  tdsService,
  gstService
};
