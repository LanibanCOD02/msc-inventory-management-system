const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { getBranchFilterSql, getBranchId } = require('../config/branchFilter');
const crypto = require('crypto');

function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Helper function to generate full CRUD routes for a given resource.
 * @param {Object} router - Express router instance
 * @param {string} resourceName - The base path for the resource (e.g., 'categories')
 * @param {string} tableName - The SQLite table name (e.g., 'categories')
 */
function createCrudRoutes(router, resourceName, tableName) {
  const basePath = `/${resourceName}`;

  // GET all (excluding soft-deleted)
  router.get(basePath, authenticateToken, async (req, res) => {
    try {
      const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id, true);
      const rows = db.prepare(`SELECT * FROM ${tableName} WHERE deleted_at IS NULL AND ${condition}`).all(...params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET by id (excluding soft-deleted)
  router.get(`${basePath}/:id`, authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id, true);
      
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ? AND deleted_at IS NULL AND ${condition}`).get(id, ...params);

      if (!row) return res.status(404).json({ error: `${resourceName} not found` });
      
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST new
  router.post(basePath, authenticateToken, async (req, res) => {
    try {
      const { name, description, branch_id } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const resolvedBranchId = getBranchId(req.user, branch_id);
      
      // Check for unique name constraint manually since we may not have UNIQUE constraints set up for name in sqlite schema
      const existing = db.prepare(`SELECT id FROM ${tableName} WHERE name = ? AND deleted_at IS NULL`).get(name);
      if (existing) {
        return res.status(409).json({ error: 'Name must be unique' });
      }

      const id = generateUUID();
      const created_at = new Date().toISOString();

      db.prepare(`INSERT INTO ${tableName} (id, name, description, created_at, branch_id) VALUES (?, ?, ?, ?, ?)`)
        .run(id, name, description || null, created_at, resolvedBranchId || null);

      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      res.status(201).json(row);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE')) { 
        return res.status(409).json({ error: 'Name must be unique' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // PUT update
  router.put(`${basePath}/:id`, authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      if (name) {
        const existing = db.prepare(`SELECT id FROM ${tableName} WHERE name = ? AND id != ? AND deleted_at IS NULL`).get(name, id);
        if (existing) {
          return res.status(409).json({ error: 'Name must be unique' });
        }
      }

      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }

      if (updates.length > 0) {
        params.push(id);
        const info = db.prepare(`UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...params);
        if (info.changes === 0) {
           return res.status(404).json({ error: `${resourceName} not found` });
        }
      }

      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      if (!row) return res.status(404).json({ error: `${resourceName} not found` });

      res.json(row);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Name must be unique' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE soft-delete (Admin only)
  router.delete(`${basePath}/:id`, authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted_at = new Date().toISOString();
      
      const info = db.prepare(`UPDATE ${tableName} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(deleted_at, id);

      if (info.changes === 0) {
        return res.status(404).json({ error: `${resourceName} not found or already deleted` });
      }

      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      res.json({ message: `${resourceName} deleted successfully`, data: row });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Map the resources to their corresponding database tables
createCrudRoutes(router, 'categories', 'categories');
createCrudRoutes(router, 'programs', 'programs');
createCrudRoutes(router, 'suppliers', 'suppliers');

module.exports = router;
