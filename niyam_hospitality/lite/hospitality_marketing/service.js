/**
 * Hospitality Marketing Service - Niyam Hospitality (Max Lite)
 * Promotions, offers, marketing campaigns, guest targeting
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8926;
const SERVICE_NAME = 'hospitality_marketing';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Promotions/Offers
  db.run(`
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      promo_code TEXT UNIQUE,
      promotion_type TEXT DEFAULT 'discount',
      discount_type TEXT DEFAULT 'percent',
      discount_value REAL DEFAULT 0,
      min_stay INTEGER,
      min_booking_value REAL,
      applicable_room_types TEXT,
      applicable_rate_plans TEXT,
      valid_from TEXT,
      valid_to TEXT,
      blackout_dates TEXT,
      max_uses INTEGER,
      current_uses INTEGER DEFAULT 0,
      target_segments TEXT,
      is_stackable INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Promotion usage tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS promotion_usage (
      id TEXT PRIMARY KEY,
      promotion_id TEXT NOT NULL,
      reservation_id TEXT,
      guest_id TEXT,
      discount_amount REAL DEFAULT 0,
      used_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Marketing campaigns
  db.run(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      campaign_type TEXT DEFAULT 'email',
      objective TEXT,
      target_audience TEXT,
      target_segments TEXT,
      content TEXT,
      subject_line TEXT,
      template_id TEXT,
      channel TEXT DEFAULT 'email',
      scheduled_at TEXT,
      sent_at TEXT,
      status TEXT DEFAULT 'draft',
      budget REAL DEFAULT 0,
      metrics TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Campaign recipients
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      delivered_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      converted_at TEXT,
      conversion_value REAL,
      unsubscribed_at TEXT,
      bounced INTEGER DEFAULT 0
    )
  `);
  
  // Email templates
  db.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      subject TEXT,
      html_content TEXT,
      text_content TEXT,
      variables TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Special offers (time-limited deals)
  db.run(`
    CREATE TABLE IF NOT EXISTS special_offers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tagline TEXT,
      description TEXT,
      offer_type TEXT DEFAULT 'package',
      inclusions TEXT,
      original_price REAL,
      offer_price REAL,
      discount_percent REAL,
      room_type_id TEXT,
      image_url TEXT,
      valid_from TEXT,
      valid_to TEXT,
      booking_window_start TEXT,
      booking_window_end TEXT,
      terms_conditions TEXT,
      max_bookings INTEGER,
      current_bookings INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest unsubscribes
  db.run(`
    CREATE TABLE IF NOT EXISTS unsubscribes (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      email TEXT,
      channel TEXT DEFAULT 'email',
      reason TEXT,
      unsubscribed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guest_id, channel)
    )
  `);
  
  // A/B tests
  db.run(`
    CREATE TABLE IF NOT EXISTS ab_tests (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      name TEXT NOT NULL,
      test_type TEXT DEFAULT 'subject_line',
      variant_a TEXT,
      variant_b TEXT,
      variant_a_sends INTEGER DEFAULT 0,
      variant_b_sends INTEGER DEFAULT 0,
      variant_a_opens INTEGER DEFAULT 0,
      variant_b_opens INTEGER DEFAULT 0,
      variant_a_clicks INTEGER DEFAULT 0,
      variant_b_clicks INTEGER DEFAULT 0,
      winner TEXT,
      status TEXT DEFAULT 'running',
      started_at TEXT,
      ended_at TEXT
    )
  `);
  
  return db;
}

// ============================================
// PROMOTIONS
// ============================================

app.get('/promotions', async (req, res) => {
  try {
    await ensureTables();
    const { status, type, active_only } = req.query;
    
    let sql = `SELECT * FROM promotions WHERE 1=1`;
    const params = [];
    
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (type) { sql += ` AND promotion_type = ?`; params.push(type); }
    if (active_only === 'true') {
      sql += ` AND status = 'active' AND (valid_to IS NULL OR valid_to >= date('now'))`;
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const promotions = query(sql, params);
    res.json({ success: true, promotions: promotions.map(p => ({
      ...p,
      applicable_room_types: JSON.parse(p.applicable_room_types || '[]'),
      target_segments: JSON.parse(p.target_segments || '[]'),
      blackout_dates: JSON.parse(p.blackout_dates || '[]')
    })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/promotions/:id', async (req, res) => {
  try {
    await ensureTables();
    const promo = get(`SELECT * FROM promotions WHERE id = ?`, [req.params.id]);
    if (!promo) {
      return res.status(404).json({ success: false, error: 'Promotion not found' });
    }
    
    const usage = query(`SELECT * FROM promotion_usage WHERE promotion_id = ? ORDER BY used_at DESC LIMIT 50`, [req.params.id]);
    
    res.json({ success: true, promotion: { ...promo, usage } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/promotions', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, promo_code, promotion_type, discount_type, discount_value, min_stay, min_booking_value, applicable_room_types, valid_from, valid_to, blackout_dates, max_uses, target_segments, is_stackable } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO promotions (id, name, description, promo_code, promotion_type, discount_type, discount_value, min_stay, min_booking_value, applicable_room_types, valid_from, valid_to, blackout_dates, max_uses, target_segments, is_stackable, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `, [id, name, description, promo_code, promotion_type || 'discount', discount_type || 'percent', discount_value || 0, min_stay, min_booking_value, JSON.stringify(applicable_room_types || []), valid_from, valid_to, JSON.stringify(blackout_dates || []), max_uses, JSON.stringify(target_segments || []), is_stackable ? 1 : 0, timestamp()]);
    
    res.json({ success: true, promotion: { id, name, promo_code } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/promotions/validate', async (req, res) => {
  try {
    await ensureTables();
    const { promo_code, check_in, check_out, room_type, booking_value, guest_id } = req.body;
    
    const promo = get(`SELECT * FROM promotions WHERE promo_code = ? AND status = 'active'`, [promo_code]);
    
    if (!promo) {
      return res.json({ success: false, valid: false, error: 'Invalid promo code' });
    }
    
    // Check validity dates
    const now = new Date().toISOString().split('T')[0];
    if (promo.valid_from && promo.valid_from > now) {
      return res.json({ success: false, valid: false, error: 'Promotion not yet active' });
    }
    if (promo.valid_to && promo.valid_to < now) {
      return res.json({ success: false, valid: false, error: 'Promotion has expired' });
    }
    
    // Check max uses
    if (promo.max_uses && promo.current_uses >= promo.max_uses) {
      return res.json({ success: false, valid: false, error: 'Promotion usage limit reached' });
    }
    
    // Check minimum stay
    if (promo.min_stay && check_in && check_out) {
      const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
      if (nights < promo.min_stay) {
        return res.json({ success: false, valid: false, error: `Minimum stay of ${promo.min_stay} nights required` });
      }
    }
    
    // Check minimum booking value
    if (promo.min_booking_value && booking_value < promo.min_booking_value) {
      return res.json({ success: false, valid: false, error: `Minimum booking value of ${promo.min_booking_value} required` });
    }
    
    // Check blackout dates
    if (promo.blackout_dates && check_in) {
      const blackouts = JSON.parse(promo.blackout_dates || '[]');
      if (blackouts.includes(check_in)) {
        return res.json({ success: false, valid: false, error: 'Promotion not valid for selected dates' });
      }
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (booking_value) {
      if (promo.discount_type === 'percent') {
        discountAmount = booking_value * (promo.discount_value / 100);
      } else {
        discountAmount = promo.discount_value;
      }
    }
    
    res.json({
      success: true,
      valid: true,
      promotion: {
        id: promo.id,
        name: promo.name,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        calculated_discount: Math.round(discountAmount * 100) / 100
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/promotions/:id/use', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { reservation_id, guest_id, discount_amount } = req.body;
    
    run(`INSERT INTO promotion_usage (id, promotion_id, reservation_id, guest_id, discount_amount, used_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId(), id, reservation_id, guest_id, discount_amount || 0, timestamp()]);
    
    run(`UPDATE promotions SET current_uses = current_uses + 1 WHERE id = ?`, [id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SPECIAL OFFERS
// ============================================

app.get('/offers', async (req, res) => {
  try {
    await ensureTables();
    const { featured, status } = req.query;
    
    let sql = `SELECT * FROM special_offers WHERE 1=1`;
    const params = [];
    
    if (featured === 'true') { sql += ` AND is_featured = 1`; }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    else { sql += ` AND status = 'active'`; }
    
    sql += ` ORDER BY is_featured DESC, created_at DESC`;
    
    const offers = query(sql, params);
    res.json({ success: true, offers: offers.map(o => ({ ...o, inclusions: JSON.parse(o.inclusions || '[]') })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/offers', async (req, res) => {
  try {
    await ensureTables();
    const { title, tagline, description, offer_type, inclusions, original_price, offer_price, room_type_id, image_url, valid_from, valid_to, booking_window_start, booking_window_end, terms_conditions, max_bookings, is_featured } = req.body;
    
    const discountPercent = original_price > 0 ? Math.round(((original_price - offer_price) / original_price) * 100) : 0;
    
    const id = generateId();
    run(`
      INSERT INTO special_offers (id, title, tagline, description, offer_type, inclusions, original_price, offer_price, discount_percent, room_type_id, image_url, valid_from, valid_to, booking_window_start, booking_window_end, terms_conditions, max_bookings, is_featured, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `, [id, title, tagline, description, offer_type || 'package', JSON.stringify(inclusions || []), original_price, offer_price, discountPercent, room_type_id, image_url, valid_from, valid_to, booking_window_start, booking_window_end, terms_conditions, max_bookings, is_featured ? 1 : 0, timestamp()]);
    
    res.json({ success: true, offer: { id, title } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MARKETING CAMPAIGNS
// ============================================

app.get('/campaigns', async (req, res) => {
  try {
    await ensureTables();
    const { status, type } = req.query;
    
    let sql = `SELECT * FROM marketing_campaigns WHERE 1=1`;
    const params = [];
    
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (type) { sql += ` AND campaign_type = ?`; params.push(type); }
    
    sql += ` ORDER BY created_at DESC`;
    
    const campaigns = query(sql, params);
    res.json({ success: true, campaigns });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/campaigns/:id', async (req, res) => {
  try {
    await ensureTables();
    const campaign = get(`SELECT * FROM marketing_campaigns WHERE id = ?`, [req.params.id]);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    // Get recipient stats
    const stats = get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN sent_at IS NOT NULL THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
        SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) as converted,
        SUM(COALESCE(conversion_value, 0)) as conversion_value
      FROM campaign_recipients WHERE campaign_id = ?
    `, [req.params.id]);
    
    res.json({ success: true, campaign: { ...campaign, stats } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/campaigns', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, campaign_type, objective, target_audience, target_segments, content, subject_line, template_id, channel, scheduled_at, budget } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO marketing_campaigns (id, name, description, campaign_type, objective, target_audience, target_segments, content, subject_line, template_id, channel, scheduled_at, budget, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `, [id, name, description, campaign_type || 'email', objective, target_audience, JSON.stringify(target_segments || []), content, subject_line, template_id, channel || 'email', scheduled_at, budget || 0, timestamp()]);
    
    res.json({ success: true, campaign: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/campaigns/:id/launch', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const campaign = get(`SELECT * FROM marketing_campaigns WHERE id = ?`, [id]);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    // Get target guests (excluding unsubscribed)
    const segments = JSON.parse(campaign.target_segments || '[]');
    let guestSql = `
      SELECT g.id, g.email FROM guests g
      WHERE g.email IS NOT NULL
        AND g.id NOT IN (SELECT guest_id FROM unsubscribes WHERE channel = ?)
    `;
    const params = [campaign.channel || 'email'];
    
    if (segments.length > 0) {
      guestSql += ` AND g.segment_id IN (SELECT id FROM guest_segments WHERE segment_code IN (${segments.map(() => '?').join(',')}))`;
      params.push(...segments);
    }
    
    const guests = query(guestSql, params);
    
    // Add recipients
    for (const guest of guests) {
      run(`INSERT INTO campaign_recipients (id, campaign_id, guest_id, email, status) VALUES (?, ?, ?, ?, 'pending')`,
        [generateId(), id, guest.id, guest.email]);
    }
    
    // Update campaign status
    run(`UPDATE marketing_campaigns SET status = 'active', sent_at = ?, updated_at = ? WHERE id = ?`,
      [timestamp(), timestamp(), id]);
    
    res.json({ success: true, message: 'Campaign launched', recipients: guests.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Track email events
app.post('/campaigns/:campaignId/track', async (req, res) => {
  try {
    await ensureTables();
    const { campaignId } = req.params;
    const { guest_id, event, conversion_value } = req.body;
    
    const updateField = {
      'sent': 'sent_at',
      'delivered': 'delivered_at',
      'opened': 'opened_at',
      'clicked': 'clicked_at',
      'converted': 'converted_at'
    }[event];
    
    if (updateField) {
      let sql = `UPDATE campaign_recipients SET ${updateField} = ?`;
      const params = [timestamp()];
      
      if (event === 'converted' && conversion_value) {
        sql += `, conversion_value = ?`;
        params.push(conversion_value);
      }
      
      sql += ` WHERE campaign_id = ? AND guest_id = ?`;
      params.push(campaignId, guest_id);
      
      run(sql, params);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// EMAIL TEMPLATES
// ============================================

app.get('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { category } = req.query;
    
    let sql = `SELECT * FROM email_templates WHERE is_active = 1`;
    const params = [];
    
    if (category) { sql += ` AND category = ?`; params.push(category); }
    
    const templates = query(sql, params);
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { name, category, subject, html_content, text_content, variables } = req.body;
    
    const id = generateId();
    run(`INSERT INTO email_templates (id, name, category, subject, html_content, text_content, variables, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, category, subject, html_content, text_content, JSON.stringify(variables || []), timestamp()]);
    
    res.json({ success: true, template: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// UNSUBSCRIBE
// ============================================

app.post('/unsubscribe', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, email, channel, reason } = req.body;
    
    run(`INSERT OR REPLACE INTO unsubscribes (id, guest_id, email, channel, reason, unsubscribed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId(), guest_id, email, channel || 'email', reason, timestamp()]);
    
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/dashboard', async (req, res) => {
  try {
    await ensureTables();
    
    const activePromos = get(`SELECT COUNT(*) as count FROM promotions WHERE status = 'active'`);
    const activeOffers = get(`SELECT COUNT(*) as count FROM special_offers WHERE status = 'active'`);
    const activeCampaigns = get(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE status = 'active'`);
    
    // Campaign performance (last 30 days)
    const campaignPerf = get(`
      SELECT 
        COUNT(DISTINCT campaign_id) as campaigns,
        SUM(CASE WHEN sent_at IS NOT NULL THEN 1 ELSE 0 END) as total_sent,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as total_opened,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as total_clicked,
        SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) as total_converted,
        SUM(COALESCE(conversion_value, 0)) as total_revenue
      FROM campaign_recipients
      WHERE sent_at > datetime('now', '-30 days')
    `);
    
    // Promotion usage (last 30 days)
    const promoUsage = get(`
      SELECT COUNT(*) as uses, SUM(discount_amount) as total_discount
      FROM promotion_usage
      WHERE used_at > datetime('now', '-30 days')
    `);
    
    res.json({
      success: true,
      dashboard: {
        active_promotions: activePromos?.count || 0,
        active_offers: activeOffers?.count || 0,
        active_campaigns: activeCampaigns?.count || 0,
        campaign_performance: {
          total_sent: campaignPerf?.total_sent || 0,
          total_opened: campaignPerf?.total_opened || 0,
          open_rate: campaignPerf?.total_sent > 0 ? Math.round((campaignPerf.total_opened / campaignPerf.total_sent) * 100) : 0,
          total_clicked: campaignPerf?.total_clicked || 0,
          click_rate: campaignPerf?.total_opened > 0 ? Math.round((campaignPerf.total_clicked / campaignPerf.total_opened) * 100) : 0,
          conversions: campaignPerf?.total_converted || 0,
          revenue: campaignPerf?.total_revenue || 0
        },
        promotion_usage: {
          uses: promoUsage?.uses || 0,
          total_discount: promoUsage?.total_discount || 0
        }
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
