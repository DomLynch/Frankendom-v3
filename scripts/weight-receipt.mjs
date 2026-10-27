// Cold first-visit weight at 375x812: wire (encodedDataLength) and raw (decoded dataLength) bytes per request, via CDP.
//   node scripts/weight-receipt.mjs <url> <out.json>      (e.g. https://v3.frankendom.com/ docs/V3-WEIGHT-RECEIPT-<date>.json)
// Cache off, fresh context; waits for STRIKE enabled (#attack-button aria-disabled=false), then 3 s more. On a Mac it uses Metal, elsewhere SwiftShader.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node scripts/weight-receipt.mjs <url> <out.json>'); process.exit(2); }
const browser = await chromium.launch({ args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const req = new Map();
cdp.on('Network.requestWillBeSent', (e) => req.set(e.requestId, { url: e.request.url, raw: 0, wire: 0 }));
cdp.on('Network.responseReceived', (e) => { const r = req.get(e.requestId); if (r) { r.status = e.response.status; r.enc = e.response.headers['content-encoding'] ?? e.response.headers['Content-Encoding'] ?? 'none'; r.cache = e.response.headers['cache-control'] ?? e.response.headers['Cache-Control'] ?? ''; r.type = e.response.mimeType; } });
cdp.on('Network.dataReceived', (e) => { const r = req.get(e.requestId); if (r) r.raw += e.dataLength; });
cdp.on('Network.loadingFinished', (e) => { const r = req.get(e.requestId); if (r) r.wire = e.encodedDataLength; });
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000, polling: 'raf' });
const playableMs = Date.now() - t0;
await page.waitForTimeout(3000);
const rows = [...req.values()].filter((r) => r.url.startsWith('http')).sort((a, b) => b.wire - a.wire);
const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
writeFileSync(out, JSON.stringify({ url, playableMs, files: rows.length, wire: sum('wire'), raw: sum('raw'), rows }, null, 1));
// The target is a data row (data/build.json firstVisitBytes; COO ruling 2026-10-27: 5.5 MB for the alpha), not a literal here.
const target = JSON.parse(readFileSync(new URL('../data/build.json', import.meta.url), 'utf8')).firstVisitBytes;
console.log(JSON.stringify({ playableMs, files: rows.length, wire: sum('wire'), raw: sum('raw'), firstVisitBytes: target, underTarget: sum('wire') <= target }));
await browser.close();
if (sum('wire') > target) process.exitCode = 1;
