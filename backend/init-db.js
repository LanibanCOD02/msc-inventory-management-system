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
  
  // Seed 4 default categories if empty
  const count = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (count.count === 0) {
    const crypto = require('crypto');
    const insertCat = db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)');
    const defaultCategories = ['Clinical & Pharma', 'Program materials', 'Food & nutrition', 'School & Education'];
    const now = new Date().toISOString();
    
    // Use a transaction for bulk insert
    const insertMany = db.transaction((cats) => {
      for (const cat of cats) {
        insertCat.run(crypto.randomUUID(), cat, now);
      }
    });
    insertMany(defaultCategories);
    console.log('✅ Seeded 4 default categories.');
  }

  console.log('✅ Database initialized successfully!');
  console.log(`Database location: ${dbPath}`);
} catch (error) {
  console.error('❌ Failed to initialize database:', error.message);
  process.exit(1);
}
