const express = require('express');
const app = express();
const PORT = process.env.PORT || 0; // Replace 0 with your assigned port

app.use(express.json());

// Health endpoints (required by Vruksha)
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready' }));

// Your routes
app.use('/', require('./routes'));

app.listen(PORT, () => {
  console.log(`Module running on port ${PORT}`);
});
