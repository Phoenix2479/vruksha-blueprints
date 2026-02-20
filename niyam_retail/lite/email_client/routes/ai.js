/**
 * AI Features Routes
 */

const express = require('express');
const router = express.Router();
const { query } = require('@vruksha/platform/db/postgres');
const AIService = require('../services/ai-service');

const aiService = new AIService();

// Categorize messages
router.post('/categorize', (req, res) => {
  const { messages } = req.body;
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const categorized = aiService.categorizeMessages(messages);
  res.json({ categorized });
});

// Smart replies for a message
router.get('/smart-reply/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { account } = req.query;

    let sql = `
      SELECT m.* FROM email_messages m
      JOIN email_accounts a ON m.account_id = a.id
      WHERE m.tenant_id = $1 AND m.id = $2
    `;
    const params = [req.tenantId, id];

    if (account) {
      sql += ' AND a.email = $3';
      params.push(account);
    }

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = result.rows[0];
    const replies = aiService.generateSmartReplies({
      subject: message.subject,
      from: message.from_address,
      body: message.body_text
    });

    res.json({ replies });
  } catch (error) {
    next(error);
  }
});

// Summarize a message
router.get('/summarize/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { account } = req.query;

    let sql = `
      SELECT m.* FROM email_messages m
      JOIN email_accounts a ON m.account_id = a.id
      WHERE m.tenant_id = $1 AND m.id = $2
    `;
    const params = [req.tenantId, id];

    if (account) {
      sql += ' AND a.email = $3';
      params.push(account);
    }

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = result.rows[0];
    const summary = aiService.summarizeMessage({
      body: message.body_text,
      snippet: message.body_text?.substring(0, 200)
    });

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

// Bulk categorize (process messages in DB)
router.post('/bulk-categorize', async (req, res, next) => {
  try {
    const { account } = req.body;

    let sql = `
      SELECT m.id, m.subject, m.from_address, m.body_text
      FROM email_messages m
      JOIN email_accounts a ON m.account_id = a.id
      WHERE m.tenant_id = $1 AND m.ai_category IS NULL
    `;
    const params = [req.tenantId];

    if (account) {
      sql += ' AND a.email = $2';
      params.push(account);
    }

    sql += ' LIMIT 100';

    const result = await query(sql, params);
    let updated = 0;

    for (const msg of result.rows) {
      const category = aiService.categorizeMessage({
        subject: msg.subject,
        from: msg.from_address,
        body: msg.body_text
      });
      const priority = aiService.calculatePriority({
        subject: msg.subject
      });

      await query(
        'UPDATE email_messages SET ai_category = $1, ai_priority = $2 WHERE id = $3',
        [category, priority, msg.id]
      );
      updated++;
    }

    res.json({ message: 'Bulk categorization complete', processed: updated });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
