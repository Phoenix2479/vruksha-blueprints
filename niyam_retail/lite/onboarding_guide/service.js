const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8884;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

// Add onboarding table
const initOnboarding = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS onboarding_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    step TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'onboarding_guide', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'onboarding_guide' }));

// Define onboarding steps
const ONBOARDING_STEPS = [
  { id: 'welcome', name: 'Welcome', description: 'Introduction to the system' },
  { id: 'company_setup', name: 'Company Setup', description: 'Configure your company details' },
  { id: 'first_product', name: 'Add First Product', description: 'Create your first product' },
  { id: 'inventory_setup', name: 'Set Up Inventory', description: 'Configure stock levels' },
  { id: 'first_sale', name: 'Make First Sale', description: 'Complete your first transaction' },
  { id: 'add_customer', name: 'Add Customer', description: 'Create a customer profile' },
  { id: 'reports_intro', name: 'Explore Reports', description: 'View your analytics dashboard' },
  { id: 'complete', name: 'All Done!', description: 'Onboarding complete' }
];

// Get onboarding status
app.get('/onboarding/status', (req, res) => {
  try {
    const { user_id } = req.query;
    const progress = query('SELECT * FROM onboarding_progress WHERE user_id = ? OR user_id IS NULL', [user_id]);
    const completedSteps = progress.filter(p => p.completed).map(p => p.step);
    
    const steps = ONBOARDING_STEPS.map(step => ({
      ...step,
      completed: completedSteps.includes(step.id)
    }));
    
    const totalSteps = ONBOARDING_STEPS.length;
    const completedCount = completedSteps.length;
    
    res.json({
      success: true,
      steps,
      progress: {
        completed: completedCount,
        total: totalSteps,
        percent: Math.round((completedCount / totalSteps) * 100)
      },
      is_complete: completedCount >= totalSteps - 1 // -1 for 'complete' step
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Complete a step
app.post('/onboarding/complete-step', (req, res) => {
  try {
    const { user_id, step, data } = req.body;
    if (!step) return res.status(400).json({ success: false, error: 'Step required' });
    
    const existing = get('SELECT * FROM onboarding_progress WHERE (user_id = ? OR user_id IS NULL) AND step = ?', [user_id, step]);
    if (existing) {
      run('UPDATE onboarding_progress SET completed = 1, completed_at = ?, data = ? WHERE id = ?',
        [new Date().toISOString(), data ? JSON.stringify(data) : null, existing.id]);
    } else {
      run('INSERT INTO onboarding_progress (id, user_id, step, completed, completed_at, data) VALUES (?, ?, ?, 1, ?, ?)',
        [uuidv4(), user_id, step, new Date().toISOString(), data ? JSON.stringify(data) : null]);
    }
    
    res.json({ success: true, step, completed: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Skip a step
app.post('/onboarding/skip-step', (req, res) => {
  try {
    const { user_id, step } = req.body;
    if (!step) return res.status(400).json({ success: false, error: 'Step required' });
    
    // Mark as completed but with skip flag
    const existing = get('SELECT * FROM onboarding_progress WHERE (user_id = ? OR user_id IS NULL) AND step = ?', [user_id, step]);
    if (existing) {
      run('UPDATE onboarding_progress SET completed = 1, completed_at = ?, data = ? WHERE id = ?',
        [new Date().toISOString(), JSON.stringify({ skipped: true }), existing.id]);
    } else {
      run('INSERT INTO onboarding_progress (id, user_id, step, completed, completed_at, data) VALUES (?, ?, ?, 1, ?, ?)',
        [uuidv4(), user_id, step, new Date().toISOString(), JSON.stringify({ skipped: true })]);
    }
    
    res.json({ success: true, step, skipped: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Reset onboarding
app.post('/onboarding/reset', (req, res) => {
  try {
    const { user_id } = req.body;
    run('DELETE FROM onboarding_progress WHERE user_id = ? OR user_id IS NULL', [user_id]);
    res.json({ success: true, message: 'Onboarding reset' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get step details
app.get('/onboarding/step/:step', (req, res) => {
  try {
    const step = ONBOARDING_STEPS.find(s => s.id === req.params.step);
    if (!step) return res.status(404).json({ success: false, error: 'Step not found' });
    
    const progress = get('SELECT * FROM onboarding_progress WHERE step = ?', [req.params.step]);
    
    res.json({
      success: true,
      step: {
        ...step,
        completed: progress?.completed || false,
        completed_at: progress?.completed_at,
        data: progress?.data ? JSON.parse(progress.data) : null
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get all steps
app.get('/onboarding/steps', (req, res) => {
  res.json({ success: true, steps: ONBOARDING_STEPS });
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'onboarding_guide', mode: 'lite', status: 'running' });
});

initOnboarding().then(() => app.listen(PORT, () => console.log(`[Onboarding Guide Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
