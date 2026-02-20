// Database initialization for Inventory Sync
// Runs migrations on startup

const { query } = require('@vruksha/platform/db/postgres');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  console.log('Running inventory sync migrations...');

  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found');
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
      console.log(`Migration applied: ${file}`);
    } catch (error) {
      if (error.code === '42P07' || error.code === '42710') {
        console.log(`Migration skipped (already exists): ${file}`);
      } else {
        console.error(`Migration failed: ${file}`, error.message);
        throw error;
      }
    }
  }

  console.log('Inventory sync migrations complete');
}

module.exports = { runMigrations };
