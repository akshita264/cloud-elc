const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const uploadDir = path.join(__dirname, 'uploads');

// === Multer Storage Config ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date();
    const folderName = today.toISOString().split('T')[0];
    const fullPath = path.join(uploadDir, folderName);

    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const originalName = file.originalname;
    const base = path.parse(originalName).name;
    const ext = path.extname(originalName);
    let filename = originalName;
    let counter = 1;

    const today = new Date();
    const folderName = today.toISOString().split('T')[0];
    const fullPath = path.join(uploadDir, folderName);

    while (fs.existsSync(path.join(fullPath, filename))) {
      filename = `${base}(${counter})${ext}`;
      counter++;
    }

    cb(null, filename);
  }
});
const upload = multer({ storage });

// === Middleware ===
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'mycloudsecret',
  resave: false,
  saveUninitialized: true
}));

// === Auth Middleware ===
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login.html');
}

// === Routes ===

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json'));
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = user;
    res.redirect('/dashboard.html');
  } else {
    res.redirect('/invalid_credentials.html');
  }
});

// Register
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  let users = [];

  if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
  }

  const exists = users.find(u => u.username === username);
  if (exists) return res.send('User already exists');

  users.push({ username, password });
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  res.redirect('/login.html');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Upload File (with deduplication)
app.post('/upload', isAuthenticated, upload.single('file'), (req, res) => {
  if (req.file) {
    const uploadedPath = req.file.path;
    const uploadedFileBuffer = fs.readFileSync(uploadedPath);
    const uploadedHash = crypto.createHash('sha256').update(uploadedFileBuffer).digest('hex');

    const allFiles = getAllFiles(uploadDir);

    const filteredFiles = allFiles.filter(file => {
      const fullPath = path.join(uploadDir, file);
      return fullPath !== uploadedPath;
    });

    for (let relPath of filteredFiles) {
      const existingPath = path.join(uploadDir, relPath);
      if (!fs.existsSync(existingPath)) continue;

      const existingBuffer = fs.readFileSync(existingPath);
      const existingHash = crypto.createHash('sha256').update(existingBuffer).digest('hex');

      if (uploadedHash === existingHash) {
        fs.unlinkSync(uploadedPath);
        return res.status(409).send('A file with identical content already exists.');
      }
    }

    console.log('✅ Uploaded:', req.file.path);
    return res.status(200).send('OK');
  } else {
    return res.status(400).send('No file uploaded.');
  }
});

// Recursive file collector
const getAllFiles = (dir, filesList = []) => {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, filesList);
    } else {
      const relativePath = path.relative(uploadDir, filePath).replace(/\\/g, '/');
      filesList.push(relativePath);
    }
  });
  return filesList;
};

// Return files with path + size
app.get('/files', isAuthenticated, (req, res) => {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const files = [];
    const collectFiles = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory()) {
          collectFiles(entryPath);
        } else {
          const relPath = path.relative(uploadDir, entryPath).replace(/\\/g, '/');
          files.push({ path: relPath, size: stat.size });
        }
      }
    };

    collectFiles(uploadDir);
    res.json(files);
  } catch (err) {
    console.error('❌ Error reading files:', err);
    res.status(500).send('Error reading files');
  }
});

// ✅ FIXED: Download file
// ✅ Download file
app.get('/download/:filePath(*)', isAuthenticated, (req, res) => {
  const relativePath = decodeURIComponent(req.params.filePath);
  const filePath = path.join(uploadDir, relativePath);
  const normalizedFilePath = path.normalize(filePath);

  if (!fs.existsSync(normalizedFilePath) || !normalizedFilePath.startsWith(uploadDir)) {
    return res.status(404).send('File not found or unauthorized.');
  }

  res.download(normalizedFilePath, err => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).send('Download error.');
    }
  });
});

// ✅ Delete file
app.delete('/delete/:file(*)', isAuthenticated, (req, res) => {
  const relPath = decodeURIComponent(req.params.file); // fixed here
  const fullPath = path.join(uploadDir, relPath);

  if (!fullPath.startsWith(uploadDir)) {
    return res.status(403).send('Unauthorized file path.');
  }

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    res.sendStatus(200);
  } else {
    res.status(404).send('File not found.');
  }
});

// ✅ Home route (not conflicting)
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 MyCloud running at http://localhost:${PORT}`);
});
