const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { getBranchFilterSql } = require('../config/branchFilter');

// Helper to get branch names map
function getBranchMap() {
  const branches = db.prepare('SELECT id, name FROM branches').all();
  const map = {};
  branches.forEach(b => map[b.id] = b.name);
  return map;
}

// 1. Inventory Summary Excel
router.get('/inventory-summary', authenticateToken, async (req, res) => {
  try {
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    const items = db.prepare(`SELECT * FROM inventory_items WHERE deleted_at IS NULL AND ${condition} ORDER BY name ASC`).all(...params);
    const branchMap = getBranchMap();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MSC Trust Inventory System';
    
    // Group items by branch
    const branchGroups = {};
    let trustWideTotal = 0;
    
    items.forEach(item => {
      const bId = item.branch_id || 'trust_wide';
      if (!branchGroups[bId]) branchGroups[bId] = [];
      branchGroups[bId].push(item);
      trustWideTotal += item.stock;
    });

    const isAllBranches = req.user.role === 'Admin' && (!req.query.branch_id || req.query.branch_id === '');
    
    if (isAllBranches) {
      const summarySheet = workbook.addWorksheet('Trust-Wide Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
      ];
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.addRow({ metric: 'Total Unique Items', value: items.length });
      summarySheet.addRow({ metric: 'Total Combined Stock', value: trustWideTotal });
    }

    if (Object.keys(branchGroups).length === 0) {
      const sheet = workbook.addWorksheet('Inventory Summary');
      sheet.addRow(['No items found.']);
    } else {
      for (const bId of Object.keys(branchGroups)) {
        const branchName = bId === 'trust_wide' ? 'Global Unassigned' : (branchMap[bId] || 'Unknown Branch');
        const safeSheetName = branchName.replace(/[\[\]\/*\?:\\\\]/g, '').substring(0, 31);
        
        const sheet = workbook.addWorksheet(safeSheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = [
          { header: 'Item Name', key: 'name', width: 30 },
          { header: 'Category', key: 'category', width: 20 },
          { header: 'Unit', key: 'unit', width: 15 },
          { header: 'Current Stock', key: 'stock', width: 15 },
          { header: 'Threshold', key: 'threshold', width: 15 },
          { header: 'Date Added', key: 'created_at', width: 20 }
        ];
        sheet.getRow(1).font = { bold: true };
        
        branchGroups[bId].forEach(i => {
          sheet.addRow({
            name: i.name,
            category: i.category || '-',
            unit: i.unit || '-',
            stock: i.stock,
            threshold: i.threshold,
            created_at: i.created_at ? i.created_at.split('T')[0] : '-'
          });
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Inventory_Summary_${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Low Stock Report Excel
router.get('/low-stock', authenticateToken, async (req, res) => {
  try {
    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    const items = db.prepare(`SELECT * FROM inventory_items WHERE deleted_at IS NULL AND stock <= threshold AND ${condition} ORDER BY name ASC`).all(...params);
    const branchMap = getBranchMap();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MSC Trust Inventory System';

    if (items.length === 0) {
      const sheet = workbook.addWorksheet('Low Stock Report');
      sheet.addRow(['No items currently below threshold']);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Low_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    const branchGroups = {};
    items.forEach(item => {
      const bId = item.branch_id || 'trust_wide';
      if (!branchGroups[bId]) branchGroups[bId] = [];
      branchGroups[bId].push(item);
    });

    for (const bId of Object.keys(branchGroups)) {
      const branchName = bId === 'trust_wide' ? 'Global Unassigned' : (branchMap[bId] || 'Unknown Branch');
      const safeSheetName = branchName.replace(/[\[\]\/*\?:\\\\]/g, '').substring(0, 31);
      
      const sheet = workbook.addWorksheet(safeSheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [
        { header: 'Item Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Current Stock', key: 'stock', width: 15 },
        { header: 'Threshold', key: 'threshold', width: 15 },
        { header: 'Shortage', key: 'shortage', width: 15 }
      ];
      sheet.getRow(1).font = { bold: true };
      
      branchGroups[bId]
        .sort((a, b) => (b.threshold - b.stock) - (a.threshold - a.stock))
        .forEach(i => {
          sheet.addRow({
            name: i.name,
            category: i.category || '-',
            stock: i.stock,
            threshold: i.threshold,
            shortage: i.threshold - i.stock
          });
        });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Low_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Movement History Excel
router.get('/movements', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: "Month and year required" });

    // JS Date month is 0-indexed, but query string comes as 1-12
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString(); // first day of next month

    const { condition, params } = getBranchFilterSql(req.user, req.query.branch_id);
    
    // 1. Get all items matching branch (including deleted, for historical context)
    const items = db.prepare(`
      SELECT id, name, branch_id, stock, default_supplier 
      FROM inventory_items 
      WHERE ${condition}
    `).all(...params);

    const itemMap = {};
    items.forEach(i => {
      itemMap[i.id] = {
        ...i,
        in_month: 0,
        out_month: 0,
        parties: new Set(),
        stock_end_of_month: i.stock // adjust backward below
      };
    });

    // 2. Adjust stock backward for movements AFTER the selected month
    const movementsAfter = db.prepare(`
      SELECT item_id, movement_type, quantity 
      FROM inventory_movements 
      WHERE created_at >= ? 
      AND (voided IS NULL OR voided = 0)
      AND reference_code NOT LIKE 'VOID-%'
      AND ${condition.replace(/branch_id/g, 'branch_id')}
    `).all(endDate, ...params);

    movementsAfter.forEach(m => {
      if (itemMap[m.item_id]) {
        if (m.movement_type === 'IN') {
          itemMap[m.item_id].stock_end_of_month -= m.quantity;
        } else if (m.movement_type === 'OUT') {
          itemMap[m.item_id].stock_end_of_month += m.quantity;
        }
      }
    });

    // 3. Accumulate movements DURING the selected month
    const movementsDuring = db.prepare(`
      SELECT m.item_id, m.movement_type, m.quantity, m.party_name, m.created_at, m.recipient_name, u.username as recorded_by 
      FROM inventory_movements m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.created_at >= ? AND m.created_at < ? 
      AND (m.voided IS NULL OR m.voided = 0)
      AND m.reference_code NOT LIKE 'VOID-%'
      AND ${condition.replace(/branch_id/g, 'm.branch_id')}
      ORDER BY m.created_at ASC
    `).all(startDate, endDate, ...params);

    const detailedMovementsByBranch = {};

    movementsDuring.forEach(m => {
      if (itemMap[m.item_id]) {
        if (m.movement_type === 'IN') itemMap[m.item_id].in_month += m.quantity;
        if (m.movement_type === 'OUT') itemMap[m.item_id].out_month += m.quantity;
        if (m.party_name && m.party_name.trim()) itemMap[m.item_id].parties.add(m.party_name.trim());
        
        const bId = itemMap[m.item_id].branch_id || 'trust_wide';
        if (!detailedMovementsByBranch[bId]) detailedMovementsByBranch[bId] = [];
        detailedMovementsByBranch[bId].push({
          ...m,
          item_name: itemMap[m.item_id].name
        });
      }
    });

    const branchMap = getBranchMap();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MSC Trust Inventory System';

    const branchGroups = {};
    let totalIn = 0;
    let totalOut = 0;
    let totalStock = 0;

    Object.values(itemMap).forEach(item => {
      // Only include items that have movement this month OR have some stock
      if (item.in_month > 0 || item.out_month > 0 || item.stock_end_of_month > 0) {
        const bId = item.branch_id || 'trust_wide';
        if (!branchGroups[bId]) branchGroups[bId] = [];
        branchGroups[bId].push(item);
        
        totalIn += item.in_month;
        totalOut += item.out_month;
        totalStock += item.stock_end_of_month;
      }
    });

    const isAllBranches = req.user.role === 'Admin' && (!req.query.branch_id || req.query.branch_id === '');
    
    if (isAllBranches) {
      const summarySheet = workbook.addWorksheet('Trust-Wide Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 35 },
        { header: 'Value', key: 'value', width: 20 }
      ];
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.addRow({ metric: 'Total Stock IN (This Month)', value: totalIn });
      summarySheet.addRow({ metric: 'Total Stock OUT (This Month)', value: totalOut });
      summarySheet.addRow({ metric: 'Total Current Stock (End of Month)', value: totalStock });
    }

    if (Object.keys(branchGroups).length === 0) {
      const sheet = workbook.addWorksheet('Movement History');
      sheet.addRow(['No items or movements found for this period.']);
    } else {
      for (const bId of Object.keys(branchGroups)) {
        const branchName = bId === 'trust_wide' ? 'Global Unassigned' : (branchMap[bId] || 'Unknown Branch');
        const safeSheetName = branchName.replace(/[\[\]\/*\?:\\\\]/g, '').substring(0, 31);
        
        const sheet = workbook.addWorksheet(safeSheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = [
          { header: 'Item Name', key: 'name', width: 30 },
          { header: 'Quantity IN this month', key: 'in', width: 25 },
          { header: 'Quantity OUT this month', key: 'out', width: 25 },
          { header: 'Supplier/Party Name', key: 'party', width: 35 },
          { header: 'Current Stock', key: 'stock', width: 20 }
        ];
        sheet.getRow(1).font = { bold: true };
        
        branchGroups[bId].sort((a,b) => a.name.localeCompare(b.name)).forEach(i => {
          let parties = Array.from(i.parties).join(', ');
          if (!parties && i.default_supplier) parties = `${i.default_supplier} (Default)`;

          sheet.addRow({
            name: i.name,
            in: i.in_month,
            out: i.out_month,
            party: parties || '-',
            stock: i.stock_end_of_month
          });
        });

        // Add the Detailed Log sheet for this branch
        const detailSheetName = `Log - ${safeSheetName}`.substring(0, 31);
        const detailSheet = workbook.addWorksheet(detailSheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
        detailSheet.columns = [
          { header: 'Date', key: 'date', width: 20 },
          { header: 'Item Name', key: 'name', width: 30 },
          { header: 'Movement Type', key: 'type', width: 15 },
          { header: 'Quantity', key: 'quantity', width: 15 },
          { header: 'Supplier/Party Name', key: 'party', width: 30 },
          { header: 'Recipient', key: 'recipient', width: 25 },
          { header: 'Recorded By', key: 'recorded_by', width: 20 }
        ];
        detailSheet.getRow(1).font = { bold: true };

        const branchDetails = detailedMovementsByBranch[bId] || [];
        if (branchDetails.length === 0) {
          detailSheet.addRow(['No movements recorded this month.']);
        } else {
          branchDetails.forEach(m => {
            detailSheet.addRow({
              date: m.created_at ? m.created_at.split('T')[0] : '-',
              name: m.item_name,
              type: m.movement_type,
              quantity: m.quantity,
              party: m.party_name || '-',
              recipient: m.recipient_name || '-',
              recorded_by: m.recorded_by || '-'
            });
          });
        }
      }
    }

    // === Add Resale Log Sheet ===
    const resaleSheet = workbook.addWorksheet('Resale Log');
    resaleSheet.columns = [
      { header: 'Date Approved', key: 'date_approved', width: 20 },
      { header: 'Branch', key: 'branch', width: 25 },
      { header: 'Item Name', key: 'item_name', width: 30 },
      { header: 'Quantity', key: 'quantity', width: 15 },
      { header: 'Resale Price (₹)', key: 'price', width: 20 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Approved By', key: 'approved_by', width: 20 }
    ];
    resaleSheet.getRow(1).font = { bold: true };

    const resales = db.prepare(`
      SELECT dr.reviewed_at, b.name as branch_name, i.name as item_name, dr.quantity, dr.resale_price, dr.reason_details, u.username as approved_by_name
      FROM deletion_requests dr
      JOIN inventory_items i ON dr.item_id = i.id
      JOIN branches b ON dr.branch_id = b.id
      LEFT JOIN users u ON dr.reviewed_by = u.id
      WHERE dr.reason = 'resale' AND dr.status = 'approved'
      AND dr.reviewed_at >= ? AND dr.reviewed_at < ?
      AND ${condition.replace(/branch_id/g, 'dr.branch_id')}
      ORDER BY dr.reviewed_at ASC
    `).all(startDate, endDate, ...params);

    if (resales.length === 0) {
      resaleSheet.addRow(['No resales recorded this month.']);
    } else {
      let totalResalePrice = 0;
      resales.forEach(r => {
        totalResalePrice += (r.resale_price || 0);
        resaleSheet.addRow({
          date_approved: r.reviewed_at ? r.reviewed_at.split('T')[0] : '-',
          branch: r.branch_name,
          item_name: r.item_name,
          quantity: r.quantity || 'All',
          price: r.resale_price || 0,
          notes: r.reason_details || '-',
          approved_by: r.approved_by_name || '-'
        });
      });
      resaleSheet.addRow({}); // Empty row
      const totalRow = resaleSheet.addRow({
        item_name: 'TOTAL RESALE INCOME:',
        price: totalResalePrice
      });
      totalRow.font = { bold: true };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Movement_History_${year}_${month}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Backup Data
router.get('/backup-zip', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();

    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
    
    // Append database file
    const dbPath = path.join(dataDir, 'database.db');
    if (fs.existsSync(dbPath)) {
      zip.addLocalFile(dbPath);
    }

    // Append uploads directory
    const uploadsPath = path.join(dataDir, 'uploads');
    if (fs.existsSync(uploadsPath)) {
      zip.addLocalFolder(uploadsPath, 'uploads');
    }

    const zipBuffer = zip.toBuffer();
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="msc-backup-${Date.now()}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
