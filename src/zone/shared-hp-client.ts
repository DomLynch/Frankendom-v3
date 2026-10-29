// Live zone phase 3, step 1: the page side of SHARED boss health (docs/ZONE-CLIENT-CONTRACT.md). A pure state machine: it takes a `transport` (five promises, no fetch, no socket, no timer, no
// clock of its own: the host passes `nowMs` to start/tick/hit) and a way to read the page's layer. It
//   - engages one boss (a one-use token from the server);
//   - turns the sim's Hit events of the hero on the foe into a CLAIM per weapon, capped by the same rows the database caps with (data/zone-server-rules.json weapons x progression.maxDamageMult,
//     the rate ceiling over the real time since the last report) and always a finite number: the phone only claims, the database applies;
//   - sends ONE row per batch each flushMs and never sends a spent batch id again: a failed batch is LOST (a retry could apply damage twice);
//   - reads the shared hp back (the batch answer for its own hits, the state poll for everyone's) and keeps a BAR that only goes down within one life, so a late answer cannot raise it;
//   - handles every error by CLASS (data/zone-client.json: sqlClasses, transportClasses, refusals), never by one exact code;
//   - asks the idempotent kill_report for its credit once the boss is dead, whoever struck the last blow (credit is by damage share).
// PRESENTATION ONLY in this step: the sim's own health stays the truth of the local fight; this bar is a second number nothing draws until the wiring PR (shownHealth/presentBar are the one place that
// will choose). Every number is a row: scripts/as-data scans src/zone/ at zero, so no literal past 0 and 1, no label and no string comparison may live here.
import SERVER_RAW from '../../data/zone-server-rules.json' with { type: 'json' };
import CLIENT_RAW from '../../data/zone-client.json' with { type: 'json' };
import { parseRules, weaponCaps, type Rules } from '../server-model/zone-model.ts';

export const ACT = { lost: 'lost', reengage: 'reengage', dead: 'dead', backoff: 'backoff', wait: 'wait', stop: 'stop', block: 'block' } as const;
export type Action = (typeof ACT)[keyof typeof ACT];
export const ACTIONS: readonly Action[] = Object.values(ACT);
export const PHASE = { idle: 'idle', engaging: 'engaging', engaged: 'engaged', dead: 'dead', off: 'off' } as const;
export type Phase = (typeof PHASE)[keyof typeof PHASE];

export type ClientRows = {
  query: string; path: string; hosts: string[];
  routes: { engage: string; touch: string; hits: string; state: string; kill: string };
  timing: { tickMs: number; flushMs: number; stateMs: number; touchMs: number; timeoutMs: number; engageRetryMs: number };
  sim: { hit: string; heroSide: number; foeSide: number };
  batch: { idPrefix: string; idSep: string };
  backoff: { baseMs: number; factor: number; maxMs: number; offlineAfter: number };
  kill: { tries: number; retryMs: number; settled: string; unpaid: string };
  refusals: { id: string; action: Action; delayMs?: number }[];
  sqlClasses: { id: string; match: string[]; action: Action }[];
  transportClasses: { id: string; kinds?: string[]; status?: [number, number][]; action: Action }[];
  fallback: { sql: Action; transport: Action };
};

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const positive = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isAction = (v: unknown): boolean => ACTIONS.some((a) => a === v);

/** Check the parsed rows against themselves and against the server's rows (every refusal id has a row; a batch id built from the rows is legal). Throws with the first problem. */
export function parseClientRows(json: unknown, server: Rules): ClientRows {
  const r = json as ClientRows;
  assert(r && typeof r === 'object', 'zone-client: not an object');
  assert(/^[a-z]+$/.test(r.query), 'zone-client.query: one lowercase word');
  assert(/^\/[a-z0-9/_-]*$/.test(r.path), 'zone-client.path: a path from /');
  assert(Array.isArray(r.hosts) && r.hosts.every((h) => typeof h === 'string' && /^[a-z0-9.-]+(:[0-9]+)?$/.test(h)), 'zone-client.hosts: a list of host[:port] names in lowercase');
  for (const [k, v] of Object.entries(r.routes)) assert(/^\/[a-z0-9_-]+$/.test(v), `zone-client.routes.${k}: a path from /`);
  for (const [k, v] of Object.entries(r.timing)) assert(positive(v), `zone-client.timing.${k}: a positive number`);
  assert(Number.isInteger(r.sim.heroSide) && Number.isInteger(r.sim.foeSide) && r.sim.heroSide !== r.sim.foeSide, 'zone-client.sim: two different integer sides');
  assert(typeof r.sim.hit === 'string' && r.sim.hit.length > 0, 'zone-client.sim.hit: an event type');
  for (const k of ['baseMs', 'factor', 'maxMs', 'offlineAfter'] as const) assert(positive(r.backoff[k]), `zone-client.backoff.${k}: a positive number`);
  assert(r.backoff.factor >= 1 && r.backoff.maxMs >= r.backoff.baseMs, 'zone-client.backoff: factor at least 1 and maxMs at least baseMs');
  assert(positive(r.kill.tries) && positive(r.kill.retryMs) && r.kill.settled !== r.kill.unpaid, 'zone-client.kill: tries, retryMs and two different states');
  const batchSample = [r.batch.idPrefix, 'session', '0'].join(r.batch.idSep);
  assert(new RegExp(server.ids.batchIdPattern).test(batchSample), `zone-client.batch: ${batchSample} does not match ids.batchIdPattern`);
  const ids = r.refusals.map((x) => x.id);
  assert(new Set(ids).size === ids.length, 'zone-client.refusals: duplicate id');
  for (const s of server.refusals) assert(ids.includes(s.id), `zone-client.refusals: no row for the server's refusal ${s.id}`);
  for (const id of ids) assert(server.refusals.some((s) => s.id === id), `zone-client.refusals: ${id} is not a refusal the server has`);
  for (const x of r.refusals) { assert(isAction(x.action), `zone-client.refusals.${x.id}: unknown action`); assert(x.delayMs === undefined || (Number.isFinite(x.delayMs) && x.delayMs >= 0), `zone-client.refusals.${x.id}.delayMs: zero or more`); }
  for (const x of r.sqlClasses) { assert(isAction(x.action), `zone-client.sqlClasses.${x.id}: unknown action`); assert(x.match.length > 0 && x.match.every((m) => typeof m === 'string' && m.length > 0), `zone-client.sqlClasses.${x.id}: at least one code prefix`); }
  for (const x of r.transportClasses) {
    assert(isAction(x.action), `zone-client.transportClasses.${x.id}: unknown action`);
    assert((x.kinds?.length ?? 0) + (x.status?.length ?? 0) > 0, `zone-client.transportClasses.${x.id}: a kind or a status range`);
    for (const [lo, hi] of x.status ?? []) assert(Number.isInteger(lo) && Number.isInteger(hi) && lo <= hi, `zone-client.transportClasses.${x.id}: a status range`);
  }
  assert(isAction(r.fallback.sql) && isAction(r.fallback.transport), 'zone-client.fallback: unknown action');
  return r;
}

export const SERVER: Rules = parseRules(SERVER_RAW);
export const ROWS: ClientRows = parseClientRows(CLIENT_RAW, SERVER);
export type Caps = Map<string, { maxDamage: number; maxHitsPerS: number }>;
export const CAPS: Caps = weaponCaps(SERVER);

// ---- the wire shapes (docs/ZONE-CLIENT-CONTRACT.md) ---------------------------------------------------------------------------------------------------------------------------------------

/** A whole call that failed: kind is offline or timeout (no answer), or status (an HTTP error); code is the SQLSTATE / O-code the writer relays when a SQL function raised. */
export type TransportError = { kind: string; status?: number; code?: string; message?: string };
export type EngageOk = { token: string; instance: string; layer: number; generation: number; hp: number; maxHp: number; expiresAt?: unknown };
export type Refused = { refused: string; respawnAt?: unknown };
export type HitRowOut = { token: string; weapon: string; claimed: number; hits: number; layer: number };
export type Slot = { token?: string; error?: string; message?: string; refused?: string; respawnAt?: unknown; applied?: number; hp?: number; maxHp?: number; killed?: boolean };
export type View = { instance: string; layer?: number; alive: boolean; hp: number; maxHp: number; respawnAt?: unknown; generation: number };
export type KillAnswer = { state: string; paid?: boolean; reason?: string; sharePct?: number; payShare?: number };
export type Transport = {
  engage(q: { instance: string; layer: number }): Promise<EngageOk | Refused>;
  touch(q: { token: string }): Promise<unknown>;
  hits(q: { batchId: string; rows: HitRowOut[] }): Promise<{ replayed?: boolean; results: Slot[] }>;
  state(q: { instances: string[]; layer: number }): Promise<{ now?: unknown; spawns: View[] }>;
  killReport(q: { token: string }): Promise<KillAnswer>;
};

/** The sim's CombatEvent, the few fields the claim reads. */
export type SimEvent = { type: string; actor?: number; target?: number; damage?: number; weapon?: string };
/** The shared bar as the page may draw it. `stale`: the server has not answered for offlineAfter calls in a row (the last known value, not a live one). */
export type Bar = { instance: string; hp: number; maxHp: number; fraction: number; alive: boolean; generation: number; respawnAt: unknown; stale: boolean };
export type KillNote = { instance: string; generation: number; state: string | null; paid: boolean | null; reason: string | null; sharePct: number | null; payShare: number | null };
export type Counters = { sent: number; lost: number; replays: number; clamped: number; dropped: number; refused: number; errors: number; applied: number };

export type Options = {
  transport: Transport;
  instance: string;
  layer: () => number;
  /** A random string per page load; with the counter it makes the batch ids. Must satisfy the batch id pattern. */
  session: string;
  /** The hero's weapon id, read when a Hit event names none. */
  weapon?: () => string | undefined;
  rows?: ClientRows; caps?: Caps; server?: Rules;
  onBar?: (bar: Bar) => void; onPhase?: (phase: Phase) => void; onKill?: (note: KillNote) => void;
};

export type SharedHp = {
  /** Engage now (idle only). Resolves when the call has settled. */
  start(nowMs: number): Promise<void>;
  /** Feed a sim event; only the hero's Hit on the foe counts, and only while engaged. */
  hit(event: SimEvent): void;
  /** Drive the machine: due flush, state read, heartbeat, engage retry and kill-credit read each run at most once per call. Resolves when they have settled. */
  tick(nowMs: number): Promise<void>;
  phase(): Phase; bar(): Bar | null; counters(): Counters; kill(): KillNote | null; pendingHits(): number; stop(): void;
};

type Ctx = { delayMs?: number; weapon?: string; respawnAt?: unknown };

/** What the page shows for the boss's health: the shared bar when there is a fresh one, else the sim's own. The wiring PR calls this where hud.ts feeds the meter; nothing calls it yet. */
export function shownHealth(sim: { hp: number; max: number }, bar: Bar | null): { hp: number; max: number; shared: boolean } {
  return bar && !bar.stale ? { hp: bar.hp, max: bar.maxHp, shared: true } : { hp: sim.hp, max: sim.max, shared: false };
}
/** Set a <meter>-shaped element from shownHealth; returns whether the shared bar was used. */
export function presentBar(meter: { value: number; max: number }, sim: { hp: number; max: number }, bar: Bar | null): boolean {
  const s = shownHealth(sim, bar);
  meter.max = s.max; meter.value = s.hp;
  return s.shared;
}

export function createSharedHp(o: Options): SharedHp {
  const rows = o.rows ?? ROWS, caps = o.caps ?? CAPS, server = o.server ?? SERVER, T = rows.timing, tp = o.transport;
  assert(new RegExp(server.ids.batchIdPattern).test([rows.batch.idPrefix, o.session, '0'].join(rows.batch.idSep)), 'shared hp: the session does not make a legal batch id');

  let phase: Phase = PHASE.idle, token: string | null = null, generation = -1, bar: Bar | null = null, stopped = false;
  let contributed = false, settled: KillNote | null = null, killAt: number | null = null, killTries = 0;
  let lastSentMs: number | null = null, lastActiveMs = 0, lastStateMs: number | null = null, engageAt: number | null = null;
  let backoffUntil = 0, failures = 0, seq = 0;
  const pending = new Map<string, { claimed: number; hits: number }>(), blocked = new Set<string>();
  const busy = { hits: false, state: false, touch: false, engage: false, kill: false };
  const count: Counters = { sent: 0, lost: 0, replays: 0, clamped: 0, dropped: 0, refused: 0, errors: 0, applied: 0 };

  const setPhase = (p: Phase): void => { if (p !== phase) { phase = p; o.onPhase?.(p); } };
  const emit = (): void => { if (bar) o.onBar?.({ ...bar }); };
  const stale = (): boolean => failures >= rows.backoff.offlineAfter;

  function fail(now: number): void {
    failures += 1;
    backoffUntil = now + Math.min(rows.backoff.baseMs * rows.backoff.factor ** (failures - 1), rows.backoff.maxMs);
    if (bar && stale() && !bar.stale) { bar = { ...bar, stale: true }; emit(); }
  }
  function reached(): void {   // the server answered (even with a refusal): the line is up, so the bar is fresh. A backoff another call set is NOT cleared: it runs out by itself (a state read that got through must not undo a hit route's 429)
    failures = 0;
    if (bar?.stale) { bar = { ...bar, stale: false }; emit(); }
  }

  /** The action row for an error: a code (SQLSTATE / O-code) matches by prefix, first row wins; no code means a whole-call failure matched by kind or status; nothing matched is the fallback row. */
  function classify(err: unknown): Action {
    const e = (err ?? {}) as TransportError;
    if (typeof e.code === 'string') {
      const code = e.code, row = rows.sqlClasses.find((c) => c.match.some((m) => code.startsWith(m)));
      return row ? row.action : rows.fallback.sql;
    }
    const row = rows.transportClasses.find((c) => (c.kinds?.includes(e.kind) ?? false) || (e.status !== undefined && (c.status?.some(([lo, hi]) => e.status! >= lo && e.status! <= hi) ?? false)));
    return row ? row.action : rows.fallback.transport;
  }

  function newLife(g: number): void {   // a generation past the one we hold: nothing of the last life carries over
    generation = g; contributed = false; settled = null; killAt = null; killTries = 0;
  }
  function setBar(hp: unknown, maxHp: unknown, g: number, alive: boolean, respawnAt: unknown): void {
    if (typeof hp !== 'number' || typeof maxHp !== 'number' || !Number.isFinite(hp) || !Number.isFinite(maxHp) || !(maxHp > 0) || !Number.isFinite(g)) return;   // a bad answer changes nothing
    if (bar && g < bar.generation) return;                                  // an answer from a life that is over
    let h = Math.min(Math.max(hp, 0), maxHp);
    if (bar && g === bar.generation && bar.alive && alive) h = Math.min(h, bar.hp);   // inside one life the bar only goes down: a late answer cannot raise it
    const next: Bar = { instance: o.instance, hp: alive ? h : 0, maxHp, fraction: alive ? h / maxHp : 0, alive, generation: g, respawnAt, stale: stale() };
    if (bar && bar.hp === next.hp && bar.maxHp === next.maxHp && bar.alive === next.alive && bar.generation === next.generation && bar.stale === next.stale) return;
    bar = next; emit();
  }

  function goDead(now: number, respawnAt: unknown): void {
    pending.clear();
    setBar(0, bar?.maxHp ?? 1, Math.max(generation, bar?.generation ?? generation), false, respawnAt);
    setPhase(PHASE.dead);
    if (contributed && !settled && killAt === null) { killAt = now; killTries = 0; }   // credit is by damage share: whoever struck the last blow, a contributor asks for its pay
  }

  // What each action does. A row whose damage did not land is counted `lost` by the call site, not here (an engage or a read that failed lost no damage).
  const run: Record<Action, (now: number, c: Ctx) => void> = {
    lost: () => {},
    backoff: (now) => fail(now),
    wait: (now) => { backoffUntil = Math.max(backoffUntil, now + rows.backoff.baseMs); },   // a server answer, not a failure: nothing counts toward stale
    reengage: (now, c) => { token = null; pending.clear(); engageAt = now + (c.delayMs ?? T.engageRetryMs); if (phase === PHASE.engaged) setPhase(PHASE.idle); },
    dead: (now, c) => goDead(now, c.respawnAt),
    stop: () => { pending.clear(); setPhase(PHASE.off); },
    block: (_now, c) => { if (c.weapon !== undefined) { blocked.add(c.weapon); pending.delete(c.weapon); } },
  };

  // ---- engage -------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async function engage(now: number): Promise<void> {
    if (busy.engage || stopped || phase === PHASE.off || phase === PHASE.engaged || now < backoffUntil) return;
    busy.engage = true; engageAt = null;
    const before = phase;
    setPhase(PHASE.engaging);
    try {
      const r = await tp.engage({ instance: o.instance, layer: o.layer() });
      reached();
      if (typeof (r as Refused).refused === 'string') {
        count.refused += 1;
        const ref = r as Refused, row = rows.refusals.find((x) => x.id === ref.refused);
        if (phase === PHASE.engaging) setPhase(before);
        run[row ? row.action : rows.fallback.sql](now, { delayMs: row?.delayMs, respawnAt: ref.respawnAt });
      } else {
        const ok = r as EngageOk;
        if (typeof ok.token !== 'string' || !Number.isFinite(ok.generation)) throw { kind: 'shape' };
        if (ok.generation !== generation) newLife(ok.generation);
        token = ok.token; lastSentMs = null; lastActiveMs = now; pending.clear();
        setPhase(PHASE.engaged);
        setBar(ok.hp, ok.maxHp, ok.generation, true, null);
      }
    } catch (err) {
      count.errors += 1;
      if (phase === PHASE.engaging) setPhase(before);
      const action = classify(err);
      run[action](now, {});
      if (action !== ACT.stop && (phase as Phase) !== PHASE.off && engageAt === null) engageAt = now + T.engageRetryMs;   // an engage that was lost is asked again
    } finally { busy.engage = false; }
  }

  // ---- the claim -----------------------------------------------------------------------------------------------------------------------------------------------------------------

  function hit(e: SimEvent): void {
    if (phase !== PHASE.engaged || e.type !== rows.sim.hit || e.actor !== rows.sim.heroSide || e.target !== rows.sim.foeSide) return;
    const w = e.weapon ?? o.weapon?.(), cap = w === undefined ? undefined : caps.get(w);
    if (w === undefined || !cap || blocked.has(w)) { count.dropped += 1; return; }
    const d = e.damage;
    if (typeof d !== 'number' || !Number.isFinite(d) || !(d > 0)) { count.dropped += 1; return; }   // NaN, Infinity, zero and negative never leave the phone
    const p = pending.get(w) ?? { claimed: 0, hits: 0 };
    p.claimed += Math.min(d, cap.maxDamage); p.hits += 1;
    pending.set(w, p);
  }

  /** The row for this flush, or null. ONE row per token per batch (the database's now() is the batch's start: a second row for the same token in one batch would see elapsed 0 and apply 0). The weapon with the most
   *  pending damage goes; any other weapon waits for the next flush. Hits and damage are held to the server's own ceiling over the time since the last send; the part above it is dropped (the server would drop it). */
  function buildRow(now: number): { row: HitRowOut } | null {
    const order = [...pending].sort((a, b) => b[1].claimed - a[1].claimed);
    for (const [w, p] of order) {
      const cap = caps.get(w);
      if (!cap || blocked.has(w)) { pending.delete(w); continue; }
      const elapsedS = lastSentMs === null ? server.hit.firstHitAllowanceS : Math.min((now - lastSentMs) / 1000, server.hit.maxElapsedS);
      const allowedHits = Math.ceil(cap.maxHitsPerS * elapsedS * server.hit.dpsSlack);
      const hits = Math.min(p.hits, server.hit.maxHitsPerRow, allowedHits);
      const claimed = Math.min(p.claimed, hits * cap.maxDamage, cap.maxDamage * cap.maxHitsPerS * elapsedS * server.hit.dpsSlack);
      if (!(hits >= 1) || !(claimed > 0) || !Number.isFinite(claimed)) continue;   // too soon for a whole hit: it keeps waiting
      count.clamped += p.hits - hits;
      pending.delete(w);
      return { row: { token: token!, weapon: w, claimed, hits, layer: o.layer() } };
    }
    return null;
  }

  async function flush(now: number): Promise<void> {
    if (busy.hits || stopped || phase !== PHASE.engaged || token === null || now < backoffUntil) return;
    if (lastSentMs !== null && now - lastSentMs < T.flushMs) return;
    const built = buildRow(now);
    if (!built) return;
    seq += 1;
    const batchId = [rows.batch.idPrefix, o.session, seq].join(rows.batch.idSep), sentToken = built.row.token, sentGen = generation;
    lastSentMs = now; lastActiveMs = now; busy.hits = true; count.sent += 1;
    try {
      const res = await tp.hits({ batchId, rows: [built.row] });
      reached();
      settleBatch(now, res, sentToken, sentGen, built.row.weapon);
    } catch (err) {
      count.errors += 1; count.lost += 1;
      run[classify(err)](now, {});   // a failed batch is LOST: nothing is sent again, the id is spent
    } finally { busy.hits = false; }
  }

  function settleBatch(now: number, res: { replayed?: boolean; results: Slot[] }, tok: string, gen: number, weapon: string): void {
    if (res?.replayed === true) { count.replays += 1; count.lost += 1; return; }   // the id was already spent (ours twice, or a collision): the receipt applies nothing and nothing is sent again
    const slot = Array.isArray(res?.results) && res.results.length === 1 ? res.results[0] : undefined;
    if (!slot || (slot.token !== undefined && slot.token !== tok)) { count.lost += 1; return; }
    if (token !== tok || generation !== gen) { count.lost += 1; return; }   // the answer to a token or life we have left
    if (typeof slot.error === 'string') {   // ANY error in a slot is a lost row (a deadlock included): it is classed, never resent
      count.errors += 1; count.lost += 1;
      run[classify({ code: slot.error })](now, { weapon });
      return;
    }
    if (typeof slot.refused === 'string') {
      count.refused += 1; count.lost += 1;
      const row = rows.refusals.find((x) => x.id === slot.refused);
      run[row ? row.action : rows.fallback.sql](now, { weapon, delayMs: row?.delayMs, respawnAt: slot.respawnAt });
      return;
    }
    if (typeof slot.applied === 'number' && Number.isFinite(slot.applied) && slot.applied > 0) { contributed = true; count.applied += slot.applied; }
    if (slot.killed === true) { goDead(now, slot.respawnAt); return; }   // the hit that took hp to 0: the bar goes to 0 and the credit is asked for
    setBar(slot.hp, slot.maxHp, gen, true, null);
  }

  // ---- the shared hp read back, the heartbeat, the credit --------------------------------------------------------------------------------------------------------------

  async function readState(now: number): Promise<void> {
    if (busy.state || stopped || (phase !== PHASE.engaged && phase !== PHASE.dead) || now < backoffUntil) return;
    if (lastStateMs !== null && now - lastStateMs < T.stateMs) return;
    lastStateMs = now; busy.state = true;
    try {
      const res = await tp.state({ instances: [o.instance], layer: o.layer() });
      reached();
      const v = Array.isArray(res?.spawns) ? res.spawns.find((s) => s.instance === o.instance) : undefined;
      if (v) applyView(now, v);
    } catch (err) { count.errors += 1; run[classify(err)](now, {}); } finally { busy.state = false; }
  }

  /** One spawn view from the server (the state poll, or a pushed copy from presence). */
  function applyView(now: number, v: View): void {
    if (v.instance !== o.instance || !Number.isFinite(v.generation)) return;
    if (!v.alive) {
      if (phase === PHASE.engaged && v.generation >= generation) { if (v.generation > generation) newLife(v.generation); goDead(now, v.respawnAt); }
      else setBar(0, v.maxHp, v.generation, false, v.respawnAt);
      return;
    }
    if (phase === PHASE.dead && v.generation > generation) { setBar(v.hp, v.maxHp, v.generation, true, null); engageAt = now; return; }   // it respawned: engage the new life
    if (phase === PHASE.engaged && v.generation > generation) { goDead(now, null); setBar(v.hp, v.maxHp, v.generation, true, null); engageAt = now; return; }   // our life ended while we did not hear (offline): ask for its credit, then engage the new one
    if (phase === PHASE.engaged && v.generation === generation) setBar(v.hp, v.maxHp, v.generation, true, null);
  }

  async function heartbeat(now: number): Promise<void> {
    if (busy.touch || stopped || phase !== PHASE.engaged || token === null || now < backoffUntil || now - lastActiveMs < T.touchMs) return;
    busy.touch = true; lastActiveMs = now;
    try { await tp.touch({ token }); reached(); } catch (err) { count.errors += 1; run[classify(err)](now, {}); } finally { busy.touch = false; }
  }

  async function readCredit(now: number): Promise<void> {
    if (busy.kill || stopped || phase !== PHASE.dead || token === null || settled || killAt === null || now < killAt || now < backoffUntil) return;
    busy.kill = true; killTries += 1;
    // paid is true or false only when the server said so; a state it did not answer is null, never "paid"
    const note = (a: KillAnswer | null): KillNote => ({ instance: o.instance, generation, state: a?.state ?? null, paid: !a ? null : typeof a.paid === 'boolean' ? a.paid : a.state === rows.kill.unpaid ? false : null, reason: a?.reason ?? null, sharePct: a?.sharePct ?? null, payShare: a?.payShare ?? null });
    try {
      const a = await tp.killReport({ token });
      reached();
      if (a.state === rows.kill.settled || a.state === rows.kill.unpaid) { settled = note(a); killAt = null; o.onKill?.({ ...settled }); }
      else killAt = now + rows.kill.retryMs;
    } catch (err) {
      count.errors += 1;
      const action = classify(err);
      run[action](now, {});
      killAt = action === ACT.stop || action === ACT.reengage ? null : now + rows.kill.retryMs;   // a stop, or a token the server no longer knows, ends the asking
    } finally {
      busy.kill = false;
      if (!settled && (killAt === null || killTries >= rows.kill.tries)) { settled = note(null); killAt = null; o.onKill?.({ ...settled }); }   // gave up: the page is told there is no answer (paid: null)
    }
  }

  return {
    start: (now) => engage(now),
    hit,
    async tick(now) {
      if (stopped || phase === PHASE.off) return;
      const jobs: Promise<void>[] = [];
      if (engageAt !== null && now >= engageAt && phase !== PHASE.engaged && killAt === null) jobs.push(engage(now));   // not while the credit of the last life is still being asked for (it needs that life's token)
      jobs.push(flush(now), readState(now), heartbeat(now), readCredit(now));
      await Promise.all(jobs);
    },
    phase: () => phase, bar: () => (bar ? { ...bar } : null), counters: () => ({ ...count }), kill: () => (settled ? { ...settled } : null),
    pendingHits: () => [...pending.values()].reduce((n, p) => n + p.hits, 0),
    stop: () => { stopped = true; pending.clear(); setPhase(PHASE.off); },
  };
}
