// Routes barrel - mounts all route modules

const healthRoutes = require('./health');
const bridgeRoutes = require('./bridge');

function mountRoutes(app) {
  // Health routes (top-level)
  app.use(healthRoutes);

  // Bridge routes (trigger endpoints, mappings)
  app.use(bridgeRoutes);
}

module.exports = { mountRoutes };
