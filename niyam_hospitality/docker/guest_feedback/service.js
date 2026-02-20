// Guest Feedback Service - Niyam Hospitality
// Handles reviews, ratings, complaints, and satisfaction surveys

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'guest_feedback';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// In-memory storage
const feedbacks = new Map();
const surveys = new Map();
let feedbackCounter = 1000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// FEEDBACK & REVIEWS
// ============================================

app.get('/feedback', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { type, status, from_date, to_date } = req.query;
    
    let items = Array.from(feedbacks.values())
      .filter(f => f.tenant_id === tenantId);
    
    if (type) items = items.filter(f => f.type === type);
    if (status) items = items.filter(f => f.status === status);
    if (from_date) items = items.filter(f => f.created_at >= from_date);
    if (to_date) items = items.filter(f => f.created_at <= to_date);
    
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({ success: true, feedback: items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const FeedbackSchema = z.object({
  type: z.enum(['review', 'complaint', 'suggestion', 'compliment']),
  category: z.enum(['room', 'restaurant', 'service', 'facilities', 'staff', 'cleanliness', 'other']),
  rating: z.number().min(1).max(5).optional(),
  guest_name: z.string(),
  guest_email: z.string().email().optional(),
  room_number: z.string().optional(),
  booking_id: z.string().optional(),
  title: z.string(),
  description: z.string(),
  is_anonymous: z.boolean().default(false)
});

app.post('/feedback', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = FeedbackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const id = `FB-${++feedbackCounter}`;
    
    const feedback = {
      id,
      tenant_id: tenantId,
      ...data,
      status: data.type === 'complaint' ? 'open' : 'received',
      priority: data.type === 'complaint' && data.rating && data.rating <= 2 ? 'high' : 'normal',
      created_at: new Date().toISOString()
    };
    
    feedbacks.set(id, feedback);
    
    // Alert on complaints
    if (data.type === 'complaint') {
      await publishEnvelope('hospitality.feedback.complaint_received.v1', 1, {
        feedback_id: id,
        category: data.category,
        room_number: data.room_number,
        priority: feedback.priority
      });
    }
    
    res.json({ success: true, feedback });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/feedback/:id', async (req, res) => {
  try {
    const feedback = feedbacks.get(req.params.id);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
    
    const { status, response, assigned_to } = req.body;
    
    if (status) feedback.status = status;
    if (response) {
      feedback.response = response;
      feedback.responded_at = new Date().toISOString();
    }
    if (assigned_to) feedback.assigned_to = assigned_to;
    feedback.updated_at = new Date().toISOString();
    
    feedbacks.set(req.params.id, feedback);
    
    if (status === 'resolved') {
      await publishEnvelope('hospitality.feedback.resolved.v1', 1, {
        feedback_id: req.params.id,
        type: feedback.type
      });
    }
    
    res.json({ success: true, feedback });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SATISFACTION SURVEYS
// ============================================

app.get('/surveys', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const surveyList = Array.from(surveys.values())
      .filter(s => s.tenant_id === tenantId);
    
    res.json({ success: true, surveys: surveyList });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/surveys/:id/results', async (req, res) => {
  try {
    const survey = surveys.get(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    
    const responses = survey.responses || [];
    const totalResponses = responses.length;
    
    if (totalResponses === 0) {
      return res.json({
        success: true,
        results: {
          survey_id: survey.id,
          title: survey.title,
          total_responses: 0,
          questions: survey.questions.map(q => ({ ...q, responses: [] }))
        }
      });
    }
    
    // Aggregate results
    const questionResults = survey.questions.map((q, idx) => {
      const answers = responses.map(r => r.answers[idx]).filter(Boolean);
      
      if (q.type === 'rating') {
        const avg = answers.reduce((sum, a) => sum + a, 0) / answers.length;
        return { ...q, average_rating: avg.toFixed(1), response_count: answers.length };
      } else if (q.type === 'choice') {
        const counts = {};
        answers.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
        return { ...q, distribution: counts, response_count: answers.length };
      } else {
        return { ...q, responses: answers.slice(0, 10), response_count: answers.length };
      }
    });
    
    res.json({
      success: true,
      results: {
        survey_id: survey.id,
        title: survey.title,
        total_responses: totalResponses,
        questions: questionResults
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const SurveySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  questions: z.array(z.object({
    text: z.string(),
    type: z.enum(['rating', 'choice', 'text']),
    options: z.array(z.string()).optional(), // for choice type
    required: z.boolean().default(true)
  })),
  trigger: z.enum(['checkout', 'manual', 'post_dining']).default('checkout')
});

app.post('/surveys', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SurveySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const id = `SRV-${Date.now()}`;
    
    const survey = {
      id,
      tenant_id: tenantId,
      ...data,
      status: 'active',
      responses: [],
      created_at: new Date().toISOString()
    };
    
    surveys.set(id, survey);
    
    res.json({ success: true, survey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Submit survey response
app.post('/surveys/:id/respond', async (req, res) => {
  try {
    const survey = surveys.get(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    
    const { guest_name, room_number, answers } = req.body;
    
    const response = {
      id: `RSP-${Date.now()}`,
      guest_name,
      room_number,
      answers,
      submitted_at: new Date().toISOString()
    };
    
    survey.responses = survey.responses || [];
    survey.responses.push(response);
    surveys.set(req.params.id, survey);
    
    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ANALYTICS
// ============================================

app.get('/analytics', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { period = '30' } = req.query;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));
    
    const recentFeedback = Array.from(feedbacks.values())
      .filter(f => f.tenant_id === tenantId && new Date(f.created_at) >= cutoffDate);
    
    // Calculate metrics
    const totalFeedback = recentFeedback.length;
    const reviews = recentFeedback.filter(f => f.type === 'review');
    const complaints = recentFeedback.filter(f => f.type === 'complaint');
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : 0;
    
    // Category breakdown
    const byCategory = {};
    recentFeedback.forEach(f => {
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    });
    
    // Rating distribution
    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => {
      if (r.rating) ratingDist[r.rating]++;
    });
    
    // Resolution rate
    const resolvedComplaints = complaints.filter(c => c.status === 'resolved').length;
    const resolutionRate = complaints.length > 0 
      ? ((resolvedComplaints / complaints.length) * 100).toFixed(1)
      : 100;
    
    res.json({
      success: true,
      analytics: {
        period_days: parseInt(period),
        total_feedback: totalFeedback,
        total_reviews: reviews.length,
        total_complaints: complaints.length,
        average_rating: parseFloat(avgRating),
        resolution_rate: parseFloat(resolutionRate),
        by_category: byCategory,
        rating_distribution: ratingDist,
        nps_score: calculateNPS(reviews) // Net Promoter Score
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function calculateNPS(reviews) {
  if (reviews.length === 0) return 0;
  
  const promoters = reviews.filter(r => r.rating >= 4).length;
  const detractors = reviews.filter(r => r.rating <= 2).length;
  
  return Math.round(((promoters - detractors) / reviews.length) * 100);
}

// Quick rating (e.g., tablet at reception)
app.post('/quick-rating', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { rating, category, location } = req.body; // 1-5 emoji rating
    
    const id = `QR-${Date.now()}`;
    const quickRating = {
      id,
      tenant_id: tenantId,
      type: 'review',
      category: category || 'service',
      rating,
      title: 'Quick Rating',
      description: `Quick rating from ${location || 'unknown'}`,
      guest_name: 'Anonymous',
      is_anonymous: true,
      status: 'received',
      created_at: new Date().toISOString()
    };
    
    feedbacks.set(id, quickRating);
    
    res.json({ success: true, message: 'Thank you!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8929;
app.listen(PORT, () => {
  console.log(`✅ Guest Feedback Service listening on ${PORT}`);
});
