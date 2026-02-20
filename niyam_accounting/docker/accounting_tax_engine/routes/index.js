// Routes barrel export

const healthRouter = require('./health');
const taxCodesRouter = require('./taxCodes');
const tdsRouter = require('./tds');
const gstReturnsRouter = require('./gstReturns');
const validationRouter = require('./validation');
const reportsRouter = require('./reports');

module.exports = {
  healthRouter,
  taxCodesRouter,
  tdsRouter,
  gstReturnsRouter,
  validationRouter,
  reportsRouter
};
