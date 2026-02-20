// Routes barrel export

const dashboardRouter = require('./dashboard');
const productsRouter = require('./products');
const trendsRouter = require('./trends');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  dashboardRouter,
  productsRouter,
  trendsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
