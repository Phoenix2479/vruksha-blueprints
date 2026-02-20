// Routes barrel export

const couponsRouter = require('./coupons');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  couponsRouter,
  healthRouter,
  setDbReady,
  setStarted
};
