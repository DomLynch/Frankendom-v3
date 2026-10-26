// Serves dist/ for a local look (and for stills): node scripts/serve.mjs [port]. A path with no extension falls back to index.html, as the
// VPS does; a missing file is a 404, so a missing asset shows. Page weight: GET /__reset before a load, GET /__bytes after it (bytes and
// files served since, per kind).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.argv[2]) || 8733;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.txt': 'text/plain', '.css': 'text/css' };
let served = {};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/__reset') { served = {}; res.end('reset'); return; }
  if (path === '/__bytes') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(served)); return; }
  let file = join(dist, path.endsWith('/') ? path + 'index.html' : path);
  let body = await readFile(file).catch(() => null);
  if (!body && !extname(path)) { file = join(dist, 'index.html'); body = await readFile(file); }
  if (!body) { res.writeHead(404); res.end(); return; }
  const kind = extname(file) || 'other', row = (served[kind] ??= { files: 0, bytes: 0 });
  row.files++; row.bytes += body.length;
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
}).listen(port, () => console.log(`dist/ on http://localhost:${port}`));
