// Routes barrel export

const ordersRouter = require('./orders');
const fulfillmentsRouter = require('./fulfillments');
const refundsRouter = require('./refunds');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  ordersRouter,
  fulfillmentsRouter,
  refundsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
