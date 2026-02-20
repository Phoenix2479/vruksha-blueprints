const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8895;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const initChat = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY, customer_id TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, closed_at TEXT
  )`);
  run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'customer_chat_ai', mode: 'lite' }));

// Start chat session
app.post('/chat/start', (req, res) => {
  try {
    const { customer_id } = req.body;
    const sessionId = uuidv4();
    run('INSERT INTO chat_sessions (id, customer_id) VALUES (?, ?)', [sessionId, customer_id]);
    
    // Welcome message
    const welcomeId = uuidv4();
    run('INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)',
      [welcomeId, sessionId, 'assistant', 'Hello! How can I help you today?']);
    
    res.json({ success: true, session_id: sessionId, message: 'Hello! How can I help you today?' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Send message
app.post('/chat/message', (req, res) => {
  try {
    const { session_id, message } = req.body;
    if (!session_id || !message) return res.status(400).json({ success: false, error: 'session_id and message required' });
    
    // Save user message
    run('INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)',
      [uuidv4(), session_id, 'user', message]);
    
    // Simple intent detection and response
    const lowerMsg = message.toLowerCase();
    let response = "I'm here to help! Could you please provide more details?";
    
    if (lowerMsg.includes('order') && lowerMsg.includes('status')) {
      response = "To check your order status, please provide your order number or I can look it up by your email.";
    } else if (lowerMsg.includes('return') || lowerMsg.includes('refund')) {
      response = "For returns and refunds, items must be returned within 30 days in original condition. Would you like to start a return?";
    } else if (lowerMsg.includes('price') || lowerMsg.includes('cost')) {
      response = "I can help you with pricing information. Which product are you interested in?";
    } else if (lowerMsg.includes('hours') || lowerMsg.includes('open')) {
      response = "We're open Monday-Saturday 9AM-8PM and Sunday 10AM-6PM.";
    } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
      response = "Hello! What can I help you with today?";
    } else if (lowerMsg.includes('thank')) {
      response = "You're welcome! Is there anything else I can help you with?";
    }
    
    // Save assistant response
    run('INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)',
      [uuidv4(), session_id, 'assistant', response]);
    
    res.json({ success: true, response });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get chat history
app.get('/chat/:session_id/history', (req, res) => {
  try {
    const messages = query('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at', [req.params.session_id]);
    res.json({ success: true, messages });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// End chat
app.post('/chat/:session_id/end', (req, res) => {
  try {
    run('UPDATE chat_sessions SET status = ?, closed_at = ? WHERE id = ?', ['closed', new Date().toISOString(), req.params.session_id]);
    res.json({ success: true, message: 'Chat session ended' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'customer_chat_ai', mode: 'lite', status: 'running' });
});

initChat().then(() => app.listen(PORT, () => console.log(`[Customer Chat AI Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
