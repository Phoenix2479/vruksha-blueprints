const { router: healthRouter, setDbReady, setStarted } = require('./health');
const vouchersRouter = require('./vouchers');

module.exports = { healthRouter, vouchersRouter, setDbReady, setStarted };
