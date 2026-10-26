// Serves dist/ for a local look (and for stills): node scripts/serve.mjs [port]. Unknown paths fall back to
// index.html, as the VPS does.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.argv[2]) || 8733;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.txt': 'text/plain', '.css': 'text/css' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, path.endsWith('/') ? path + 'index.html' : path);
  let body = await readFile(file).catch(() => null);
  if (!body) { file = join(dist, 'index.html'); body = await readFile(file); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
}).listen(port, () => console.log(`dist/ on http://localhost:${port}`));
