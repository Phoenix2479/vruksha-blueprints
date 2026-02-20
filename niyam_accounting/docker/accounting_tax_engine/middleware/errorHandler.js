// Global error handler middleware

function errorHandler(err, req, res, next) {
  console.error('[Tax Engine] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
}

module.exports = { errorHandler };
