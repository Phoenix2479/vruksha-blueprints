// Accounting Integration Bridge - Thin entry point
// NATS subscriptions and event handlers in services/bridgeService.js
// Route handlers in routes/

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { mountRoutes } = require('./routes');
const { bridgeService } = require('./services');

const app = express();
const PORT = process.env.PORT || 8849;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json());

// Mount all routes
mountRoutes(app);

// Start server and NATS subscriptions
app.listen(PORT, async () => {
  console.log(`\nAccounting Integration Bridge running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/healthz`);

  // Setup NATS subscriptions (from bridgeService)
  await bridgeService.setupNatsSubscriptions();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await bridgeService.shutdownNats();
  process.exit(0);
});
