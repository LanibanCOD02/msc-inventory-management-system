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

module.exports = db;
