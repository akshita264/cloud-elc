const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Multer storage config
const uploadDir = path.join(__dirname, 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date();
    const folderName = today.toISOString().split('T')[0]; // yyyy-mm-dd
    const fullPath = path.join(__dirname, 'uploads', folderName);

    // Create folder if it doesn't exist
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
    const fullPath = path.join(__dirname, 'uploads', folderName);

    while (fs.existsSync(path.join(fullPath, filename))) {
      filename = `${base}(${counter})${ext}`;
      counter++;
    }

    cb(null, filename);
  }
});

const upload = multer({ storage });

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'mycloudsecret',
  resave: false,
  saveUninitialized: true
}));

// Auth check
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login.html');
}

// Routes
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json'));
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = user;
    res.redirect('/');
  } else {
    res.send('Invalid credentials');
  }
});

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

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

app.post('/upload', isAuthenticated, upload.single('file'), (req, res) => {
  console.log('✅ Uploaded:', req.file.originalname);
  res.redirect('/');
});

app.get('/files', isAuthenticated, (req, res) => {
  fs.readdir(path.join(__dirname, 'uploads'), (err, files) => {
    if (err) return res.status(500).send('Error reading files');
    res.json(files);
  });
});

app.get('/download/:filename', isAuthenticated, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.download(filePath);
});

app.get('/', isAuthenticated, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 MyCloud running at http://localhost:${PORT}`);
});


