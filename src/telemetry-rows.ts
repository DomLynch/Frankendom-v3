// The telemetry rows (data/telemetry.json) and the one validator both sides use: the page shapes every event with it before it queues, the collector (server/telemetry/) re-checks every event with it before it writes.
// Pure: no DOM, no node API, so the same file is bundled into the page and run by node. A bad row throws when the file loads (a test loads it).
import DEFS from '../data/telemetry.json' with { type: 'json' };

type FieldType = 'seconds' | 'percent' | 'boss' | 'message' | 'source' | 'stack' | 'int' | 'kind';
export type TelemetryDefs = {
  path: string;
  off: { query: string; value: string; hosts: string[]; hostSuffixes: string[]; reasons: { localHost: string; notDeployed: string } };
  client: { flushMs: number; maxQueue: number; maxBatch: number; maxEventsPerMinute: number; maxErrorsPerVisit: number; maxPerEventPerVisit: number; rateWindowMs: number; dedupeChars: number; storageKey: string };
  caps: { maxBodyBytes: number; maxId: number; maxSha: number; maxMessage: number; maxSource: number; maxStack: number; maxBoss: number; maxSeconds: number };
  server: { host: string; port: number; logDir: string; logName: string; maxFileBytes: number; keepFiles: number; perIdEventsPerMinute: number; perIdRequestsPerMinute: number; globalEventsPerMinute: number; maxTrackedIds: number };
  events: Record<string, { about: string; fields: Record<string, FieldType> }>;
  kinds: string[];
};
export type TelemetryEvent = { e: string } & Record<string, string | number>;

const TYPES: readonly FieldType[] = ['seconds', 'percent', 'boss', 'message', 'source', 'stack', 'int', 'kind'];

/** The loader: every number a positive finite, every event field one of the known types, the path rooted, the port a loopback-style number. Throws a plain message. */
export function loadTelemetry(raw: TelemetryDefs): TelemetryDefs {
  if (typeof raw.path !== 'string' || !/^\/[a-z0-9/_-]+$/i.test(raw.path)) throw Error('telemetry: "path" is a same-origin path like /t');
  for (const [group, o] of [['client', raw.client], ['caps', raw.caps]] as const)
    for (const [k, v] of Object.entries(o)) if (k !== 'storageKey' && !(Number.isFinite(v) && (v as number) > 0)) throw Error(`telemetry: ${group}.${k} needs a value > 0`);
  for (const [k, v] of Object.entries(raw.server)) if (['host', 'logDir', 'logName'].includes(k) ? typeof v !== 'string' || !v : !(Number.isInteger(v) && (v as number) > 0)) throw Error(`telemetry: server.${k} is bad`);
  if (raw.server.port > 65535) throw Error('telemetry: server.port is a TCP port');
  if (!raw.client.storageKey) throw Error('telemetry: client.storageKey is a non-empty string');
  const names = Object.keys(raw.events);
  if (!names.length) throw Error('telemetry: no events');
  for (const n of names) {
    if (!/^[a-z][a-z_]*$/.test(n)) throw Error(`telemetry: event name "${n}" is lower_snake`);
    for (const [f, t] of Object.entries(raw.events[n]!.fields)) if (!TYPES.includes(t) || f === 'e') throw Error(`telemetry: ${n}.${f} has a bad type "${t}"`);
  }
  if (!raw.kinds.length) throw Error('telemetry: kinds is empty');
  return raw;
}
export const TELEMETRY: TelemetryDefs = loadTelemetry(DEFS as TelemetryDefs);

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const text = (v: unknown, max: number, keepNewlines = false): string | null => {
  if (typeof v !== 'string') return null;
  const s = (keepNewlines ? v.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ') : v.replace(CONTROL, ' ')).trim();
  return s.length > max ? s.slice(0, max) : s;
};
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

/** One field, cleaned to its type and cap (null = refused). */
function cleanField(type: FieldType, v: unknown, defs: TelemetryDefs = TELEMETRY): string | number | null {
  const c = defs.caps;
  switch (type) {
    case 'seconds': { const n = num(v, 0, c.maxSeconds); return n === null ? null : Math.round(n * 10) / 10; }
    case 'percent': { const n = num(v, 0, 100); return n === null ? null : Math.round(n); }
    case 'int': { const n = num(v, 0, 10_000_000); return n === null ? null : Math.round(n); }
    case 'boss': { const s = text(v, c.maxBoss); return s && /^[a-z0-9_-]+$/i.test(s) ? s : null; }
    case 'message': return text(v, c.maxMessage);
    case 'source': return text(v, c.maxSource);
    case 'stack': return text(v, c.maxStack, true);
    case 'kind': return typeof v === 'string' && defs.kinds.includes(v) ? v : null;
  }
}

/** A raw event to the shape that is queued and written: only the table's fields, each cleaned; an unknown event name or a missing required (non-text) field is refused (null). Text fields (msg, src, stack) may be absent. */
export function cleanEvent(raw: unknown, defs: TelemetryDefs = TELEMETRY): TelemetryEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, def = typeof o.e === 'string' ? (Object.prototype.hasOwnProperty.call(defs.events, o.e) ? defs.events[o.e] : undefined) : undefined;
  if (!def) return null;
  const out: TelemetryEvent = { e: o.e as string };
  for (const [f, t] of Object.entries(def.fields)) {
    const v = cleanField(t, o[f], defs), optional = t === 'message' || t === 'source' || t === 'stack' || f === 'line' || f === 'col';
    if (v === null || v === '') { if (!optional) return null; continue; }
    out[f] = v;
  }
  return out;
}

/** The envelope the collector accepts: { v: 1, id, sid, sha, events: [...] }. Returns the cleaned envelope or null (a bad id / sid / sha, or no usable event). */
export function cleanEnvelope(raw: unknown, defs: TelemetryDefs = TELEMETRY): { id: string; sid: string; sha: string; events: TelemetryEvent[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, c = defs.caps;
  const tok = (v: unknown, max: number) => (typeof v === 'string' && v.length >= 6 && v.length <= max && /^[a-z0-9-]+$/i.test(v) ? v : null);
  const id = tok(o.id, c.maxId), sid = tok(o.sid, c.maxId), sha = tok(o.sha, c.maxSha);
  if (o.v !== 1 || !id || !sid || !sha || !Array.isArray(o.events)) return null;
  const events = o.events.slice(0, defs.client.maxBatch).map((e) => cleanEvent(e, defs)).filter((e): e is TelemetryEvent => e !== null);
  return events.length ? { id, sid, sha, events } : null;
}
