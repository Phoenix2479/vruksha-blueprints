const { router: healthRouter, setDbReady, setStarted } = require('./health');
const assetsRouter = require('./assets');

module.exports = { healthRouter, assetsRouter, setDbReady, setStarted };
