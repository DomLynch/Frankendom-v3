// The telemetry collector (Dom 2026-10-28): POST <path> with { v:1, id, sid, sha, events:[...] } from src/telemetry.ts; every event is re-validated against data/telemetry.json and appended as one JSON line to a size-capped, rotating log.
// Node built-ins only. Bound to loopback; nginx proxies the same-origin path to it (deploy/telemetry/). It never reads or stores an address: the per-id limits below are keyed by the page's random id, and the per-address limit is nginx's (limit_req).
// Limits (all rows): body bytes, events and requests per id per minute, events per minute for the whole service, ids tracked, and the log (maxFileBytes per file x keepFiles files = the disk ceiling).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TELEMETRY, cleanEnvelope, type TelemetryDefs } from '../../src/telemetry-rows.ts';

export type CollectorOptions = { defs?: TelemetryDefs; dir?: string; now?: () => number };

/** A size-capped rotating JSONL log: telemetry.jsonl, then .1 (newest old) to .<keepFiles-1>; the oldest is deleted on rotation. Disk use never exceeds maxFileBytes x keepFiles (+ one line). */
export function createLog(dir: string, name: string, maxFileBytes: number, keepFiles: number) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name), size = () => (existsSync(file) ? statSync(file).size : 0);
  let bytes = size();
  function rotate() {
    rmSync(`${file}.${keepFiles - 1}`, { force: true });
    for (let i = keepFiles - 2; i >= 1; i--) if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
    if (keepFiles > 1 && existsSync(file)) renameSync(file, `${file}.1`); else rmSync(file, { force: true });
    bytes = 0;
  }
  return {
    file,
    append(lines: string[]) {
      const text = lines.map((l) => `${l}\n`).join(''), n = Buffer.byteLength(text);
      if (bytes > 0 && bytes + n > maxFileBytes) rotate();
      appendFileSync(file, text);
      bytes += n;
    },
  };
}

export function createCollector(opts: CollectorOptions = {}) {
  const defs = opts.defs ?? TELEMETRY, S = defs.server, now = opts.now ?? Date.now;
  const log = createLog(opts.dir ?? process.env.TELEMETRY_DIR ?? S.logDir, S.logName, S.maxFileBytes, S.keepFiles);
  type Bucket = { start: number; events: number; requests: number };
  const ids = new Map<string, Bucket>();
  let globalStart = 0, globalEvents = 0;
  const stats = { accepted: 0, events: 0, rejected: 0, limited: 0 };

  /** Per-id and global budgets for one request of `n` events; false = over a limit. */
  function allow(id: string, n: number): boolean {
    const t = now();
    if (t - globalStart >= 60_000) { globalStart = t; globalEvents = 0; }
    if (globalEvents + n > S.globalEventsPerMinute) return false;
    let b = ids.get(id);
    if (!b || t - b.start >= 60_000) {
      if (!b && ids.size >= S.maxTrackedIds) {   // full: forget the stale ones; if still full the request is refused (a flood of fresh ids cannot grow memory)
        for (const [k, v] of ids) if (t - v.start >= 60_000) ids.delete(k);
        if (ids.size >= S.maxTrackedIds) return false;
      }
      b = { start: t, events: 0, requests: 0 }; ids.set(id, b);
    }
    if (b.requests + 1 > S.perIdRequestsPerMinute || b.events + n > S.perIdEventsPerMinute) return false;
    b.requests++; b.events += n; globalEvents += n;
    return true;
  }

  /** Handle one body string: returns the HTTP status. Pure of sockets so the tests call it directly. */
  function accept(body: string): 204 | 400 | 429 {
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { stats.rejected++; return 400; }
    const env = cleanEnvelope(raw, defs);
    if (!env) { stats.rejected++; return 400; }
    if (!allow(env.id, env.events.length)) { stats.limited++; return 429; }
    const t = now();
    log.append(env.events.map((e) => JSON.stringify({ t, id: env.id, sid: env.sid, sha: env.sha, ...e })));
    stats.accepted++; stats.events += env.events.length;
    return 204;
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    const end = (code: number, extra: Record<string, string> = {}) => { res.writeHead(code, { 'cache-control': 'no-store', ...extra }); res.end(code === 200 ? JSON.stringify(stats) : undefined); };
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === `${defs.path}/health`) return end(200, { 'content-type': 'application/json' });
    if (req.method !== 'POST' || path !== defs.path) return end(404);
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > defs.caps.maxBodyBytes) { stats.rejected++; req.resume(); return end(413); }
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > defs.caps.maxBodyBytes) { stats.rejected++; end(413, { connection: 'close' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!res.headersSent) { try { end(accept(Buffer.concat(chunks).toString('utf8'))); } catch { end(500); } } });
    req.on('error', () => { /* a dropped client is nothing */ });
  }

  const server: Server = createServer(handle);
  server.headersTimeout = 10_000; server.requestTimeout = 10_000; server.keepAliveTimeout = 5_000;
  return { server, accept, stats, log, close: () => new Promise<void>((r) => server.close(() => r())) };
}
