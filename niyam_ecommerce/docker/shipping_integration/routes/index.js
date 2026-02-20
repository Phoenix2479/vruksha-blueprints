// Routes barrel export

const carriersRouter = require('./carriers');
const shipmentsRouter = require('./shipments');
const trackingRouter = require('./tracking');
const ratesRouter = require('./rates');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  carriersRouter,
  shipmentsRouter,
  trackingRouter,
  ratesRouter,
  healthRouter,
  setDbReady,
  setStarted
};
