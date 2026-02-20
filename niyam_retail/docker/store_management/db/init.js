// Store Management - Database Migration Runner
const fs = require('fs');
const path = require('path');
const { query } = require('@vruksha/platform/db/postgres');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('[Store Management] Running database migrations...');
  
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`[Store Management] Applying migration: ${file}`);
      await query(sql);
      console.log(`[Store Management] ✅ ${file} applied`);
    }
    
    console.log('[Store Management] All migrations completed');
  } catch (error) {
    console.error('[Store Management] Migration error:', error.message);
  }
}

module.exports = { runMigrations };
