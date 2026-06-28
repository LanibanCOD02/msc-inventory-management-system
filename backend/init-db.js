const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'database.db');
const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

console.log('Initializing database...');

try {
  // Ensure the database directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  
  // Read schema
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  // Execute schema
  db.exec(schema);
  
  console.log('✅ Database initialized successfully!');
  console.log(`Database location: ${dbPath}`);
} catch (error) {
  console.error('❌ Failed to initialize database:', error.message);
  process.exit(1);
}
