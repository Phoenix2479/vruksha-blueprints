// Routes barrel export

const gatewaysRouter = require('./gateways');
const transactionsRouter = require('./transactions');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  gatewaysRouter,
  transactionsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
