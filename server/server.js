const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to execute C++ program
async function executeCppProgram(operation, inputFile, outputFile, key) {
  const cppExecutable = path.join(__dirname, '..', 'cpp-backend', 'encryptor');
  
  try {
    const { stdout, stderr } = await execAsync(`"${cppExecutable}" ${operation} "${inputFile}" "${outputFile}" "${key}"`);
    if (stderr) console.error('C++ stderr:', stderr);
    return { success: true, stdout };
  } catch (error) {
    console.error('C++ execution error:', error);
    return { success: false, error: error.message };
  }
}

// Encryption endpoint
app.post('/api/encrypt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.body.key) {
      return res.status(400).json({ error: 'File and key are required' });
    }

    const inputFile = req.file.path;
    const outputFile = `${inputFile}.enc`;
    const key = req.body.key;

    const result = await executeCppProgram('encrypt', inputFile, outputFile, key);
    
    if (!result.success) {
      await fsPromises.unlink(inputFile);
      return res.status(500).json({ error: 'Encryption failed' });
    }

    // Send the encrypted file
    res.download(outputFile, `${req.file.originalname}.enc`, async (err) => {
      // Clean up files after sending
      try {
        await fsPromises.unlink(inputFile);
        await fsPromises.unlink(outputFile);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    });

  } catch (error) {
    console.error('Encryption error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Decryption endpoint
app.post('/api/decrypt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.body.key) {
      return res.status(400).json({ error: 'File and key are required' });
    }

    const inputFile = req.file.path;
    const outputDir = path.join(uploadsDir, 'decrypted');
    const key = req.body.key;

    // Ensure decrypted directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const result = await executeCppProgram('decrypt', inputFile, outputDir, key);
    
    if (!result.success) {
      await fsPromises.unlink(inputFile);
      return res.status(500).json({ error: 'Decryption failed' });
    }

    // Find the decrypted file in the output directory
    const files = await fsPromises.readdir(outputDir);
    const decryptedFile = files.find(f => f.startsWith(path.basename(inputFile)));
    
    if (!decryptedFile) {
      await fsPromises.unlink(inputFile);
      return res.status(500).json({ error: 'Decrypted file not found' });
    }

    const decryptedFilePath = path.join(outputDir, decryptedFile);

    // Send the decrypted file
    res.download(decryptedFilePath, decryptedFile, async (err) => {
      // Clean up files after sending
      try {
        await fsPromises.unlink(inputFile);
        await fsPromises.unlink(decryptedFilePath);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    });

  } catch (error) {
    console.error('Decryption error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 