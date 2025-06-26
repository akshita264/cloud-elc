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
        const folderName = today.toISOString().split('T')[0]; // YYYY-MM-DD
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
// Serve files from the 'uploads' directory, allowing access to subdirectories
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
    // req.file contains information about the uploaded file, including its path
    if (req.file) {
        console.log('✅ Uploaded:', req.file.path); // Log the full path where Multer saved it
        res.status(200).send('File uploaded successfully!');
    } else {
        res.status(400).send('No file uploaded or an error occurred.');
    }
});

// Helper function to recursively get all file paths
const getAllFiles = (dir, filesList = []) => {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            getAllFiles(filePath, filesList); // Recurse into subdirectories
        } else {
            // Add the path relative to the base 'uploads' directory
            // IMPORTANT: Replace backslashes with forward slashes for consistent URL paths
            const relativePath = path.relative(uploadDir, filePath);
            filesList.push(relativePath.replace(/\\/g, '/'));
        }
    });
    return filesList;
};

app.get('/files', isAuthenticated, (req, res) => {
    try {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true }); // Ensure uploads directory exists
        }
        const files = getAllFiles(uploadDir);
        res.json(files);
    } catch (err) {
        console.error('Error reading files:', err);
        res.status(500).send('Error reading files');
    }
});

// This route will now handle full file paths including subdirectories
app.get('/download/:filepath(*)', isAuthenticated, (req, res) => {
    // The '(*)' wildcard captures the entire path including slashes
    const filePath = path.join(uploadDir, req.params.filepath);
    
    // Ensure the file exists and is within the uploads directory for security
    // Use path.normalize to handle cases where '../' might be present in filepath
    const normalizedFilePath = path.normalize(filePath);
    if (!fs.existsSync(normalizedFilePath) || !normalizedFilePath.startsWith(uploadDir)) {
        return res.status(404).send('File not found or unauthorized access attempt.');
    }

    res.download(normalizedFilePath, (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.error(`File not found for download: ${normalizedFilePath}`);
                return res.status(404).send('File not found.');
            }
            console.error('Error during file download:', err);
            res.status(500).send('Error downloading file.');
        }
    });
});

app.get('/', isAuthenticated, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 MyCloud running at http://localhost:${PORT}`);
});



  

 


