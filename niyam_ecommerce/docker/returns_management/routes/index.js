// Routes barrel export

const returnsRouter = require('./returns');
const exchangesRouter = require('./exchanges');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  returnsRouter,
  exchangesRouter,
  healthRouter,
  setDbReady,
  setStarted
};
