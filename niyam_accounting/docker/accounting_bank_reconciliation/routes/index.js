// Routes barrel export

const healthRouter = require('./health');
const bankAccountsRouter = require('./bankAccounts');
const transactionsRouter = require('./transactions');
const reconciliationRouter = require('./reconciliation');
const matchingRouter = require('./matching');
const reportsRouter = require('./reports');

module.exports = {
  healthRouter,
  bankAccountsRouter,
  transactionsRouter,
  reconciliationRouter,
  matchingRouter,
  reportsRouter
};
