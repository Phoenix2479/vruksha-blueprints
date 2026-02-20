// Routes barrel export

const abandonedRouter = require('./abandoned');
const recoveryRouter = require('./recovery');
const templatesRouter = require('./templates');
const { router: healthRouter, setDbReady, setStarted } = require('./health');

module.exports = {
  abandonedRouter,
  recoveryRouter,
  templatesRouter,
  healthRouter,
  setDbReady,
  setStarted
};
