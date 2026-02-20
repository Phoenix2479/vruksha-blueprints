const { router: healthRouter, setDbReady, setStarted } = require('./health');
const payrollRouter = require('./payroll');

module.exports = { healthRouter, payrollRouter, setDbReady, setStarted };
