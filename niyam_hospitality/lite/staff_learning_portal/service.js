/**
 * Staff Learning Portal Service - Niyam Hospitality (Max Lite)
 * Training courses, certifications, skill tracking
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8925;
const SERVICE_NAME = 'staff_learning_portal';

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
  
  // Courses
  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      department TEXT,
      difficulty_level TEXT DEFAULT 'beginner',
      duration_minutes INTEGER DEFAULT 30,
      is_mandatory INTEGER DEFAULT 0,
      prerequisites TEXT,
      content_type TEXT DEFAULT 'video',
      thumbnail_url TEXT,
      instructor TEXT,
      passing_score INTEGER DEFAULT 70,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Course modules/lessons
  db.run(`
    CREATE TABLE IF NOT EXISTS course_modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      module_order INTEGER DEFAULT 0,
      duration_minutes INTEGER DEFAULT 10,
      content_type TEXT DEFAULT 'video',
      content_url TEXT,
      content_text TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Quizzes
  db.run(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      module_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      time_limit_minutes INTEGER,
      passing_score INTEGER DEFAULT 70,
      max_attempts INTEGER DEFAULT 3,
      shuffle_questions INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Quiz questions
  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT DEFAULT 'multiple_choice',
      options TEXT,
      correct_answer TEXT,
      points INTEGER DEFAULT 1,
      explanation TEXT,
      question_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Staff enrollments
  db.run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      status TEXT DEFAULT 'enrolled',
      progress_percent INTEGER DEFAULT 0,
      score INTEGER,
      started_at TEXT,
      completed_at TEXT,
      certificate_id TEXT,
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(staff_id, course_id)
    )
  `);
  
  // Module progress
  db.run(`
    CREATE TABLE IF NOT EXISTS module_progress (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      status TEXT DEFAULT 'not_started',
      started_at TEXT,
      completed_at TEXT,
      time_spent_seconds INTEGER DEFAULT 0,
      UNIQUE(staff_id, module_id)
    )
  `);
  
  // Quiz attempts
  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      max_score INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      answers TEXT,
      started_at TEXT,
      completed_at TEXT,
      time_taken_seconds INTEGER,
      attempt_number INTEGER DEFAULT 1
    )
  `);
  
  // Certifications
  db.run(`
    CREATE TABLE IF NOT EXISTS certifications (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      certificate_number TEXT UNIQUE,
      issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      pdf_url TEXT
    )
  `);
  
  // Learning paths
  db.run(`
    CREATE TABLE IF NOT EXISTS learning_paths (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      department TEXT,
      role TEXT,
      courses TEXT,
      is_mandatory INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Skills
  db.run(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Staff skills
  db.run(`
    CREATE TABLE IF NOT EXISTS staff_skills (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      proficiency_level INTEGER DEFAULT 1,
      verified INTEGER DEFAULT 0,
      verified_by TEXT,
      verified_at TEXT,
      source TEXT DEFAULT 'self',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(staff_id, skill_id)
    )
  `);
  
  return db;
}

// ============================================
// COURSES
// ============================================

app.get('/courses', async (req, res) => {
  try {
    await ensureTables();
    const { category, department, mandatory, staff_id } = req.query;
    
    let sql = `SELECT * FROM courses WHERE active = 1`;
    const params = [];
    
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (department) { sql += ` AND (department IS NULL OR department = ?)`; params.push(department); }
    if (mandatory === 'true') { sql += ` AND is_mandatory = 1`; }
    
    sql += ` ORDER BY category, title`;
    
    let courses = query(sql, params);
    
    // Add enrollment status if staff_id provided
    if (staff_id) {
      const enrollments = query(`SELECT course_id, status, progress_percent FROM enrollments WHERE staff_id = ?`, [staff_id]);
      const enrollmentMap = {};
      enrollments.forEach(e => { enrollmentMap[e.course_id] = e; });
      
      courses = courses.map(c => ({
        ...c,
        enrollment: enrollmentMap[c.id] || null
      }));
    }
    
    res.json({ success: true, courses });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/courses/:id', async (req, res) => {
  try {
    await ensureTables();
    const course = get(`SELECT * FROM courses WHERE id = ?`, [req.params.id]);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    
    const modules = query(`SELECT * FROM course_modules WHERE course_id = ? ORDER BY module_order`, [req.params.id]);
    const quizzes = query(`SELECT * FROM quizzes WHERE course_id = ?`, [req.params.id]);
    
    res.json({ success: true, course: { ...course, modules, quizzes } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/courses', async (req, res) => {
  try {
    await ensureTables();
    const { title, description, category, department, difficulty_level, duration_minutes, is_mandatory, content_type, instructor, passing_score } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO courses (id, title, description, category, department, difficulty_level, duration_minutes, is_mandatory, content_type, instructor, passing_score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, description, category, department, difficulty_level || 'beginner', duration_minutes || 30, is_mandatory ? 1 : 0, content_type || 'video', instructor, passing_score || 70, timestamp()]);
    
    res.json({ success: true, course: { id, title } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MODULES
// ============================================

app.post('/courses/:courseId/modules', async (req, res) => {
  try {
    await ensureTables();
    const { courseId } = req.params;
    const { title, description, module_order, duration_minutes, content_type, content_url, content_text } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO course_modules (id, course_id, title, description, module_order, duration_minutes, content_type, content_url, content_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, courseId, title, description, module_order || 0, duration_minutes || 10, content_type || 'video', content_url, content_text, timestamp()]);
    
    res.json({ success: true, module: { id, title } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// QUIZZES
// ============================================

app.get('/quizzes/:id', async (req, res) => {
  try {
    await ensureTables();
    const quiz = get(`SELECT * FROM quizzes WHERE id = ?`, [req.params.id]);
    if (!quiz) {
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }
    
    const questions = query(`SELECT id, question_text, question_type, options, points, question_order FROM quiz_questions WHERE quiz_id = ? ORDER BY question_order`, [req.params.id]);
    
    // Parse options but don't include correct answers
    const sanitizedQuestions = questions.map(q => ({
      ...q,
      options: JSON.parse(q.options || '[]')
    }));
    
    res.json({ success: true, quiz: { ...quiz, questions: sanitizedQuestions } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/quizzes/:id/submit', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { staff_id, answers, started_at } = req.body;
    
    const quiz = get(`SELECT * FROM quizzes WHERE id = ?`, [id]);
    if (!quiz) {
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }
    
    // Check attempt count
    const attempts = get(`SELECT COUNT(*) as count FROM quiz_attempts WHERE quiz_id = ? AND staff_id = ?`, [id, staff_id]);
    if (quiz.max_attempts && attempts.count >= quiz.max_attempts) {
      return res.status(400).json({ success: false, error: 'Maximum attempts reached' });
    }
    
    // Grade the quiz
    const questions = query(`SELECT id, correct_answer, points FROM quiz_questions WHERE quiz_id = ?`, [id]);
    let score = 0;
    let maxScore = 0;
    
    questions.forEach(q => {
      maxScore += q.points || 1;
      if (answers[q.id] === q.correct_answer) {
        score += q.points || 1;
      }
    });
    
    const percentScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const passed = percentScore >= quiz.passing_score;
    
    // Record attempt
    const attemptId = generateId();
    const timeTaken = started_at ? Math.round((Date.now() - new Date(started_at).getTime()) / 1000) : null;
    
    run(`
      INSERT INTO quiz_attempts (id, staff_id, quiz_id, score, max_score, passed, answers, started_at, completed_at, time_taken_seconds, attempt_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [attemptId, staff_id, id, score, maxScore, passed ? 1 : 0, JSON.stringify(answers), started_at, timestamp(), timeTaken, (attempts.count || 0) + 1]);
    
    // Update enrollment progress if passed and linked to course
    if (passed && quiz.course_id) {
      const enrollment = get(`SELECT * FROM enrollments WHERE staff_id = ? AND course_id = ?`, [staff_id, quiz.course_id]);
      if (enrollment) {
        // Check if all modules completed and quiz passed
        const totalModules = get(`SELECT COUNT(*) as count FROM course_modules WHERE course_id = ?`, [quiz.course_id]);
        const completedModules = get(`SELECT COUNT(*) as count FROM module_progress WHERE staff_id = ? AND course_id = ? AND status = 'completed'`, [staff_id, quiz.course_id]);
        
        if (completedModules.count >= totalModules.count) {
          // Course completed - issue certificate
          const certNumber = `CERT-${Date.now().toString(36).toUpperCase()}`;
          run(`INSERT INTO certifications (id, staff_id, course_id, certificate_number, issued_at) VALUES (?, ?, ?, ?, ?)`,
            [generateId(), staff_id, quiz.course_id, certNumber, timestamp()]);
          
          run(`UPDATE enrollments SET status = 'completed', score = ?, completed_at = ?, certificate_id = ? WHERE staff_id = ? AND course_id = ?`,
            [percentScore, timestamp(), certNumber, staff_id, quiz.course_id]);
        }
      }
    }
    
    res.json({
      success: true,
      result: {
        score,
        max_score: maxScore,
        percent: percentScore,
        passed,
        attempt: (attempts.count || 0) + 1,
        max_attempts: quiz.max_attempts
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ENROLLMENTS
// ============================================

app.post('/enroll', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, course_id } = req.body;
    
    const id = generateId();
    run(`
      INSERT OR IGNORE INTO enrollments (id, staff_id, course_id, status, progress_percent, enrolled_at, started_at)
      VALUES (?, ?, ?, 'enrolled', 0, ?, ?)
    `, [id, staff_id, course_id, timestamp(), timestamp()]);
    
    res.json({ success: true, enrollment: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/staff/:staffId/enrollments', async (req, res) => {
  try {
    await ensureTables();
    const { staffId } = req.params;
    
    const enrollments = query(`
      SELECT e.*, c.title as course_title, c.category, c.duration_minutes
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.staff_id = ?
      ORDER BY e.enrolled_at DESC
    `, [staffId]);
    
    res.json({ success: true, enrollments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MODULE PROGRESS
// ============================================

app.post('/progress/module', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, course_id, module_id, status, time_spent_seconds } = req.body;
    
    const existing = get(`SELECT * FROM module_progress WHERE staff_id = ? AND module_id = ?`, [staff_id, module_id]);
    
    if (existing) {
      run(`UPDATE module_progress SET status = ?, time_spent_seconds = time_spent_seconds + ?, completed_at = ? WHERE staff_id = ? AND module_id = ?`,
        [status, time_spent_seconds || 0, status === 'completed' ? timestamp() : null, staff_id, module_id]);
    } else {
      run(`INSERT INTO module_progress (id, staff_id, course_id, module_id, status, started_at, time_spent_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), staff_id, course_id, module_id, status, timestamp(), time_spent_seconds || 0]);
    }
    
    // Update enrollment progress
    const totalModules = get(`SELECT COUNT(*) as count FROM course_modules WHERE course_id = ?`, [course_id]);
    const completedModules = get(`SELECT COUNT(*) as count FROM module_progress WHERE staff_id = ? AND course_id = ? AND status = 'completed'`, [staff_id, course_id]);
    const progressPercent = totalModules.count > 0 ? Math.round((completedModules.count / totalModules.count) * 100) : 0;
    
    run(`UPDATE enrollments SET progress_percent = ?, status = CASE WHEN progress_percent = 100 THEN 'completed' ELSE 'in_progress' END WHERE staff_id = ? AND course_id = ?`,
      [progressPercent, staff_id, course_id]);
    
    res.json({ success: true, progress_percent: progressPercent });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CERTIFICATIONS
// ============================================

app.get('/staff/:staffId/certifications', async (req, res) => {
  try {
    await ensureTables();
    const { staffId } = req.params;
    
    const certifications = query(`
      SELECT cert.*, c.title as course_title, c.category
      FROM certifications cert
      JOIN courses c ON cert.course_id = c.id
      WHERE cert.staff_id = ?
      ORDER BY cert.issued_at DESC
    `, [staffId]);
    
    res.json({ success: true, certifications });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SKILLS
// ============================================

app.get('/skills', async (req, res) => {
  try {
    await ensureTables();
    const skills = query(`SELECT * FROM skills ORDER BY category, name`);
    res.json({ success: true, skills });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/staff/:staffId/skills', async (req, res) => {
  try {
    await ensureTables();
    const { staffId } = req.params;
    
    const skills = query(`
      SELECT ss.*, s.name as skill_name, s.category
      FROM staff_skills ss
      JOIN skills s ON ss.skill_id = s.id
      WHERE ss.staff_id = ?
      ORDER BY s.category, s.name
    `, [staffId]);
    
    res.json({ success: true, skills });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/staff/:staffId/skills', async (req, res) => {
  try {
    await ensureTables();
    const { staffId } = req.params;
    const { skill_id, proficiency_level, source } = req.body;
    
    run(`
      INSERT OR REPLACE INTO staff_skills (id, staff_id, skill_id, proficiency_level, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [generateId(), staffId, skill_id, proficiency_level || 1, source || 'self', timestamp()]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// LEARNING PATHS
// ============================================

app.get('/paths', async (req, res) => {
  try {
    await ensureTables();
    const { department, role } = req.query;
    
    let sql = `SELECT * FROM learning_paths WHERE active = 1`;
    const params = [];
    
    if (department) { sql += ` AND (department IS NULL OR department = ?)`; params.push(department); }
    if (role) { sql += ` AND (role IS NULL OR role = ?)`; params.push(role); }
    
    const paths = query(sql, params);
    res.json({ success: true, paths: paths.map(p => ({ ...p, courses: JSON.parse(p.courses || '[]') })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/dashboard/:staffId', async (req, res) => {
  try {
    await ensureTables();
    const { staffId } = req.params;
    
    const inProgress = query(`SELECT e.*, c.title, c.category FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.staff_id = ? AND e.status = 'in_progress' ORDER BY e.enrolled_at DESC`, [staffId]);
    const completed = get(`SELECT COUNT(*) as count FROM enrollments WHERE staff_id = ? AND status = 'completed'`, [staffId]);
    const certifications = get(`SELECT COUNT(*) as count FROM certifications WHERE staff_id = ?`, [staffId]);
    const mandatory = query(`SELECT c.* FROM courses c WHERE c.is_mandatory = 1 AND c.id NOT IN (SELECT course_id FROM enrollments WHERE staff_id = ? AND status = 'completed')`, [staffId]);
    
    res.json({
      success: true,
      dashboard: {
        in_progress: inProgress,
        completed_courses: completed?.count || 0,
        certifications: certifications?.count || 0,
        pending_mandatory: mandatory
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
