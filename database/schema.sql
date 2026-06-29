CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      address TEXT,
      pincode TEXT,
      created_at TEXT
    , deleted_at TEXT);

CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT,
      branch_id TEXT
    );

CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      stock INTEGER DEFAULT 0,
      unit TEXT NOT NULL,
      threshold INTEGER DEFAULT 0,
      product_photo_url TEXT,
      bill_image_url TEXT,
      invoice_pdf_url TEXT,
      created_at TEXT,
      deleted_at TEXT,
      unit_price REAL DEFAULT 0,
      default_supplier TEXT,
      program TEXT,
      branch_id TEXT NOT NULL
    );

CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      reference_code TEXT,
      item_id TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      party_name TEXT,
      created_by TEXT,
      created_at TEXT,
      voided INTEGER DEFAULT 0,
      voided_at TEXT,
      voided_by TEXT,
      branch_id TEXT NOT NULL
    , transfer_id TEXT, recipient_name TEXT, total_price REAL);

CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT,
      deleted_at TEXT,
      branch_id TEXT
    );

CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT,
      deleted_at TEXT,
      branch_id TEXT
    );

CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT,
      deleted_at TEXT,
      branch_id TEXT
    );

CREATE TABLE IF NOT EXISTS deletion_requests (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_by TEXT,
    reviewed_at DATETIME, reason TEXT, reason_details TEXT, resale_price REAL, quantity INTEGER,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);