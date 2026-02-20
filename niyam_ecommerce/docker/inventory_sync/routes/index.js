// Routes barrel export

const stockRouter = require('./stock');
const reservationsRouter = require('./reservations');
const sourcesRouter = require('./sources');
const alertsRouter = require('./alerts');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  stockRouter,
  reservationsRouter,
  sourcesRouter,
  alertsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
