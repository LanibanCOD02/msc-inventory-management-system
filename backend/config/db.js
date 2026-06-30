const Database = require('better-sqlite3');
const path = require('path');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../database');
const dbPath = path.join(dataDir, 'database.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// Safe migrations
try { db.exec("ALTER TABLE inventory_movements ADD COLUMN transfer_id TEXT"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE inventory_movements ADD COLUMN recipient_name TEXT"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE branches ADD COLUMN deleted_at TEXT"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE deletion_requests ADD COLUMN reason TEXT"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE deletion_requests ADD COLUMN reason_details TEXT"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE deletion_requests ADD COLUMN resale_price REAL"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE deletion_requests ADD COLUMN quantity INTEGER"); } catch (e) { /* Ignore if exists */ }
try { db.exec("ALTER TABLE inventory_movements ADD COLUMN total_price REAL"); } catch(e) { /* Ignore if exists */ }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      branch_id TEXT,
      old_unit_price REAL,
      new_unit_price REAL NOT NULL,
      quantity_added INTEGER NOT NULL,
      total_price_paid REAL NOT NULL,
      changed_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    );
  `);
} catch (e) {
  console.error("Failed to create price_history table:", e);
}

module.exports = db;
