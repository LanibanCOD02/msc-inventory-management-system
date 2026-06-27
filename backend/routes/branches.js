const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const crypto = require('crypto');

function generateUUID() {
  return crypto.randomUUID();
}

// GET /api/branches
router.get('/', authenticateToken, async (req, res) => {
  try {
    const branches = db.prepare('SELECT id, name, location, address, pincode FROM branches WHERE deleted_at IS NULL ORDER BY name ASC').all();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/branches (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, location, address, pincode } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required' });

    const id = generateUUID();
    db.prepare(`
      INSERT INTO branches (id, name, location, address, pincode, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, location, address, pincode, new Date().toISOString());

    const newBranch = db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
    res.json(newBranch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/branches/:id (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, address, pincode } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required' });

    const existing = db.prepare('SELECT * FROM branches WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });

    db.prepare(`
      UPDATE branches 
      SET name = ?, location = ?, address = ?, pincode = ?
      WHERE id = ?
    `).run(name, location, address, pincode, id);

    const updatedBranch = db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
    res.json(updatedBranch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/branches/:id/deactivate (Admin only)
router.post('/:id/deactivate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM branches WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });

    db.prepare('UPDATE branches SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    res.json({ success: true, message: 'Branch deactivated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
