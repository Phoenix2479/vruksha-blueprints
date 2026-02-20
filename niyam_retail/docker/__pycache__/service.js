const express = require('express');
const app = express();
app.use(express.json());
const started = Date.now();
app.get('/healthz', (req,res)=> res.json({ status: 'ok' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8940;
app.listen(PORT, ()=> console.log('service listening on', PORT));
