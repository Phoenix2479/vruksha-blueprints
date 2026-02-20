// Point of Sale - Gift Cards Routes
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// Generate unique card number
function generateCardNumber() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(Math.random().toString().substr(2, 4));
  }
  return segments.join('-');
}

// Generate PIN
function generatePIN() {
  return Math.random().toString().substr(2, 4);
}

// ============================================
// GIFT CARDS
// ============================================

const CreateGiftCardSchema = z.object({
  amount: z.number().positive().max(50000),
  customer_id: z.string().uuid().optional(),
  customer_email: z.string().email().optional(),
  expires_days: z.number().int().positive().optional(),
  transaction_id: z.string().uuid().optional()
});

// Issue new gift card
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateGiftCardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { amount, customer_id, customer_email, expires_days, transaction_id } = parsed.data;
    
    const cardNumber = generateCardNumber();
    const pin = generatePIN();
    const expiresAt = expires_days 
      ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default
    
    const result = await query(
      `INSERT INTO gift_cards 
       (tenant_id, card_number, pin, initial_balance, current_balance, purchased_by, issued_transaction_id, expires_at)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, cardNumber, pin, amount, customer_id, transaction_id, expiresAt]
    );
    
    const giftCard = result.rows[0];
    
    // Log initial transaction
    await query(
      `INSERT INTO gift_card_transactions 
       (gift_card_id, transaction_type, amount, balance_before, balance_after, reference_id, reference_type, notes)
       VALUES ($1, 'purchase', $2, 0, $2, $3, 'pos_transaction', 'Gift card issued')`,
      [giftCard.id, amount, transaction_id]
    );
    
    // Publish event
    await publishEnvelope('retail.pos.giftcard.issued.v1', 1, {
      gift_card_id: giftCard.id,
      card_number: cardNumber,
      amount,
      expires_at: expiresAt.toISOString(),
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      gift_card: {
        id: giftCard.id,
        card_number: cardNumber,
        pin,
        balance: amount,
        expires_at: expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Check balance
router.get('/balance/:card_number', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { card_number } = req.params;
    
    const result = await query(
      `SELECT id, card_number, current_balance, status, expires_at, last_used_at
       FROM gift_cards 
       WHERE tenant_id = $1 AND card_number = $2`,
      [tenantId, card_number]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gift card not found' });
    }
    
    const card = result.rows[0];
    
    // Check if expired
    if (new Date(card.expires_at) < new Date()) {
      return res.json({
        success: true,
        card_number,
        balance: 0,
        status: 'expired',
        message: 'Gift card has expired'
      });
    }
    
    res.json({
      success: true,
      card_number,
      balance: parseFloat(card.current_balance),
      status: card.status,
      expires_at: card.expires_at,
      last_used_at: card.last_used_at
    });
  } catch (error) {
    next(error);
  }
});

// Redeem gift card (apply to transaction)
const RedeemSchema = z.object({
  card_number: z.string(),
  pin: z.string().optional(),
  amount: z.number().positive(),
  transaction_id: z.string().uuid().optional()
});

router.post('/redeem', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const tenantId = getTenantId(req);
    const parsed = RedeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { card_number, pin, amount, transaction_id } = parsed.data;
    
    await client.query('BEGIN');
    
    // Get card with lock
    const result = await client.query(
      `SELECT * FROM gift_cards 
       WHERE tenant_id = $1 AND card_number = $2
       FOR UPDATE`,
      [tenantId, card_number]
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Gift card not found' });
    }
    
    const card = result.rows[0];
    
    // Validate PIN if required
    if (card.pin && pin !== card.pin) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid PIN' });
    }
    
    // Check status
    if (card.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Gift card is ${card.status}` });
    }
    
    // Check expiration
    if (new Date(card.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Gift card has expired' });
    }
    
    // Check balance
    const currentBalance = parseFloat(card.current_balance);
    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Insufficient balance',
        available: currentBalance 
      });
    }
    
    const newBalance = currentBalance - amount;
    const newStatus = newBalance === 0 ? 'used' : 'active';
    
    // Update card
    await client.query(
      `UPDATE gift_cards 
       SET current_balance = $1, 
           status = $2, 
           last_used_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [newBalance, newStatus, card.id]
    );
    
    // Log transaction
    await client.query(
      `INSERT INTO gift_card_transactions 
       (gift_card_id, transaction_type, amount, balance_before, balance_after, reference_id, reference_type)
       VALUES ($1, 'redemption', $2, $3, $4, $5, 'pos_transaction')`,
      [card.id, amount, currentBalance, newBalance, transaction_id]
    );
    
    await client.query('COMMIT');
    
    // Publish event
    await publishEnvelope('retail.pos.giftcard.redeemed.v1', 1, {
      gift_card_id: card.id,
      card_number,
      amount_redeemed: amount,
      balance_remaining: newBalance,
      transaction_id,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      amount_applied: amount,
      balance_remaining: newBalance,
      card_status: newStatus
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Add balance (reload)
const ReloadSchema = z.object({
  card_number: z.string(),
  amount: z.number().positive().max(50000),
  transaction_id: z.string().uuid().optional()
});

router.post('/reload', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ReloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { card_number, amount, transaction_id } = parsed.data;
    
    // Get current card
    const cardResult = await query(
      'SELECT * FROM gift_cards WHERE tenant_id = $1 AND card_number = $2',
      [tenantId, card_number]
    );
    
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gift card not found' });
    }
    
    const card = cardResult.rows[0];
    
    if (card.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reload cancelled card' });
    }
    
    const currentBalance = parseFloat(card.current_balance);
    const newBalance = currentBalance + amount;
    
    // Update card
    await query(
      `UPDATE gift_cards 
       SET current_balance = $1, 
           status = 'active',
           updated_at = NOW()
       WHERE id = $2`,
      [newBalance, card.id]
    );
    
    // Log transaction
    await query(
      `INSERT INTO gift_card_transactions 
       (gift_card_id, transaction_type, amount, balance_before, balance_after, reference_id, reference_type, notes)
       VALUES ($1, 'reload', $2, $3, $4, $5, 'pos_transaction', 'Balance reload')`,
      [card.id, amount, currentBalance, newBalance, transaction_id]
    );
    
    res.json({
      success: true,
      amount_added: amount,
      new_balance: newBalance
    });
  } catch (error) {
    next(error);
  }
});

// Get card transaction history
router.get('/:card_number/transactions', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { card_number } = req.params;
    
    const cardResult = await query(
      'SELECT id FROM gift_cards WHERE tenant_id = $1 AND card_number = $2',
      [tenantId, card_number]
    );
    
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gift card not found' });
    }
    
    const result = await query(
      `SELECT * FROM gift_card_transactions 
       WHERE gift_card_id = $1
       ORDER BY created_at DESC`,
      [cardResult.rows[0].id]
    );
    
    res.json({ success: true, transactions: result.rows });
  } catch (error) {
    next(error);
  }
});

// Cancel gift card
router.post('/:card_number/cancel', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { card_number } = req.params;
    const { reason } = req.body;
    
    const result = await query(
      `UPDATE gift_cards 
       SET status = 'cancelled', updated_at = NOW()
       WHERE tenant_id = $1 AND card_number = $2 AND status = 'active'
       RETURNING *`,
      [tenantId, card_number]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Gift card not found or already cancelled' });
    }
    
    // Log cancellation
    await query(
      `INSERT INTO gift_card_transactions 
       (gift_card_id, transaction_type, amount, balance_before, balance_after, notes)
       VALUES ($1, 'adjustment', 0, $2, 0, $3)`,
      [result.rows[0].id, result.rows[0].current_balance, `Cancelled: ${reason || 'No reason'}`]
    );
    
    res.json({ success: true, message: 'Gift card cancelled' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
