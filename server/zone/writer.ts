// The zone writer, PROOF slice (docs/PRESENCE-PROOF.md): the five routes of docs/ZONE-CLIENT-CONTRACT.md over src/server-model/zone-model.ts (the executable twin of the SQL the zone-sql CI job runs),
// held in memory. One shared bar per (spawn, shard), damage-share credit settled in the hit that kills. NOT the production writer: no database credential, no real accounts (the account is a random
// cookie minted here), and the page-supplied layer is trusted. Those are the open decisions listed in the PR. Loopback bind; a reverse proxy would sit in front of anything public.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseRules, newWorld, engage, touch, hitBatch, killReport, view, ModelError, type World, type Credit } from '../../src/server-model/zone-model.ts';

const read = (name: string): any => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
export const WRITER = JSON.parse(readFileSync(new URL('./writer-rows.json', import.meta.url), 'utf8'));   // not under data/: the build ships data/*.json, and this proof must add nothing to dist/
export const SERVER_RULES = parseRules(read('zone-server-rules.json'));
const HTTP_OK = 200, HTTP_BAD_REQUEST = 400, HTTP_NOT_FOUND = 404, HTTP_INTERNAL = 500;   // HTTP's own status codes, not tuning

export type Writer = { server: Server; world: World; port: () => number; credits: () => Credit[]; stats: () => Record<string, number> };
export type WriterOptions = { now?: () => number; rules?: typeof SERVER_RULES };

const b64url = (n: number): string => randomBytes(n).toString('base64url');
const iso = (x: unknown): unknown => (typeof x === 'number' ? new Date(x).toISOString() : x);
/** The model says expiresAtMs / respawnAtMs; the wire says expiresAt / respawnAt (ISO strings). */
const toWire = (o: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k.endsWith('Ms') ? k.slice(0, -2) : k] = k.endsWith('Ms') ? iso(v) : v;
  return out;
};

/** kind, max hp and respawn seconds of an instance key `z<id>:<spawn id>`: kind and respawn from the zone row, max hp from the writer rows; null when the key names no spawn we know. */
export function spawnFor(instance: string): { kind: string; maxHp: number; respawnS: number } | null {
  const m = /^z([0-9]+):(.+)$/.exec(instance);
  if (!m) return null;
  let zone: any; try { zone = read(`zones/zone${m[1]}.row.json`); } catch { return null; }
  const sp = (zone.spawns as any[]).find((s) => s.id === m[2]);
  const maxHp = sp ? WRITER.maxHp[sp.kind] : undefined;
  return sp && typeof maxHp === 'number' ? { kind: sp.kind, maxHp, respawnS: sp.respawnSeconds } : null;
}

export function createWriter(opts: WriterOptions = {}): Writer {
  const now = opts.now ?? Date.now, rules = opts.rules ?? SERVER_RULES, world = newWorld(rules);
  const stats = { requests: 0, engaged: 0, batches: 0, kills: 0, refusedBodies: 0, errors: 0 };
  const refusalStatus = (id: string): number => rules.refusals.find((r) => r.id === id)!.status;
  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
  const readBody = (req: IncomingMessage): Promise<any> => new Promise((ok, no) => {
    let n = 0; const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => { n += c.length; if (n > WRITER.maxBodyBytes) { no(new ModelError('O0002', 'body too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { no(new ModelError('O0002', 'body: not json')); } });
    req.on('error', () => no(new ModelError('O0002', 'body')));
  });
  const answer = (res: ServerResponse, out: Record<string, unknown>, headers: Record<string, string>): void => {
    if (typeof out.refused === 'string') { stats.refusedBodies++; return send(res, refusalStatus(out.refused), toWire(out), headers); }
    send(res, HTTP_OK, toWire(out), headers);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://writer'), route = url.pathname.startsWith(WRITER.path) ? url.pathname.slice(WRITER.path.length) : null;
    if (req.method === 'GET' && route === '/health') return send(res, HTTP_OK, { ...stats, spawns: world.spawns.size, credits: world.credits.length });
    if (req.method !== 'POST' || route === null) return send(res, HTTP_NOT_FOUND, { error: 'not-found' });
    stats.requests++;
    // The account: the cookie we minted, else a new one (set on the answer). Proof only.
    const cookies = Object.fromEntries(String(req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
    let account = cookies[WRITER.account.cookie];
    const headers: Record<string, string> = {};
    if (!account || !/^[A-Za-z0-9_-]{16,64}$/.test(account)) { account = b64url(WRITER.account.bytes); headers['set-cookie'] = `${WRITER.account.cookie}=${account}; Path=${WRITER.path}; HttpOnly; SameSite=Lax`; }
    const t = now();
    try {
      const q = await readBody(req);
      if (route === '/engage') {
        const sp = spawnFor(String(q.instance));
        if (!sp) return answer(res, { refused: 'mismatch' }, headers);
        const out = engage(world, { account, character: WRITER.character, token: b64url(rules.engage.tokenBytes), instance: q.instance, layer: Number(q.layer), kind: sp.kind, maxHp: sp.maxHp, respawnS: sp.respawnS }, t);
        if (typeof out.token === 'string') stats.engaged++;
        return answer(res, out, headers);
      }
      if (route === '/touch') return answer(res, touch(world, account, String(q.token), t), headers);
      if (route === '/kill') return answer(res, killReport(world, account, String(q.token), t), headers);
      if (route === '/state') {
        const layer = Number(q.layer), spawns: Record<string, unknown>[] = [];
        for (const instance of Array.isArray(q.instances) ? q.instances.slice(0, rules.hit.maxBatchRows) : []) {
          const s = world.spawns.get(`${instance}#${layer}`);
          if (!s) continue;
          const v = view(world, s, t);
          spawns.push(toWire({ instance: s.instance, layer: s.layer, zone: s.zone, kind: s.kind, alive: v.alive, hp: v.hp, maxHp: v.maxHp, respawnAtMs: v.respawnAtMs, generation: v.generation }));
        }
        return send(res, HTTP_OK, { now: new Date(t).toISOString(), spawns }, headers);
      }
      if (route === '/hits') {
        if (!Array.isArray(q.rows)) throw new ModelError('O0002', 'rows');
        const rows = q.rows.map((r: any) => ({ account, token: String(r.token), weapon: String(r.weapon), claimed: Number(r.claimed), hits: Number(r.hits), layer: Number(r.layer) }));
        if (rows.some((r: { claimed: number; hits: number }) => !Number.isFinite(r.claimed) || !Number.isFinite(r.hits))) throw new ModelError('O0002', 'claimed and hits must be finite numbers');
        const out = hitBatch(world, String(q.batchId), rows, t);
        stats.batches++;
        if (out.replayed) return send(res, HTTP_OK, { replayed: true, results: [] }, headers);
        // The phone never sees other accounts: `credits` (and the paid count) are stripped from every slot (the contract, section 2).
        const results = out.results.map((s) => {
          const { credits: _credits, paid: _paid, ...rest } = s as Record<string, unknown>;
          // FINDING (found by the proof): a hit that arrives after ANOTHER phone's kill finds its token used and the model/SQL raise O0009 ("token"), which the client answers by dropping the token
          // (reengage), so that phone can never ask kill_report for its credit. The honest answer for a token closed by the kill is `dead`, which keeps the token. The writer says that here; the
          // model and the SQL (CI-pinned twins) are NOT changed in this proof, the fix belongs there (open item in the PR).
          if (rest.error === 'O0009') {
            const e = world.engages.get(String(rest.token));
            if (e && e.account === account && e.used && (e.result === 'killed' || e.result === 'dead')) { const sp = world.spawns.get(`${e.instance}#${e.layer}`); return toWire({ token: rest.token, refused: 'dead', respawnAtMs: sp?.respawnAtMs ?? null }); }
          }
          if (rest.killed === true) stats.kills++;
          return toWire(rest);
        });
        return send(res, HTTP_OK, { replayed: false, results }, headers);
      }
      return send(res, HTTP_NOT_FOUND, { error: 'not-found' }, headers);
    } catch (e) {
      stats.errors++;
      if (e instanceof ModelError) return send(res, HTTP_BAD_REQUEST, { error: e.code, message: e.message }, headers);
      return send(res, HTTP_INTERNAL, { error: 'XX000', message: 'writer error' }, headers);
    }
  });
  return { server, world, port: () => (server.address() as { port: number }).port, credits: () => world.credits, stats: () => ({ ...stats }) };
}
