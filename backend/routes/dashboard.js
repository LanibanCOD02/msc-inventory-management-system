const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const { getBranchFilterSql } = require('../config/branchFilter');

router.get('/metrics', authenticateToken, async (req, res) => {
  try {
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    let inventoryValue = 0;
    try {
      const valueData = db.prepare(`SELECT stock, unit_price FROM inventory_items WHERE deleted_at IS NULL AND ${condition}`).all(...params);
      inventoryValue = valueData.reduce((sum, i) => sum + ((i.stock || 0) * (i.unit_price || 0)), 0);
    } catch (err) {
      console.warn("Could not fetch metrics (ensure unit_price column exists):", err.message);
    }
    
    res.json({ inventoryValue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/charts', authenticateToken, async (req, res) => {
  try {
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);

    // Fetch inventory for Category Distribution
    const inventory = db.prepare(`SELECT category, stock FROM inventory_items WHERE deleted_at IS NULL AND ${condition}`).all(...params);

    const catMap = {};
    inventory.forEach(item => {
      const cat = item.category || 'Uncategorized';
      catMap[cat] = (catMap[cat] || 0) + item.stock;
    });
    
    const categoryDistribution = Object.entries(catMap).map(([category, totalStock]) => ({
      category,
      totalStock
    }));

    // Fetch real movements from the past 28 days
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    
    const movements = db.prepare(`
      SELECT movement_type, quantity, created_at, voided, reference_code 
      FROM inventory_movements 
      WHERE created_at >= ? AND (voided IS NULL OR voided = 0) AND reference_code NOT LIKE 'VOID-%' AND ${condition}
    `).all(fourWeeksAgo.toISOString(), ...params);

    const weeklyMovementsMap = {
      'Week 1': { inward: 0, outward: 0 },
      'Week 2': { inward: 0, outward: 0 },
      'Week 3': { inward: 0, outward: 0 },
      'Week 4': { inward: 0, outward: 0 }
    };

    if (movements) {
      movements.forEach(m => {
        const createdDate = new Date(m.created_at);
        const diffTime = Math.max(0, now - createdDate); // Ensure no negative diff
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        
        let weekLabel = '';
        if (diffDays <= 7) weekLabel = 'Week 4';
        else if (diffDays <= 14) weekLabel = 'Week 3';
        else if (diffDays <= 21) weekLabel = 'Week 2';
        else if (diffDays <= 28) weekLabel = 'Week 1';
        
        if (weekLabel) {
          if (m.movement_type === 'IN' || m.movement_type === 'INWARD') {
            weeklyMovementsMap[weekLabel].inward += m.quantity;
          } else if (m.movement_type === 'OUT' || m.movement_type === 'OUTWARD') {
            weeklyMovementsMap[weekLabel].outward += m.quantity;
          }
        }
      });
    }

    const weeklyMovements = Object.keys(weeklyMovementsMap).map(week => ({
      week,
      inward: weeklyMovementsMap[week].inward,
      outward: weeklyMovementsMap[week].outward
    }));

    res.json({
      weeklyMovements,
      categoryDistribution
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
