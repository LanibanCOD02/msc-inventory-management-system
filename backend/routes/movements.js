const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { getBranchFilterSql, getBranchId } = require('../config/branchFilter');
const crypto = require('crypto');

function generateUUID() {
  return crypto.randomUUID();
}

// GET /api/movements (Includes inventory item names and user names)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    // Total count
    const countQuery = db.prepare(`SELECT COUNT(*) as total FROM inventory_movements m WHERE ${condition.replace(/branch_id/g, 'm.branch_id')}`).get(...params);
    const count = countQuery.total;

    // Data
    const data = db.prepare(`
      SELECT m.*, i.name as inventory_items_name, i.unit as inventory_items_unit, u.username as users_username
      FROM inventory_movements m
      LEFT JOIN inventory_items i ON m.item_id = i.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE ${condition.replace(/branch_id/g, 'm.branch_id')}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Map data to match old format
    const mappedData = data.map(row => {
      const { inventory_items_name, inventory_items_unit, users_username, ...movementData } = row;
      return {
        ...movementData,
        inventory_items: {
          name: inventory_items_name,
          unit: inventory_items_unit
        },
        users: {
          username: users_username
        }
      };
    });
    
    res.json({
      data: mappedData,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/movements
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { inventory_id, type, quantity, party_name, reference_code, notes, branch_id, recipient_name, product_photo_url, invoice_pdf_url } = req.body;
    
    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be positive' });
    if (type === 'INWARD' && !party_name) return res.status(400).json({ error: 'Party name (Supplier) is required for INWARD movements' });

    const resolvedBranchId = getBranchId(req.user, branch_id);

    const movement_type = (type || '').toUpperCase() === 'INWARD' || (type || '').toUpperCase() === 'IN' ? 'IN' : 'OUT';

    const insertMovementAndAdjustStock = db.transaction(() => {
      // Verify item exists
      const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(inventory_id);
      if (!item) throw new Error('Item not found');

      if (movement_type === 'OUT' && item.stock < qty) {
         throw new Error('Insufficient stock');
      }

      // Insert movement
      const refCode = reference_code || `${movement_type}-${Math.floor(Math.random() * 9000) + 1000}`;
      const moveId = generateUUID();
      
      db.prepare(`
        INSERT INTO inventory_movements (id, reference_code, item_id, movement_type, quantity, party_name, created_by, branch_id, created_at, recipient_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(moveId, refCode, inventory_id, movement_type, qty, party_name || null, req.user.id, resolvedBranchId || null, new Date().toISOString(), recipient_name || null);

      // Adjust stock and file URLs if INWARD
      let updateSql = 'UPDATE inventory_items SET stock = stock + ?';
      let updateParams = [movement_type === 'IN' ? qty : -qty];
      if (movement_type === 'IN') {
        if (product_photo_url) { updateSql += ', product_photo_url = ?'; updateParams.push(product_photo_url); }
        if (invoice_pdf_url) { updateSql += ', invoice_pdf_url = ?'; updateParams.push(invoice_pdf_url); }
      }
      updateSql += ' WHERE id = ?';
      updateParams.push(inventory_id);
      db.prepare(updateSql).run(...updateParams);
      
      return db.prepare('SELECT * FROM inventory_movements WHERE id = ?').get(moveId);
    });

    const movement = insertMovementAndAdjustStock();
    res.json(movement);
  } catch (error) {
    if (error.message === 'Item not found') return res.status(404).json({ error: error.message });
    if (error.message === 'Insufficient stock') return res.status(400).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/movements/:id/void
router.post('/:id/void', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const voidMovementTransaction = db.transaction(() => {
      // 1. Get the original movement
      const movement = db.prepare('SELECT * FROM inventory_movements WHERE id = ?').get(id);
      if (!movement) throw new Error('Movement not found');
      if (movement.voided) throw new Error('Movement already voided');

      // 2. Reverse the stock change
      const reversal = movement.movement_type === 'IN' ? -movement.quantity : movement.quantity;
      db.prepare('UPDATE inventory_items SET stock = stock + ? WHERE id = ?').run(reversal, movement.item_id);

      // 3. Mark movement as voided
      db.prepare('UPDATE inventory_movements SET voided = 1, voided_at = ?, voided_by = ? WHERE id = ?')
        .run(new Date().toISOString(), req.user.id, id);

      // 4. Insert reversal movement for audit trail
      db.prepare(`
        INSERT INTO inventory_movements (id, item_id, movement_type, quantity, party_name, reference_code, created_by, branch_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateUUID(), movement.item_id, movement.movement_type === 'IN' ? 'OUT' : 'IN', movement.quantity, `VOID of ${movement.reference_code}`, `VOID-${movement.reference_code}`, req.user.id, movement.branch_id, new Date().toISOString());
    });

    voidMovementTransaction();

    res.json({ success: true, data: { message: 'Movement voided successfully' } });
  } catch(err) {
    if (err.message === 'Movement not found') return res.status(404).json({ success: false, error: err.message });
    if (err.message === 'Movement already voided') return res.status(400).json({ success: false, error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/movements/transfer
router.post('/transfer', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { inventory_id, source_branch_id, destination_branch_id, quantity } = req.body;
    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be positive' });
    if (!source_branch_id || !destination_branch_id) return res.status(400).json({ error: 'Both source and destination branches are required' });
    if (source_branch_id === destination_branch_id) return res.status(400).json({ error: 'Source and destination branches must be different' });

    const transferTransaction = db.transaction(() => {
      // 1. Verify source item exists and has enough stock
      const sourceItem = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND branch_id = ?').get(inventory_id, source_branch_id);
      if (!sourceItem) throw new Error('Source item not found in the specified branch');
      if (sourceItem.stock < qty) throw new Error('Insufficient stock at source branch');

      // 2. Find or create destination item
      let destItem = db.prepare('SELECT * FROM inventory_items WHERE name = ? AND branch_id = ? AND deleted_at IS NULL').get(sourceItem.name, destination_branch_id);
      if (!destItem) {
        const newDestItemId = generateUUID();
        db.prepare(`
          INSERT INTO inventory_items (id, name, category, stock, unit, threshold, unit_price, branch_id, created_at)
          VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
        `).run(newDestItemId, sourceItem.name, sourceItem.category, sourceItem.unit, sourceItem.threshold, sourceItem.unit_price, destination_branch_id, new Date().toISOString());
        destItem = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(newDestItemId);
      }

      const transferId = generateUUID();
      const refCode = `TRN-${Math.floor(Math.random() * 90000) + 10000}`;

      // 3. Deduct stock from source and create OUT movement
      db.prepare('UPDATE inventory_items SET stock = stock - ? WHERE id = ?').run(qty, sourceItem.id);
      db.prepare(`
        INSERT INTO inventory_movements (id, reference_code, item_id, movement_type, quantity, party_name, created_by, branch_id, created_at, transfer_id)
        VALUES (?, ?, ?, 'OUT', ?, 'Branch Transfer', ?, ?, ?, ?)
      `).run(generateUUID(), refCode, sourceItem.id, qty, req.user.id, source_branch_id, new Date().toISOString(), transferId);

      // 4. Add stock to destination and create IN movement
      db.prepare('UPDATE inventory_items SET stock = stock + ? WHERE id = ?').run(qty, destItem.id);
      db.prepare(`
        INSERT INTO inventory_movements (id, reference_code, item_id, movement_type, quantity, party_name, created_by, branch_id, created_at, transfer_id)
        VALUES (?, ?, ?, 'IN', ?, 'Branch Transfer', ?, ?, ?, ?)
      `).run(generateUUID(), refCode, destItem.id, qty, req.user.id, destination_branch_id, new Date().toISOString(), transferId);

      return { success: true, transfer_id: transferId };
    });

    const result = transferTransaction();
    res.json(result);
  } catch (error) {
    if (error.message === 'Source item not found in the specified branch' || error.message === 'Insufficient stock at source branch') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
