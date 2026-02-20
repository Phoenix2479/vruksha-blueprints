// Routes barrel export

const productsRouter = require('./products');
const categoriesRouter = require('./categories');
const variantsRouter = require('./variants');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  productsRouter,
  categoriesRouter,
  variantsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
