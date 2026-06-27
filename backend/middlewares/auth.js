const jwt = require('jsonwebtoken');

/**
 * Middleware to verify the JWT token from the Authorization header.
 * Attaches the decoded user payload to req.user.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

  // Fallback to query param token (e.g. for window.open file downloads)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token is missing' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    try {
      // Import db locally to avoid circular dependency issues
      const db = require('../config/db');
      
      // Fetch fresh user data from database to get branch_id and latest role
      const user = db.prepare('SELECT id, username, role, branch_id FROM users WHERE id = ?').get(decodedUser.id);
        
      if (!user) {
        return res.status(401).json({ error: 'User no longer exists or could not be verified' });
      }

      // Attach the user object (id, username, role, branch_id) to the request
      req.user = user;
      next();
    } catch (dbErr) {
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }
  });
}

/**
 * Middleware to check if the authenticated user has the Admin role.
 * Must be used AFTER authenticateToken.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required for this action' });
  }

  next();
}

module.exports = {
  authenticateToken,
  requireAdmin
};
