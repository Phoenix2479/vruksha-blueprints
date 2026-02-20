const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../../shared/db');

// Example: List items
router.get('/items', (req, res) => {
  try {
    const items = query('SELECT * FROM items ORDER BY created_at DESC LIMIT 200');
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Example: Create item
router.post('/items', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    const id = uuidv4();
    run('INSERT INTO items (id, name, created_at) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
    res.status(201).json({ success: true, data: { id, name } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
