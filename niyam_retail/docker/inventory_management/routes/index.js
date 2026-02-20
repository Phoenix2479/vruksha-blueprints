// Routes barrel export

const productsRouter = require('./products');
const stockRouter = require('./stock');
const importRouter = require('./import');
const { router: healthRouter, setDbReady, setStarted } = require('./health');
const warehouseRouter = require('./warehouse');
const alertsRouter = require('./alerts');
const catalogRouter = require('./catalog');

module.exports = {
  productsRouter,
  stockRouter,
  importRouter,
  healthRouter,
  warehouseRouter,
  alertsRouter,
  catalogRouter,
  setDbReady,
  setStarted
};
