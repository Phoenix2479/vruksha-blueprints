// E-commerce Integration - Database Migration Runner
const fs = require('fs');
const path = require('path');
const { query } = require('@vruksha/platform/db/postgres');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('[E-commerce] Running database migrations...');
  
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`[E-commerce] Applying migration: ${file}`);
      await query(sql);
      console.log(`[E-commerce] ✅ ${file} applied`);
    }
    
    console.log('[E-commerce] All migrations completed');
  } catch (error) {
    console.error('[E-commerce] Migration error:', error.message);
  }
}

module.exports = { runMigrations };
