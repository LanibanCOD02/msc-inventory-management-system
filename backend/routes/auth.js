const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

// Helper to generate UUIDs
const crypto = require('crypto');
function generateUUID() {
  return crypto.randomUUID();
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // 1. Fetch user by username from the database
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      // Return generic error for security
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // 2. Compare the provided password with the stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // 3. Generate a JWT token containing user details
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id
    };

    // Sign the token with a 24-hour expiration
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

    // 4. Send the token and user data back to the client
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/users (Admin only, exclude password_hash)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, branch_id, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/users (Admin only, create user)
router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, branch_id } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    const id = generateUUID();
    const created_at = new Date().toISOString();

    // Insert user
    db.prepare('INSERT INTO users (id, username, password_hash, role, branch_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username, password_hash, role, branch_id || null, created_at);

    const newUser = db.prepare('SELECT id, username, role, branch_id, created_at FROM users WHERE id = ?').get(id);
    res.status(201).json(newUser);

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/users/:id (Admin only, edit user)
router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role, password, branch_id } = req.body;

    // Check if updating username to one that already exists (excluding current user)
    if (username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    const updates = [];
    const params = [];

    if (username) { updates.push('username = ?'); params.push(username); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (branch_id !== undefined) { updates.push('branch_id = ?'); params.push(branch_id || null); }

    if (password) {
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);
      updates.push('password_hash = ?');
      params.push(password_hash);
    }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updatedUser = db.prepare('SELECT id, username, role, branch_id, created_at FROM users WHERE id = ?').get(id);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(updatedUser);

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/auth/users/:id (Admin only)
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/setup-required
// Returns true only if there are zero users in the database
router.get('/setup-required', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
    res.json({ setupRequired: count.count === 0 });
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/setup
// Creates the first Admin user
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (count.count > 0) return res.status(403).json({ error: 'Setup already complete' });

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    const id = generateUUID();
    const created_at = new Date().toISOString();

    db.prepare('INSERT INTO users (id, username, password_hash, role, branch_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username, password_hash, 'Admin', null, created_at);

    res.json({ success: true, message: 'Admin account created' });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
