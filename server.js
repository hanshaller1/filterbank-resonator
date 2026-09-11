const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT) || 5173;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer((request, response) => {
  let requestedPath;
  try { requestedPath = decodeURIComponent(request.url.split('?')[0]); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
  const filePath = path.resolve(root, `.${relativePath}`);

  if (!filePath.startsWith(root + path.sep) || relativePath.split('/').some(part => part.startsWith('.'))) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Internal server error');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Syntakt Low-Pass läuft auf http://localhost:${port}`);
});
