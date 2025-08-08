// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let filePath = path.join(__dirname, parsedUrl.pathname);

    // Default to index.html for root
    if (filePath === path.join(__dirname, '/')) {
        filePath = path.join(__dirname, 'index.html');
    }

    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        // Handle Brotli files
        if (filePath.endsWith('.br')) {
            res.setHeader('Content-Encoding', 'br');

            // Set content type based on original file
            if (filePath.endsWith('.json.br')) {
                res.setHeader('Content-Type', 'application/json');
            } else if (filePath.endsWith('.js.br')) {
                res.setHeader('Content-Type', 'application/javascript');
            }
        } else {
            // Regular files
            const ext = path.extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
        }

        // CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (streamErr) => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
        });
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log('📁 Serving files with Brotli support');
});