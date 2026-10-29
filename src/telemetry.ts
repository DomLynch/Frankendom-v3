// Deaths-and-errors telemetry, page side (Dom 2026-10-28). Anonymous, tiny, and unable to hurt the game: every entry point is wrapped so nothing here throws, awaits or blocks a frame.
// Events (data/telemetry.json `events`): session_start / session_end, boss_death, boss_kill, js_error. They queue, flush every `flushMs` with fetch(keepalive) and on hide / pagehide with sendBeacon, to the SAME-ORIGIN `path`
// (nginx proxies it to the collector, deploy/telemetry/). Off (nothing is read, queued or sent) for: ?telemetry=off, Do-Not-Track, localhost / *.localhost / *.test, and any build that is not a deployed sha (the dev build).
// Identity: a random id kept in localStorage (try/catch; in memory when storage is refused) and a random id per visit. No IP, no cookie, no player text. The existing error seam (src/stubs.ts captureException) feeds js_error: reuse, not a second hook.
import { TELEMETRY, cleanEvent, type TelemetryDefs, type TelemetryEvent } from './telemetry-rows.ts';

type TelemetryEnv = {
  search: string; hostname: string; doNotTrack: boolean;
  sha: string | null;   // the deployed build id (null = a dev build: telemetry stays off)
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  /** Hands one JSON body to the network. `final` = the page is going away (use sendBeacon). Must not throw (it is wrapped anyway); a failure is silently dropped. */
  send(url: string, body: string, final: boolean): void;
  now(): number; randomId(): string;
};

/** Why telemetry is off, or null when it is on. Pure: the off switches are all here and test/telemetry.test.mjs pins each one. */
export function offReason(env: Pick<TelemetryEnv, 'search' | 'hostname' | 'doNotTrack' | 'sha'>, defs: TelemetryDefs = TELEMETRY): string | null {
  const o = defs.off, host = env.hostname.toLowerCase();
  let flag: string | null = null;
  try { flag = new URLSearchParams(env.search).get(o.query); } catch { /* an unparsable query is no flag */ }
  if (flag === o.value) return `?${o.query}=${o.value}`;
  if (env.doNotTrack) return 'do-not-track';
  if (!host || o.hosts.includes(host) || o.hostSuffixes.some((s) => host.endsWith(s))) return o.reasons.localHost;
  if (!env.sha || !/^[0-9a-f]{7,40}$/.test(env.sha)) return o.reasons.notDeployed;
  return null;
}

type Telemetry = {
  readonly on: boolean;
  /** Queue one event (cleaned against the table, rate-limited). Never throws. */
  event(name: string, fields?: Record<string, unknown>): void;
  /** An error from window.onerror / unhandledrejection / captureException. Deduped and capped per visit. Never throws. */
  error(kind: 'error' | 'rejection' | 'caught', err: unknown, where?: { src?: string; line?: number; col?: number }): void;
  /** The visit is ending or hidden: queue session_end and send everything now. */
  leave(): void;
  flush(final?: boolean): void;
};

const stripQuery = (s: string): string => s.replace(/[?#][^\s)'"]*/g, '');

export function createTelemetry(env: TelemetryEnv, defs: TelemetryDefs = TELEMETRY): Telemetry {
  const dead: Telemetry = { on: false, event() {}, error() {}, leave() {}, flush() {} };
  let reason: string | null;
  try { reason = offReason(env, defs); } catch { return dead; }
  if (reason !== null) return dead;
  const c = defs.client, started = env.now(), sid = env.randomId();
  let id = '';
  try { id = env.storage?.getItem(c.storageKey) ?? ''; } catch { id = ''; }
  if (!/^[a-z0-9-]{6,40}$/i.test(id)) { id = env.randomId(); try { env.storage?.setItem(c.storageKey, id); } catch { /* storage refused: this visit is its own id */ } }
  let queue: TelemetryEvent[] = [], minute: number[] = [], errors = 0, lastLeave = -1e9;
  const perEvent = new Map<string, number>(), seenErrors = new Set<string>();
  const url = defs.path;

  const flush = (final = false): void => {
    try {
      if (!queue.length) return;
      const batch = queue.splice(0, c.maxBatch);
      const body = JSON.stringify({ v: 1, id, sid, sha: env.sha, events: batch });
      if (body.length > defs.caps.maxBodyBytes) { if (queue.length) flush(final); return; }   // an oversized batch is dropped, never split into surprises
      env.send(url, body, final);
      if (queue.length) flush(final);
    } catch { /* a failing network never reaches the game */ }
  };
  const event = (name: string, fields: Record<string, unknown> = {}): void => {
    try {
      const e = cleanEvent({ ...fields, e: name }, defs);
      if (!e) return;
      const t = env.now();
      minute = minute.filter((x) => t - x < c.rateWindowMs);
      const n = (perEvent.get(name) ?? 0) + 1;
      if (minute.length >= c.maxEventsPerMinute || n > c.maxPerEventPerVisit || queue.length >= c.maxQueue) return;
      perEvent.set(name, n); minute.push(t); queue.push(e);
    } catch { /* never throws */ }
  };
  const error: Telemetry['error'] = (kind, err, where = {}) => {
    try {
      if (errors >= c.maxErrorsPerVisit) return;
      const o = (err && typeof err === 'object' ? err : {}) as { message?: unknown; stack?: unknown };
      const msg = typeof err === 'string' ? err : typeof o.message === 'string' ? o.message : String(err ?? 'error');
      const line = where.line ?? undefined, key = `${kind}|${msg.slice(0, c.dedupeChars)}|${line ?? ''}`;
      if (seenErrors.has(key)) return;
      seenErrors.add(key); errors++;
      event('js_error', { kind, msg: stripQuery(msg), src: where.src ? stripQuery(where.src) : undefined, line, col: where.col, stack: typeof o.stack === 'string' ? stripQuery(o.stack) : undefined });
    } catch { /* never throws */ }
  };
  const leave = (): void => {
    try {
      const t = env.now();
      if (t - lastLeave > 1000) { lastLeave = t; event('session_end', { sec: (t - started) / 1000 }); }
      flush(true);
    } catch { /* never throws */ }
  };
  event('session_start');
  return { on: true, event, error, leave, flush };
}

/** The browser wiring: reads the real page (location, navigator, localStorage, the build sha from the script's own /b/<sha>/ path), installs the error / hide listeners and the flush timer. Returns the same no-op object when off. */
export function startTelemetry(g: typeof globalThis = globalThis, moduleUrl: string = import.meta.url): Telemetry {
  try {
    const loc = g.location, nav = g.navigator as Navigator & { msDoNotTrack?: string }, sha = /\/b\/([0-9a-f]{7,40})\//.exec(moduleUrl)?.[1] ?? null;
    let storage: TelemetryEnv['storage'] = null;
    try { storage = g.localStorage ?? null; } catch { storage = null; }
    const dnt = [nav?.doNotTrack, (g as { doNotTrack?: string }).doNotTrack, nav?.msDoNotTrack].some((v) => v === '1' || v === 'yes');
    const t = createTelemetry({
      search: loc?.search ?? '', hostname: loc?.hostname ?? '', doNotTrack: dnt, sha, storage,
      now: () => Date.now(),
      randomId: () => (g.crypto?.randomUUID ? g.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`),
      send: (url, body, final) => {
        if (final && typeof nav?.sendBeacon === 'function' && nav.sendBeacon(url, body)) return;
        if (typeof g.fetch === 'function') g.fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => {});
      },
    });
    if (!t.on) return t;
    g.addEventListener('error', (ev) => { const e = ev as ErrorEvent; t.error('error', e.error ?? e.message, { src: e.filename, line: e.lineno, col: e.colno }); });
    g.addEventListener('unhandledrejection', (ev) => { t.error('rejection', (ev as PromiseRejectionEvent).reason); });
    g.document?.addEventListener('visibilitychange', () => { if (g.document.visibilityState === 'hidden') t.leave(); });
    g.addEventListener('pagehide', () => t.leave());
    g.setInterval(() => t.flush(false), TELEMETRY.client.flushMs);
    return t;
  } catch {
    return { on: false, event() {}, error() {}, leave() {}, flush() {} };
  }
}
