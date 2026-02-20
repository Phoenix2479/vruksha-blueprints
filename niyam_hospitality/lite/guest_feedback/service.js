/**
 * Guest Feedback Service - Niyam Hospitality (Max Lite)
 * Surveys, reviews, sentiment analysis, response management
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8931;
const SERVICE_NAME = 'guest_feedback';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS survey_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT,
    questions TEXT NOT NULL, trigger_event TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS survey_responses (
    id TEXT PRIMARY KEY, survey_id TEXT NOT NULL, guest_id TEXT, reservation_id TEXT,
    responses TEXT NOT NULL, overall_score REAL, sentiment TEXT, completed_at TEXT,
    source TEXT DEFAULT 'email', created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, guest_id TEXT, reservation_id TEXT, platform TEXT DEFAULT 'internal',
    external_id TEXT, overall_rating INTEGER, title TEXT, content TEXT,
    categories TEXT, pros TEXT, cons TEXT, sentiment TEXT, language TEXT DEFAULT 'en',
    response TEXT, response_by TEXT, response_at TEXT, status TEXT DEFAULT 'pending',
    flagged INTEGER DEFAULT 0, flag_reason TEXT, published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS feedback_alerts (
    id TEXT PRIMARY KEY, feedback_type TEXT NOT NULL, feedback_id TEXT NOT NULL,
    alert_type TEXT NOT NULL, severity TEXT DEFAULT 'medium', message TEXT,
    acknowledged INTEGER DEFAULT 0, acknowledged_by TEXT, acknowledged_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Seed default survey
  const existing = get(`SELECT COUNT(*) as count FROM survey_templates`);
  if (!existing || existing.count === 0) {
    const defaultSurvey = {
      name: 'Post-Stay Survey', category: 'checkout', trigger_event: 'checked_out',
      questions: JSON.stringify([
        { id: 'overall', type: 'rating', question: 'How would you rate your overall experience?', max: 5, required: true },
        { id: 'room', type: 'rating', question: 'How was your room?', max: 5, required: true },
        { id: 'service', type: 'rating', question: 'How was our service?', max: 5, required: true },
        { id: 'cleanliness', type: 'rating', question: 'How was the cleanliness?', max: 5, required: true },
        { id: 'recommend', type: 'nps', question: 'How likely are you to recommend us?', max: 10, required: true },
        { id: 'comments', type: 'text', question: 'Any additional comments?', required: false }
      ])
    };
    run(`INSERT INTO survey_templates (id, name, category, trigger_event, questions, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId(), defaultSurvey.name, defaultSurvey.category, defaultSurvey.trigger_event, defaultSurvey.questions, timestamp()]);
  }
  
  return db;
}

// SURVEYS
app.get('/surveys', async (req, res) => {
  try {
    await ensureTables();
    const surveys = query(`SELECT * FROM survey_templates WHERE is_active = 1 ORDER BY name`);
    res.json({ success: true, surveys: surveys.map(s => ({ ...s, questions: JSON.parse(s.questions) })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/surveys/:id', async (req, res) => {
  try {
    await ensureTables();
    const survey = get(`SELECT * FROM survey_templates WHERE id = ?`, [req.params.id]);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });
    res.json({ success: true, survey: { ...survey, questions: JSON.parse(survey.questions) } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/surveys', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, category, questions, trigger_event } = req.body;
    const id = generateId();
    run(`INSERT INTO survey_templates (id, name, description, category, questions, trigger_event, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, category, JSON.stringify(questions), trigger_event, timestamp()]);
    res.json({ success: true, survey: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SURVEY RESPONSES
app.post('/surveys/:surveyId/respond', async (req, res) => {
  try {
    await ensureTables();
    const { surveyId } = req.params;
    const { guest_id, reservation_id, responses, source } = req.body;
    
    // Calculate overall score
    const ratings = Object.values(responses).filter(r => typeof r === 'number');
    const overallScore = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    
    // Simple sentiment based on score
    let sentiment = 'neutral';
    if (overallScore >= 4) sentiment = 'positive';
    else if (overallScore <= 2) sentiment = 'negative';
    
    const id = generateId();
    run(`INSERT INTO survey_responses (id, survey_id, guest_id, reservation_id, responses, overall_score, sentiment, source, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, surveyId, guest_id, reservation_id, JSON.stringify(responses), overallScore, sentiment, source || 'web', timestamp(), timestamp()]);
    
    // Create alert for negative feedback
    if (sentiment === 'negative') {
      run(`INSERT INTO feedback_alerts (id, feedback_type, feedback_id, alert_type, severity, message, created_at) VALUES (?, 'survey', ?, 'low_score', 'high', 'Low survey score received', ?)`,
        [generateId(), id, timestamp()]);
    }
    
    res.json({ success: true, response: { id, overall_score: overallScore, sentiment } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/responses', async (req, res) => {
  try {
    await ensureTables();
    const { survey_id, guest_id, reservation_id, sentiment, from_date, to_date, limit = 50 } = req.query;
    let sql = `SELECT sr.*, st.name as survey_name FROM survey_responses sr LEFT JOIN survey_templates st ON sr.survey_id = st.id WHERE 1=1`;
    const params = [];
    if (survey_id) { sql += ` AND sr.survey_id = ?`; params.push(survey_id); }
    if (guest_id) { sql += ` AND sr.guest_id = ?`; params.push(guest_id); }
    if (reservation_id) { sql += ` AND sr.reservation_id = ?`; params.push(reservation_id); }
    if (sentiment) { sql += ` AND sr.sentiment = ?`; params.push(sentiment); }
    if (from_date) { sql += ` AND DATE(sr.created_at) >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND DATE(sr.created_at) <= ?`; params.push(to_date); }
    sql += ` ORDER BY sr.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    const responses = query(sql, params);
    res.json({ success: true, responses: responses.map(r => ({ ...r, responses: JSON.parse(r.responses) })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// REVIEWS
app.get('/reviews', async (req, res) => {
  try {
    await ensureTables();
    const { platform, status, rating, sentiment, limit = 50 } = req.query;
    let sql = `SELECT * FROM reviews WHERE 1=1`;
    const params = [];
    if (platform) { sql += ` AND platform = ?`; params.push(platform); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (rating) { sql += ` AND overall_rating = ?`; params.push(rating); }
    if (sentiment) { sql += ` AND sentiment = ?`; params.push(sentiment); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, reviews: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/reviews', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, platform, overall_rating, title, content, categories, pros, cons } = req.body;
    
    let sentiment = 'neutral';
    if (overall_rating >= 4) sentiment = 'positive';
    else if (overall_rating <= 2) sentiment = 'negative';
    
    const id = generateId();
    run(`INSERT INTO reviews (id, guest_id, reservation_id, platform, overall_rating, title, content, categories, pros, cons, sentiment, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, guest_id, reservation_id, platform || 'internal', overall_rating, title, content, JSON.stringify(categories || {}), pros, cons, sentiment, timestamp()]);
    
    if (sentiment === 'negative') {
      run(`INSERT INTO feedback_alerts (id, feedback_type, feedback_id, alert_type, severity, message, created_at) VALUES (?, 'review', ?, 'negative_review', 'high', 'Negative review received', ?)`,
        [generateId(), id, timestamp()]);
    }
    
    res.json({ success: true, review: { id, sentiment } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/reviews/:id/respond', async (req, res) => {
  try {
    await ensureTables();
    const { response, response_by } = req.body;
    run(`UPDATE reviews SET response = ?, response_by = ?, response_at = ?, status = 'responded' WHERE id = ?`,
      [response, response_by, timestamp(), req.params.id]);
    res.json({ success: true, message: 'Response added' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/reviews/:id/flag', async (req, res) => {
  try {
    await ensureTables();
    const { reason } = req.body;
    run(`UPDATE reviews SET flagged = 1, flag_reason = ? WHERE id = ?`, [reason, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ALERTS
app.get('/alerts', async (req, res) => {
  try {
    await ensureTables();
    const { acknowledged } = req.query;
    let sql = `SELECT * FROM feedback_alerts`;
    if (acknowledged === 'false') sql += ` WHERE acknowledged = 0`;
    sql += ` ORDER BY created_at DESC LIMIT 50`;
    res.json({ success: true, alerts: query(sql) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    await ensureTables();
    const { acknowledged_by } = req.body;
    run(`UPDATE feedback_alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`,
      [acknowledged_by, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// NPS
app.get('/nps', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    const responses = query(`SELECT responses FROM survey_responses WHERE created_at > datetime('now', '-${parseInt(days)} days')`);
    
    let promoters = 0, passives = 0, detractors = 0;
    for (const r of responses) {
      const data = JSON.parse(r.responses);
      const nps = data.recommend || data.nps;
      if (nps >= 9) promoters++;
      else if (nps >= 7) passives++;
      else if (nps !== undefined) detractors++;
    }
    const total = promoters + passives + detractors;
    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
    
    res.json({ success: true, nps: { score: nps, promoters, passives, detractors, total } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    const surveyStats = get(`SELECT COUNT(*) as count, AVG(overall_score) as avg_score FROM survey_responses WHERE created_at > datetime('now', '-${parseInt(days)} days')`);
    const reviewStats = get(`SELECT COUNT(*) as count, AVG(overall_rating) as avg_rating FROM reviews WHERE created_at > datetime('now', '-${parseInt(days)} days')`);
    const bySentiment = query(`SELECT sentiment, COUNT(*) as count FROM survey_responses WHERE created_at > datetime('now', '-${parseInt(days)} days') GROUP BY sentiment`);
    const pendingAlerts = get(`SELECT COUNT(*) as count FROM feedback_alerts WHERE acknowledged = 0`);
    
    res.json({ success: true, stats: {
      surveys: surveyStats?.count || 0, avg_survey_score: Math.round((surveyStats?.avg_score || 0) * 10) / 10,
      reviews: reviewStats?.count || 0, avg_review_rating: Math.round((reviewStats?.avg_rating || 0) * 10) / 10,
      by_sentiment: bySentiment, pending_alerts: pendingAlerts?.count || 0
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
