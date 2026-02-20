// Routes barrel export

const customersRouter = require('./customers');
const addressesRouter = require('./addresses');
const wishlistsRouter = require('./wishlists');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  customersRouter,
  addressesRouter,
  wishlistsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
