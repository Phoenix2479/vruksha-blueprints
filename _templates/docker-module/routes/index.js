const router = require('express').Router();

// Example: List items
router.get('/items', async (req, res) => {
  try {
    // Replace with your business logic
    res.json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'ERR_INTERNAL', message: err.message } });
  }
});

// Example: Create item
router.post('/items', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: { code: 'ERR_VALIDATION', message: 'Name is required' } });
    }
    // Replace with your business logic
    res.status(201).json({ success: true, data: { name } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'ERR_INTERNAL', message: err.message } });
  }
});

module.exports = router;
