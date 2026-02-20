// Routes barrel export

const cartsRouter = require('./carts');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  cartsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
