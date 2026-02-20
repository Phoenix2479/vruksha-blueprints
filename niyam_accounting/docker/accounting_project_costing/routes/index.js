const { router: healthRouter, setDbReady, setStarted } = require('./health');
const projectsRouter = require('./projects');

module.exports = { healthRouter, projectsRouter, setDbReady, setStarted };
