// Routes barrel export

const reviewsRouter = require('./reviews');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  reviewsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
