const { router: healthRouter, setDbReady, setStarted } = require('./health');
const valuationRouter = require('./valuation');

module.exports = { healthRouter, valuationRouter, setDbReady, setStarted };
