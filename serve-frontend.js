// serve-frontend.js - dependency-free static server for the ICU dashboard
// Usage: node serve-frontend.js [rootDir] [port]
// Run under pm2:  pm2 start serve-frontend.js --name icu-frontend
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, 'frontend-build'));
const PORT = parseInt(process.argv[3] || '3000', 10);
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8'
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function serve(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 500, 'Error reading ' + path.basename(filePath) + ': ' + err.code);
    send(res, 200, data, TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad request');
  }

  const index = path.join(ROOT, 'index.html');
  if (urlPath === '/' || urlPath === '') return serve(res, index);

  const filePath = path.resolve(path.join(ROOT, urlPath));

  // keep requests inside ROOT (works on Windows and Linux)
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return send(res, 403, '403 Forbidden');

  fs.stat(filePath, (err, stats) => {
    if (err || stats.isDirectory()) return serve(res, index); // SPA fallback
    serve(res, filePath);
  });
}).listen(PORT, HOST, () => {
  console.log('Serving ' + ROOT + ' on http://' + HOST + ':' + PORT);
});
