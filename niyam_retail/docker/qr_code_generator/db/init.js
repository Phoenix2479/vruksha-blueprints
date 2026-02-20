// Database initialization for QR Code Generator
// Runs migrations on startup

const { query } = require('@vruksha/platform/db/postgres');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  console.log('[QR Generator] Running database migrations...');
  
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('[QR Generator] No migrations directory found');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await query(sql);
      console.log(`[QR Generator] Migration applied: ${file}`);
    } catch (error) {
      // Ignore errors for "already exists"
      if (error.code === '42P07' || error.code === '42710') {
        console.log(`[QR Generator] Migration skipped (already exists): ${file}`);
      } else {
        console.error(`[QR Generator] Migration failed: ${file}`, error.message);
        throw error;
      }
    }
  }
  
  console.log('[QR Generator] Database migrations complete');
}

module.exports = { runMigrations };
