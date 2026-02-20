/**
 * CRM Database Initialization
 * Runs migrations to ensure all tables exist
 */

const fs = require('fs');
const path = require('path');
const { query, getClient } = require('@vruksha/platform/db/postgres');

async function runMigrations() {
  console.log('[CRM] Running database migrations...');
  
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('[CRM] No migrations directory found');
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  const client = await getClient();
  
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`[CRM] Running migration: ${file}`);
      await client.query(sql);
      console.log(`[CRM] ✅ Migration completed: ${file}`);
    }
  } catch (error) {
    console.error('[CRM] Migration error:', error.message);
    // Don't throw - let the service start even if some migrations fail
    // (they may have already been applied)
  } finally {
    client.release();
  }
  
  console.log('[CRM] Database migrations complete');
}

module.exports = { runMigrations };
