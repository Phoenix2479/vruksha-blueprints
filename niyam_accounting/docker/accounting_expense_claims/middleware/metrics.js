// Prometheus metrics and request logging middleware

const promClient = require('prom-client');
const { DEFAULT_TENANT_ID } = require('../config/constants');

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });

const httpHistogram = new promClient.Histogram({
  name: 'accounting_expense_claims_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

function requestLogger(req, res, next) {
  const startHr = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - startHr) / 1e9;
    const route = req.route?.path || req.path;
    httpHistogram.labels(req.method, route, String(res.statusCode)).observe(dur);
    const log = {
      svc: 'accounting_expense_claims',
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      tenant_id: req.headers['x-tenant-id'] || DEFAULT_TENANT_ID,
      duration_ms: Math.round(dur * 1000),
    };
    try { console.log(JSON.stringify(log)); } catch (_) { /* noop */ }
  });
  next();
}

async function metricsHandler(req, res) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}

module.exports = {
  registry,
  requestLogger,
  metricsHandler
};
