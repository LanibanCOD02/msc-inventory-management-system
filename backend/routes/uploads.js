const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middlewares/auth');

// Setup multer to store files in memory temporarily
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/uploads
// Accepts multiple files from specific fields
const cpUpload = upload.fields([
  { name: 'productPhoto', maxCount: 1 },
  { name: 'invoiceCopy', maxCount: 1 }
]);

router.post('/', authenticateToken, cpUpload, async (req, res) => {
  try {
    const uploadedUrls = {};
    const files = req.files || {};
    // Fix: Go up two directories from routes/ to reach the project root
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
    
    if (req.files.productPhoto) {
        const file = req.files.productPhoto[0];
        const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.webp';
        const folderName = 'products';
        const filepath = path.join(dataDir, 'uploads', folderName, filename);
        
        await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
        
        await sharp(file.buffer)
          .resize({ width: 800, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(filepath);
        
        uploadedUrls.productPhotoUrl = `/uploads/${folderName}/${filename}`;
      }

      if (req.files.invoiceCopy) {
        const file = req.files.invoiceCopy[0];
        const ext = file.originalname.split('.').pop() || 'pdf';
        const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + ext;
        const folderName = 'invoices';
        const filepath = path.join(dataDir, 'uploads', folderName, filename);
        
        await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
        await fs.promises.writeFile(filepath, file.buffer);
        
        uploadedUrls.invoicePdfUrl = `/uploads/${folderName}/${filename}`;
      }

    res.json(uploadedUrls);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

module.exports = router;
