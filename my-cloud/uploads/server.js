const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'mycloudsecret',
  resave: false,
  saveUninitialized: true
}));

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login.html');
}

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
  const users = JSON.parse(fs.readFileSync('users.json'));
  const exists = users.find(u => u.username === username);
  if (exists) {
    res.send('User already exists');
  } else {
    users.push({ username, password });
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    res.redirect('/login.html');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

app.post('/upload', isAuthenticated, upload.single('file'), (req, res) => {
  res.send('File uploaded successfully');
});

app.get('/files', isAuthenticated, (req, res) => {
  fs.readdir('uploads/', (err, files) => {
    if (err) return res.status(500).send('Error reading files');
    res.json(files);
  });
});

app.get('/download/:filename', isAuthenticated, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.download(filePath);
});

app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

