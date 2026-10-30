// The one Playwright preamble the stills / real-input / check scripts share (audit 12). Nothing here changes what a script measures: it is the launch flags, the phone context, the "fight is playable" wait,
// page-error collection and a static server for a built dist/, each exactly as the scripts used to spell them out.
//   import { launchBrowser, phoneOptions, waitPlayable, collectErrors, serveDist, launchGame } from './lib/browser.mjs';
// env read here: CHROME (a chromium binary), GL_ARGS (replaces the GL flags, e.g. the T4's Vulkan flags; only when glArgsEnv is set).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.txt': 'text/plain', '.css': 'text/css' };

// The GL flags: ANGLE on Metal on a Mac, SwiftShader elsewhere. angle: 'auto' | 'metal' | 'swiftshader'.
export function glArgs({ angle = 'auto', extra = [] } = {}) {
  const a = angle === 'auto' ? (process.platform === 'darwin' ? 'metal' : 'swiftshader') : angle;
  return ['--use-gl=angle', `--use-angle=${a}`, '--ignore-gpu-blocklist', ...extra];
}

// chromium.launch with those flags. chrome: the binary (default process.env.CHROME; chromeEnv names another variable, or null to ignore the environment). glArgsEnv: GL_ARGS, when set, replaces the flags.
export async function launchBrowser({ angle = 'auto', extra = [], chrome, chromeEnv = 'CHROME', glArgsEnv = false } = {}) {
  const { chromium } = await import('playwright');
  const executablePath = chrome ?? (chromeEnv ? process.env[chromeEnv] || undefined : undefined);
  const args = glArgsEnv && process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : glArgs({ angle, extra });
  return chromium.launch({ executablePath, args });
}

// The phone context options: 375x812, touch, a device scale factor (omitted when undefined, so Playwright's default 1 stands). Pass to browser.newPage / newContext.
export function phoneOptions(deviceScaleFactor, over = {}) {
  return { viewport: { width: 375, height: 812 }, ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }), isMobile: true, hasTouch: true, ...over };
}

// Resolves when the fight is playable: the ATTACK button is no longer aria-disabled. zone: also wait for window.__v3Zone. polling: 'raf' (software GL starves the default timer).
export function waitPlayable(page, { timeout = 180000, polling, zone = false } = {}) {
  const opts = polling ? { timeout, polling } : { timeout };
  return page.waitForFunction((z) => (!z || globalThis.__v3Zone) && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', zone, opts);
}

// Collects uncaught page errors and console.error lines into the returned array (as 'pageerror <msg>' / 'console <text>'); echo: also print each to stderr.
export function collectErrors(page, { echo = false, label = '' } = {}) {
  const errors = [], pre = label ? `${label}: ` : '';
  const add = (line) => { errors.push(line); if (echo) console.error(`${pre}${line}`); };
  page.on('pageerror', (e) => add(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') add(`console ${m.text()}`); });
  return errors;
}

// Serves a built dist directory: a path with no extension falls back to index.html, a .gz twin goes out gzip-encoded when asked. port 0 = any free port. Returns { url, port, close }.
export async function serveDist(dir, port = 0) {
  const dist = resolve(dir);
  if (!existsSync(join(dist, 'index.html')) || !statSync(dist).isDirectory()) throw new Error(`${dir}: not a built dist (no index.html)`);
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, path.endsWith('/') ? path + 'index.html' : path), body = await readFile(file).catch(() => null);
    if (!body && !extname(path)) { file = join(dist, 'index.html'); body = await readFile(file).catch(() => null); }
    if (!body) { res.writeHead(404); res.end(); return; }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') ? await readFile(file + '.gz').catch(() => null) : null;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gz ?? body);
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(port, '127.0.0.1', ok); });
  const bound = server.address().port;
  return { url: `http://127.0.0.1:${bound}`, port: bound, close: () => new Promise((ok) => { server.close(() => ok()); server.closeAllConnections?.(); }) };
}

// One call for a new script: serve dist (or use url), launch, open a phone page, collect errors. Returns { browser, page, url, errors, close }; the caller navigates and calls waitPlayable.
export async function launchGame({ dist, url, port = 0, viewport, deviceScaleFactor = 2, chrome, angle, extra, echoErrors = false } = {}) {
  if (!dist && !url) throw new Error('launchGame: pass dist or url');
  const server = dist ? await serveDist(dist, port) : null;
  const browser = await launchBrowser({ chrome, angle, extra });
  const page = await browser.newPage(phoneOptions(deviceScaleFactor, viewport ? { viewport } : {}));
  const errors = collectErrors(page, { echo: echoErrors });
  return { browser, page, url: server?.url ?? url, errors, close: async () => { await browser.close().catch(() => {}); await server?.close(); } };
}
