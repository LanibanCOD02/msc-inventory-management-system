require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// Ensure upload directories exist at the root level of the project
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const uploadDirs = ['uploads/products', 'uploads/bills', 'uploads/invoices'].map(d => path.join(dataDir, d));

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve Static Uploads
app.use('/uploads', express.static(path.join(dataDir, 'uploads')));

// Import Routes
const authRoutes = require('./routes/auth');
const entitiesRoutes = require('./routes/entities');
const uploadsRoutes = require('./routes/uploads');
const inventoryRoutes = require('./routes/inventory');
const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const movementsRoutes = require('./routes/movements');
const branchesRoutes = require('./routes/branches');

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api', entitiesRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/movements', movementsRoutes);
app.use('/api/branches', branchesRoutes);

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../frontend')));

// 404 Catch-all for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
