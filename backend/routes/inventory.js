const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { getBranchFilterSql, getBranchId } = require('../config/branchFilter');
const crypto = require('crypto');
const multer = require('multer');
const ExcelJS = require('exceljs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function generateUUID() {
  return crypto.randomUUID();
}

// Get all inventory items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    const items = db.prepare(`
      SELECT i.id, i.name, i.category, i.stock, i.unit, i.threshold, i.unit_price, i.product_photo_url, i.created_at, i.default_supplier, i.program, i.branch_id, b.name as branch_name 
      FROM inventory_items i
      LEFT JOIN branches b ON i.branch_id = b.id
      WHERE i.deleted_at IS NULL AND ${condition.replace(/branch_id/g, 'i.branch_id')} 
      ORDER BY i.created_at DESC 
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/alerts
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    const data = db.prepare(`
      SELECT id, name, stock, unit, threshold, category 
      FROM inventory_items 
      WHERE deleted_at IS NULL AND ${condition} 
      ORDER BY stock ASC
    `).all(...params);
    
    // Filter items where stock is less than or equal to threshold
    const alerts = data
      .filter(item => Number(item.stock) <= Number(item.threshold))
      .map(item => ({
        ...item,
        criticality: Number(item.stock) === 0 ? 'critical' : 'low'
      }));
      
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new item
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, category, stock, unit, threshold, unit_price, product_photo_url, invoice_pdf_url, branch_id, default_supplier, program } = req.body;

    const resolvedBranchId = getBranchId(req.user, branch_id);

    // Manual uniqueness check per branch
    let existQuerySql = `SELECT id, deleted_at FROM inventory_items WHERE name = ?`;
    let existParams = [name];
    if (resolvedBranchId) {
      existQuerySql += ` AND branch_id = ?`;
      existParams.push(resolvedBranchId);
    } else {
      existQuerySql += ` AND branch_id IS NULL`;
    }
    
    const existing = db.prepare(existQuerySql).get(...existParams);
    
    let itemId;
    let itemStock = Number(stock) || 0;
    let itemUnitPrice = Number(unit_price) || 0;

    if (existing) {
      if (existing.deleted_at) {
        // It was deleted. Restore and update it.
        itemId = existing.id;
        db.prepare(`
          UPDATE inventory_items 
          SET category = ?, stock = ?, unit = ?, threshold = ?, unit_price = ?, product_photo_url = ?, invoice_pdf_url = ?, default_supplier = ?, program = ?, deleted_at = NULL 
          WHERE id = ?
        `).run(category, itemStock, unit, Number(threshold) || 10, itemUnitPrice, product_photo_url, invoice_pdf_url, default_supplier || null, program || null, itemId);
      } else {
        return res.status(400).json({ error: 'An item with this exact name already exists in active inventory.' });
      }
    } else {
      // Insert new
      itemId = generateUUID();
      db.prepare(`
        INSERT INTO inventory_items (id, name, category, stock, unit, threshold, unit_price, product_photo_url, invoice_pdf_url, branch_id, default_supplier, program, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, name, category, itemStock, unit, Number(threshold) || 10, itemUnitPrice, product_photo_url, invoice_pdf_url, resolvedBranchId || null, default_supplier || null, program || null, new Date().toISOString());
    }

    const insertedItem = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
    
    // Log initial price in history
    db.prepare(`
      INSERT INTO price_history (id, item_id, branch_id, old_unit_price, new_unit_price, quantity_added, total_price_paid, changed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateUUID(), itemId, resolvedBranchId || null, null, itemUnitPrice, itemStock, itemStock * itemUnitPrice, req.user.id, new Date().toISOString());

    // If initial stock > 0, auto-create an INWARD movement
    if (insertedItem.stock > 0) {
      const refCode = `IN-${Math.floor(Math.random() * 9000) + 1000}`;
      let partyName = 'Initial Stock Entry';
      
      if (default_supplier) {
        // Check if default_supplier is a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(default_supplier)) {
          const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(default_supplier);
          if (supplier) partyName = supplier.name;
        } else {
          partyName = default_supplier;
        }
      }

      db.prepare(`
        INSERT INTO inventory_movements (id, reference_code, item_id, movement_type, quantity, party_name, created_by, branch_id, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateUUID(), refCode, insertedItem.id, 'IN', insertedItem.stock, partyName, req.user.id, resolvedBranchId || null, new Date().toISOString());
    }

    res.status(201).json(insertedItem);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE')) {
       return res.status(400).json({ error: 'An item with this exact name already exists in active inventory.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get movements
router.get('/movements', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query; // 'IN' or 'OUT'
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    let typeCondition = '';
    if (type) {
      typeCondition = ' AND m.movement_type = ?';
      params.push(type);
    }
    
    // Total count
    const countQuery = db.prepare(`SELECT COUNT(*) as total FROM inventory_movements m WHERE ${condition.replace(/branch_id/g, 'm.branch_id')} ${typeCondition}`).get(...params);
    const count = countQuery.total;

    // Data
    const data = db.prepare(`
      SELECT m.*, i.name as inventory_items_name, i.unit as inventory_items_unit
      FROM inventory_movements m
      LEFT JOIN inventory_items i ON m.item_id = i.id
      WHERE ${condition.replace(/branch_id/g, 'm.branch_id')} ${typeCondition}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Map data to match old format
    const mappedData = data.map(row => {
      const { inventory_items_name, inventory_items_unit, ...movementData } = row;
      return {
        ...movementData,
        inventory_items: {
          name: inventory_items_name,
          unit: inventory_items_unit
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

// GET /api/inventory/price-history/all — standalone page, ALL items
router.get('/price-history/all', authenticateToken, (req, res) => {
  try {
    let query = `
      SELECT ph.*, i.name as item_name, i.category, b.name as branch_name
      FROM price_history ph
      JOIN inventory_items i ON ph.item_id = i.id
      LEFT JOIN branches b ON ph.branch_id = b.id
    `;
    const params = [];
    if (req.user.role !== 'Admin') {
      query += ' WHERE ph.branch_id = ?';
      params.push(req.user.branch_id);
    }
    query += ' ORDER BY ph.created_at DESC LIMIT 100';
    res.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error('Price history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/inventory/:id/price-history — for one item
router.get('/:id/price-history', authenticateToken, (req, res) => {
  try {
    let query = 'SELECT * FROM price_history WHERE item_id = ?';
    const params = [req.params.id];
    if (req.user.role !== 'Admin') {
      query += ' AND branch_id = ?';
      params.push(req.user.branch_id);
    }
    query += ' ORDER BY created_at ASC';
    res.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error('Price history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific inventory item by ID (Full data including document URLs)
router.get('/:id', authenticateToken, async (req, res, next) => {
  // Fallback just in case
  const reserved = ['movements', 'deletion-requests', 'bulk-import-template', 'bulk-import'];
  if (reserved.includes(req.params.id)) return next();
  
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);

    if (!item) throw new Error('Item not found');
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add movement (Inward/Outward)
router.post('/:id/movement', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { movement_type, quantity, party_name } = req.body;

    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be positive' });
    if (!party_name) return res.status(400).json({ error: 'Party name is required' });

    // Verify item exists
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (movement_type === 'OUT' && item.stock < qty) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // Insert movement
    const refCode = `${movement_type}-${Math.floor(Math.random() * 9000) + 1000}`;
    const moveId = generateUUID();
    db.prepare(`
      INSERT INTO inventory_movements (id, reference_code, item_id, movement_type, quantity, party_name, created_by, branch_id, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(moveId, refCode, id, movement_type, qty, party_name, req.user.id, item.branch_id, new Date().toISOString());

    const movement = db.prepare('SELECT * FROM inventory_movements WHERE id = ?').get(moveId);

    // Update stock
    const newStock = movement_type === 'IN' ? item.stock + qty : item.stock - qty;
    db.prepare('UPDATE inventory_items SET stock = ? WHERE id = ?').run(newStock, id);

    res.status(201).json(movement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update inventory item (Admin Only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, unit, threshold, unit_price, product_photo_url, invoice_pdf_url, default_supplier, program, branch_id } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (unit !== undefined) { updates.push('unit = ?'); params.push(unit); }
    if (threshold !== undefined) { updates.push('threshold = ?'); params.push(Number(threshold)); }
    if (unit_price !== undefined) { updates.push('unit_price = ?'); params.push(Number(unit_price)); }
    if (product_photo_url !== undefined) { updates.push('product_photo_url = ?'); params.push(product_photo_url); }
    if (invoice_pdf_url !== undefined) { updates.push('invoice_pdf_url = ?'); params.push(invoice_pdf_url); }
    if (default_supplier !== undefined) { updates.push('default_supplier = ?'); params.push(default_supplier); }
    if (program !== undefined) { updates.push('program = ?'); params.push(program); }
    if (branch_id !== undefined) { updates.push('branch_id = ?'); params.push(branch_id); }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE inventory_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updatedItem = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
    res.json(updatedItem);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'An item with this exact name already exists in this branch.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Soft-delete inventory item (Admin Only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE inventory_items SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Deletion Requests (Staff/Admin) ────────────────

// 1. Get all deletion requests
router.get('/deletion-requests/all', authenticateToken, async (req, res) => {
  try {
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    // Admin sees all based on branch filter, Staff sees only their branch
    const requests = db.prepare(`
      SELECT dr.*, i.name as item_name, i.unit_price as item_buy_price, i.product_photo_url, u.username as requested_by_name, b.name as branch_name
      FROM deletion_requests dr
      JOIN inventory_items i ON dr.item_id = i.id
      JOIN users u ON dr.requested_by = u.id
      JOIN branches b ON dr.branch_id = b.id
      WHERE ${condition.replace(/branch_id/g, 'dr.branch_id')}
      ORDER BY dr.requested_at DESC
    `).all(...params);
    
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Request deletion (Staff)
router.post('/:id/request-deletion', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
    
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    // Check if staff belongs to the same branch
    if (req.user.role !== 'Admin' && req.user.branch_id !== item.branch_id) {
      return res.status(403).json({ error: 'Forbidden: Item belongs to another branch' });
    }
    
    const reqId = generateUUID();
    const { reason, reason_details, resale_price, quantity } = req.body;
    
    // Calculate how much stock is already tied up in pending requests
    // If an old request doesn't have a quantity, it means the full stock was requested
    const pendingSumResult = db.prepare('SELECT SUM(IFNULL(quantity, ?)) as total_pending FROM deletion_requests WHERE item_id = ? AND status = ?').get(item.stock, id, 'pending');
    const totalPending = pendingSumResult.total_pending || 0;
    
    // Validate quantity
    const reqQty = parseInt(quantity, 10);
    if (!reqQty || reqQty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity.' });
    }
    
    const availableStock = item.stock - totalPending;
    if (reqQty > availableStock) {
      return res.status(400).json({ error: `Cannot request deletion of ${reqQty} units. Only ${availableStock} unit(s) are currently available after accounting for other pending requests.` });
    }
    
    db.prepare(`
      INSERT INTO deletion_requests (id, item_id, requested_by, branch_id, status, requested_at, reason, reason_details, resale_price, quantity)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(reqId, id, req.user.id, item.branch_id, new Date().toISOString(), reason || null, reason_details || null, resale_price || null, reqQty);
    
    res.status(201).json({ message: 'Deletion request submitted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Approve deletion request (Admin Only)
router.post('/deletion-requests/:reqId/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reqId } = req.params;
    const request = db.prepare('SELECT * FROM deletion_requests WHERE id = ?').get(reqId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is no longer pending' });
    
    // Get the original item to check its stock
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(request.item_id);
    if (!item) return res.status(404).json({ error: 'Associated item not found' });
    
    const reqQty = request.quantity || item.stock; // fallback if quantity wasn't set (e.g. old requests)
    
    // Start transaction to approve and soft-delete/reduce
    const approveTx = db.transaction(() => {
      // 1. Update request
      db.prepare(`UPDATE deletion_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
        .run(req.user.id, new Date().toISOString(), reqId);
        
      // 2. Reduce stock or soft-delete
      if (reqQty >= item.stock) {
        // Full quantity requested -> soft delete
        db.prepare('UPDATE inventory_items SET deleted_at = ?, stock = 0 WHERE id = ?')
          .run(new Date().toISOString(), request.item_id);
      } else {
        // Partial quantity requested -> reduce stock only
        db.prepare('UPDATE inventory_items SET stock = stock - ? WHERE id = ?')
          .run(reqQty, request.item_id);
      }
    });
    approveTx();
    
    res.json({ message: 'Request approved and item deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Reject deletion request (Admin Only)
router.post('/deletion-requests/:reqId/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reqId } = req.params;
    const request = db.prepare('SELECT * FROM deletion_requests WHERE id = ?').get(reqId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is no longer pending' });
    
    db.prepare(`UPDATE deletion_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
      .run(req.user.id, new Date().toISOString(), reqId);
      
    res.json({ message: 'Request rejected.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/bulk-import-template
router.get('/bulk-import-template', authenticateToken, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bulk Import Template');
    
          const cols = [];
      const rowData = {};
      
      if (req.user.role === 'Admin' || req.user.role === 'admin') {
         cols.push({ header: 'Branch Name', key: 'branch', width: 25 });
         rowData.branch = 'Main Branch';
      }
      
      cols.push(
        { header: 'Item Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Unit', key: 'unit', width: 15 },
        { header: 'Initial Stock', key: 'stock', width: 15 },
        { header: 'Threshold', key: 'threshold', width: 15 },
        { header: 'Unit Price', key: 'price', width: 15 }
      );
      
      rowData.name = 'Sample Item';
      rowData.category = 'Stationery';
      rowData.unit = 'pcs';
      rowData.stock = 100;
      rowData.threshold = 10;
      rowData.price = 50.00;
      
      worksheet.columns = cols;
      worksheet.addRow(rowData);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk_import_template.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inventory/bulk-import
router.post('/bulk-import', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const workbook = new ExcelJS.Workbook();
    const filename = req.file.originalname.toLowerCase();
    
    if (filename.endsWith('.csv')) {
      const { Readable } = require('stream');
      await workbook.csv.read(Readable.from(req.file.buffer));
    } else {
      await workbook.xlsx.load(req.file.buffer);
    }
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return res.status(400).json({ error: 'Empty spreadsheet' });
    
    const getVal = (cell) => {
      if (!cell || cell.value == null) return '';
      if (typeof cell.value === 'object') {
        if (cell.value.richText) return cell.value.richText.map(rt => rt.text).join('');
        if (cell.value.result !== undefined) return cell.value.result;
        return cell.text || '';
      }
      return cell.value.toString();
    };

    const headerRow = worksheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const header = getVal(cell).trim().toLowerCase();
      if (header === 'branch name') colMap['branch'] = colNumber;
      if (header === 'item name') colMap['name'] = colNumber;
      if (header === 'category') colMap['category'] = colNumber;
      if (header === 'unit') colMap['unit'] = colNumber;
      if (header === 'initial stock') colMap['stock'] = colNumber;
      if (header === 'threshold') colMap['threshold'] = colNumber;
        if (header === 'unit price') colMap['price'] = colNumber;
    });
    
          const isAdmin = req.user.role === 'Admin' || req.user.role === 'admin';
      if (!colMap['name'] || (isAdmin && !req.body.branch_id && colMap['branch'] === undefined)) {
        return res.status(400).json({ error: 'Template missing required columns (Item Name, Branch Name)' });
      }
    
    let added = 0;
    let updated = 0;
    const errors = [];
    
    const branches = db.prepare('SELECT id, name FROM branches WHERE deleted_at IS NULL').all();
    const branchMap = {};
    for (const b of branches) {
      branchMap[b.name.toLowerCase()] = b.id;
    }
    
    // If a target branch was selected from the dropdown, use it for all rows
    const targetBranchId = req.body.branch_id;
    
    const checkItem = db.prepare('SELECT id, stock, deleted_at FROM inventory_items WHERE name = ? AND branch_id = ?');
    const updateItem = db.prepare('UPDATE inventory_items SET category = ?, unit = ?, threshold = ?, stock = ?, deleted_at = NULL WHERE id = ?');
    const insertItem = db.prepare('INSERT INTO inventory_items (id, name, category, stock, unit, threshold, branch_id, created_at, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertMovement = db.prepare('INSERT INTO inventory_movements (id, item_id, movement_type, quantity, party_name, reference_code, branch_id, created_at) VALUES (?, ?, \'IN\', ?, \'Initial Stock\', \'BULK-IMPORT\', ?, ?)');
    const insertPriceHistory = db.prepare('INSERT INTO price_history (id, item_id, branch_id, old_unit_price, new_unit_price, quantity_added, total_price_paid, changed_by, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)');
    
    db.transaction(() => {
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        
        const bName = colMap['branch'] ? getVal(row.getCell(colMap['branch'])).trim() : '';
        const iName = colMap['name'] ? getVal(row.getCell(colMap['name'])).trim() : '';
        const cat = colMap['category'] ? getVal(row.getCell(colMap['category'])).trim() : '';
        let unit = colMap['unit'] ? getVal(row.getCell(colMap['unit'])).trim() : 'pcs';
        if (!unit) unit = 'pcs';
        
        let stockRaw = colMap['stock'] ? getVal(row.getCell(colMap['stock'])) : '';
        let stock = Number(stockRaw);
        if (isNaN(stock)) stock = 0;
        
        let thresholdRaw = colMap['threshold'] ? getVal(row.getCell(colMap['threshold'])) : '';
        let threshold = Number(thresholdRaw);
        if (isNaN(threshold)) threshold = 0;
          
          let priceRaw = colMap['price'] ? getVal(row.getCell(colMap['price'])) : '';
          let unitPrice = Number(priceRaw);
          if (isNaN(unitPrice)) unitPrice = 0;
        
        let branchId = targetBranchId;
          
          if (req.user.role !== 'Admin' && req.user.role !== 'admin') {
            branchId = req.user.branch_id;
          } else if (!branchId) {
            if (!bName) {
              errors.push(`Row ${rowNumber}: Missing Branch Name`);
              return;
            }
            branchId = branchMap[bName.toLowerCase()];
            if (!branchId) {
              errors.push(`Row ${rowNumber}: Branch '${bName}' not found`);
              return;
            }
          }
        
        // Auth check removed because staff branches are auto-assigned above.
        
        if (!iName) {
          errors.push(`Row ${rowNumber}: Missing Item Name`);
          return;
        }
        
        const existing = checkItem.get(iName, branchId);
        if (existing) {
          updateItem.run(cat || null, unit, threshold, stock, existing.id);
          updated++;
        } else {
          const newId = generateUUID();
          const nowStr = new Date().toISOString();
          insertItem.run(newId, iName, cat || null, stock, unit, threshold, branchId, nowStr, unitPrice);
            insertPriceHistory.run(generateUUID(), newId, branchId, unitPrice, stock, stock * unitPrice, req.user.id, nowStr);
          if (stock > 0) {
            insertMovement.run(generateUUID(), newId, stock, branchId, nowStr);
          }
          added++;
        }
      });
    })();
    
    res.json({ added, updated, errors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process file: ' + error.message });
  }
});

module.exports = router;
