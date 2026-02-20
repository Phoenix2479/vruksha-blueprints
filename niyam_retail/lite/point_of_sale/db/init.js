// Point of Sale - Database Migration Runner
const fs = require('fs');
const path = require('path');
const { query } = require('@vruksha/platform/db/postgres');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('[POS] Running database migrations...');
  
  try {
    // Get migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`[POS] Applying migration: ${file}`);
      await query(sql);
      console.log(`[POS] ✅ ${file} applied`);
    }
    
    console.log('[POS] All migrations completed');
  } catch (error) {
    console.error('[POS] Migration error:', error.message);
    // Don't throw - allow service to start even if some migrations fail
  }
}

module.exports = { runMigrations };
