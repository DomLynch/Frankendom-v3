// Reference model of the zone server's shared boss health and damage-share credit (docs/ZONE-SERVER-DESIGN.md). PURE: no database, no clock (callers pass `nowMs`),
// no game import. It is the executable twin of supabase/migrations/20261027000001_zone_server.sql: the same rules in the same order, so the tests here pin what the SQL
// must do. Every number comes from data/zone-server-rules.json (parseRules); nothing is hard-coded below except structure.
// Donors: Armagedom 20261024000002_arma_world.sql (hp in the store, capped damage, settle at death), V1 origins/server/{world-spawns,damage-share}.ts.

export type Rules = {
  writerRoles: string[];
  adminOnlyFunctions: string[];
  ids: { instancePattern: string; tokenPattern: string; batchIdPattern: string; weaponPattern: string };
  engage: { tokenBytes: number; ttlS: number; maxOpenPerAccount: number };
  hit: { maxBatchRows: number; maxHitsPerRow: number; firstHitAllowanceS: number; maxElapsedS: number; dpsSlack: number; retryFailedBatch: boolean };
  progression: { maxDamageMult: number };
  weapons: { id: string; maxDamagePerHit: number; maxHitsPerS: number }[];
  share: { minSharePct: number; floorEqualShareFraction: number; renormalise: boolean; hitExpiryS: number };
  caps: { killsPerMin: number; killsPerHour: number; cooldownAcrossLayers: boolean };
  respawn: { minS: number; maxS: number; defaultS: number };
  log: { keepS: number };
  refusals: { id: string; status: number; text: string }[];
  payReasons: { id: string; text: string }[];
};

const num = (errs: string[], path: string, v: unknown, lo: number, hi: number): void => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) errs.push(`${path}: a number from ${lo} to ${hi}`); };
const pat = (errs: string[], path: string, v: unknown): void => { try { new RegExp(String(v)); if (typeof v !== 'string') throw 0; } catch { errs.push(`${path}: a regular expression`); } };

/** Check the parsed rows file (the same bounds the SQL check constraints carry). Returns the rows typed, or throws with every problem. */
export function parseRules(json: unknown): Rules {
  const r = json as Rules, errs: string[] = [];
  if (!r || typeof r !== 'object') throw new Error('zone rules: not an object');
  if (!Array.isArray(r.writerRoles) || r.writerRoles.length < 1 || r.writerRoles.some((x) => typeof x !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(x))) errs.push('writerRoles: at least one role name');
  for (const k of ['instancePattern', 'tokenPattern', 'batchIdPattern', 'weaponPattern'] as const) pat(errs, `ids.${k}`, r.ids?.[k]);
  num(errs, 'engage.tokenBytes', r.engage?.tokenBytes, 12, 64); num(errs, 'engage.ttlS', r.engage?.ttlS, 30, 1800); num(errs, 'engage.maxOpenPerAccount', r.engage?.maxOpenPerAccount, 1, 16);
  num(errs, 'hit.maxBatchRows', r.hit?.maxBatchRows, 1, 1000); num(errs, 'hit.maxHitsPerRow', r.hit?.maxHitsPerRow, 1, 200); num(errs, 'hit.firstHitAllowanceS', r.hit?.firstHitAllowanceS, 0.1, 10);
  num(errs, 'hit.maxElapsedS', r.hit?.maxElapsedS, 0.1, 30); num(errs, 'hit.dpsSlack', r.hit?.dpsSlack, 1, 3);
  if (r.hit?.retryFailedBatch !== false) errs.push('hit.retryFailedBatch: must be false (a retried batch can double damage)');
  num(errs, 'progression.maxDamageMult', r.progression?.maxDamageMult, 1, 100);
  if (!Array.isArray(r.weapons) || r.weapons.length < 1) errs.push('weapons: at least one row');
  else for (const w of r.weapons) { if (!new RegExp(r.ids?.weaponPattern ?? '').test(w.id)) errs.push(`weapons.${w.id}: id fails ids.weaponPattern`); num(errs, `weapons.${w.id}.maxDamagePerHit`, w.maxDamagePerHit, 1e-6, 1e9); num(errs, `weapons.${w.id}.maxHitsPerS`, w.maxHitsPerS, 1e-6, 1e3); }
  if (new Set((r.weapons ?? []).map((w) => w.id)).size !== (r.weapons ?? []).length) errs.push('weapons: duplicate id');
  if (!Array.isArray(r.adminOnlyFunctions) || r.adminOnlyFunctions.some((x) => typeof x !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(x))) errs.push('adminOnlyFunctions: a list of function names');
  num(errs, 'share.minSharePct', r.share?.minSharePct, 0, 100); num(errs, 'share.floorEqualShareFraction', r.share?.floorEqualShareFraction, 0, 1); num(errs, 'share.hitExpiryS', r.share?.hitExpiryS, 1, 3600);
  if (typeof r.share?.renormalise !== 'boolean') errs.push('share.renormalise: a boolean');
  num(errs, 'caps.killsPerMin', r.caps?.killsPerMin, 1, 60); num(errs, 'caps.killsPerHour', r.caps?.killsPerHour, 1, 3600);
  if (typeof r.caps?.cooldownAcrossLayers !== 'boolean') errs.push('caps.cooldownAcrossLayers: a boolean');
  num(errs, 'respawn.minS', r.respawn?.minS, 1, 3600); num(errs, 'respawn.maxS', r.respawn?.maxS, 1, 604800); num(errs, 'respawn.defaultS', r.respawn?.defaultS, 1, 604800);
  if (r.respawn && !(r.respawn.minS <= r.respawn.defaultS && r.respawn.defaultS <= r.respawn.maxS)) errs.push('respawn: minS <= defaultS <= maxS');
  num(errs, 'log.keepS', r.log?.keepS, 60, 2592000);
  for (const id of ['dead', 'too-many', 'moved', 'weapon', 'token', 'mismatch']) if (!r.refusals?.some((x) => x.id === id)) errs.push(`refusals: no row for ${id}`);
  for (const id of ['paid', 'floor', 'cap', 'cooldown']) if (!r.payReasons?.some((x) => x.id === id)) errs.push(`payReasons: no row for ${id}`);
  if (/bonus/i.test(JSON.stringify(json).replace(/"note":"[^"]*"/g, '').replace(/"about":"[^"]*"/g, ''))) errs.push('a bonus row is not allowed (no first-hit or last-hit bonus)');
  if (errs.length) throw new Error(`zone rules:\n  ${errs.join('\n  ')}`);
  return r;
}

/** The zone id (a string) of an instance id, or null for anything that is not `z<N>:name` with N = 0 or no leading zero. `z01:...` is null: refused, never stored as zone 1. */
export function zoneOf(rules: Rules, instance: string): string | null {
  if (!new RegExp(rules.ids.instancePattern).test(instance)) return null;
  return /^z(0|[1-9][0-9]*):/.exec(instance)![1]!;
}

/** Each weapon's per-hit damage cap and rate, the damage cap lifted by the progression ceiling. */
export function weaponCaps(rules: Rules): Map<string, { maxDamage: number; maxHitsPerS: number }> {
  return new Map(rules.weapons.map((w) => [w.id, { maxDamage: w.maxDamagePerHit * rules.progression.maxDamageMult, maxHitsPerS: w.maxHitsPerS }]));
}

/** Every weapon id the game can send must have a row, or its hits could not be clamped (the wiring PR calls this with the move table's ids). */
export function checkWeaponCoverage(rules: Rules, ids: readonly string[]): void {
  const have = new Set(rules.weapons.map((w) => w.id)), missing = ids.filter((i) => !have.has(i));
  if (missing.length) throw new Error(`no weapon rule for: ${missing.join(', ')}`);
}

export type Spawn = { instance: string; layer: number; zone: string; kind: string; maxHp: number; respawnS: number; hp: number; alive: boolean; generation: number; respawnAtMs: number | null; killedAtMs: number | null };
export type Engage = { token: string; account: string; character: string; instance: string; layer: number; generation: number; lastHitAtMs: number | null; expiresAtMs: number; used: boolean; result: 'killed' | 'dead' | 'expired' | 'moved' | null };
export type HitRow = { instance: string; layer: number; generation: number; account: string; character: string; atMs: number; applied: number; hits: number; claimed: number };
export type Credit = { instance: string; layer: number; generation: number; account: string; character: string; atMs: number; damage: number; sharePct: number; payShare: number; paid: boolean; reason: string };
export type World = { rules: Rules; spawns: Map<string, Spawn>; engages: Map<string, Engage>; hits: HitRow[]; credits: Credit[]; batches: Map<string, unknown> };

export const newWorld = (rules: Rules): World => ({ rules, spawns: new Map(), engages: new Map(), hits: [], credits: [], batches: new Map() });
export class ModelError extends Error { code: string; constructor(code: string, msg: string) { super(msg); this.code = code; } }

const key = (instance: string, layer: number): string => `${instance}#${layer}`;
const refuse = (w: World, id: string, extra: Record<string, unknown> = {}): { refused: string } & Record<string, unknown> => {
  if (!w.rules.refusals.some((r) => r.id === id)) throw new Error(`no refusal row ${id}`);
  return { refused: id, ...extra };
};

/** The spawn as a client sees it: a dead spawn whose respawn time has passed reads as alive at full hp, next generation (the clock is the server's). */
export function view(w: World, s: Spawn, nowMs: number): { alive: boolean; hp: number; maxHp: number; generation: number; respawnAtMs: number | null } {
  if (s.alive) return { alive: true, hp: s.hp, maxHp: s.maxHp, generation: s.generation, respawnAtMs: null };
  if (s.respawnAtMs! <= nowMs) return { alive: true, hp: s.maxHp, maxHp: s.maxHp, generation: s.generation + 1, respawnAtMs: null };
  return { alive: false, hp: 0, maxHp: s.maxHp, generation: s.generation, respawnAtMs: s.respawnAtMs };
}

export type EngageReq = { account: string; character: string; token: string; instance: string; layer: number; kind: string; maxHp: number; respawnS?: number };

/** Engage a live spawn: create it on first engage (kind, max hp and respawn seconds are then FIXED), bring it back at its respawn time, hand out a one-use token. */
export function engage(w: World, q: EngageReq, nowMs: number): Record<string, unknown> {
  const R = w.rules;
  if (zoneOf(R, q.instance) === null) throw new ModelError('O0002', `instance ${q.instance}: not a z<N>: id (z01: is refused)`);
  if (!new RegExp(R.ids.tokenPattern).test(q.token)) throw new ModelError('O0002', 'token: shape');
  if (!(q.maxHp > 0)) throw new ModelError('O0002', 'maxHp');
  const respawnS = Math.min(Math.max(q.respawnS ?? R.respawn.defaultS, R.respawn.minS), R.respawn.maxS);
  const k = key(q.instance, q.layer);
  let s = w.spawns.get(k);
  if (!s) { s = { instance: q.instance, layer: q.layer, zone: zoneOf(R, q.instance)!, kind: q.kind, maxHp: q.maxHp, respawnS, hp: q.maxHp, alive: true, generation: 0, respawnAtMs: null, killedAtMs: null }; w.spawns.set(k, s); }
  if (s.kind !== q.kind || s.maxHp !== q.maxHp || s.respawnS !== respawnS) return refuse(w, 'mismatch');
  if (!s.alive && s.respawnAtMs! > nowMs) return refuse(w, 'dead', { respawnAtMs: s.respawnAtMs });
  if (!s.alive) Object.assign(s, { alive: true, hp: s.maxHp, generation: s.generation + 1, respawnAtMs: null, killedAtMs: null });
  // LOCK ORDER (global): spawn row first, then engage rows OF THAT SPAWN only. The expiry sweep therefore touches only this spawn's tokens (another spawn's expired tokens are not locked here;
  // they are not counted against maxOpenPerAccount below, and zone_hit_log_prune removes them).
  for (const e of w.engages.values()) if (e.account === q.account && e.instance === q.instance && e.layer === q.layer && !e.used && e.expiresAtMs <= nowMs) { e.used = true; e.result = 'expired'; }
  let e = [...w.engages.values()].find((x) => x.account === q.account && x.instance === q.instance && x.layer === q.layer && !x.used);
  if (e && e.generation === s.generation) e.expiresAtMs = nowMs + R.engage.ttlS * 1000;
  else {
    if (e) { e.used = true; e.result = 'dead'; }
    if ([...w.engages.values()].filter((x) => x.account === q.account && !x.used && x.expiresAtMs > nowMs).length >= R.engage.maxOpenPerAccount) return refuse(w, 'too-many');
    e = { token: q.token, account: q.account, character: q.character, instance: q.instance, layer: q.layer, generation: s.generation, lastHitAtMs: null, expiresAtMs: nowMs + R.engage.ttlS * 1000, used: false, result: null };
    w.engages.set(e.token, e);
  }
  return { token: e.token, instance: e.instance, layer: e.layer, generation: e.generation, hp: s.hp, maxHp: s.maxHp, expiresAtMs: e.expiresAtMs };
}

/** Keep a token alive without a hit (the phone is in the fight but not swinging). */
export function touch(w: World, account: string, token: string, nowMs: number): Record<string, unknown> {
  const e = w.engages.get(token);
  if (!e || e.account !== account || e.used || e.expiresAtMs <= nowMs) throw new ModelError('O0009', w.rules.refusals.find((r) => r.id === 'token')!.text);
  e.expiresAtMs = nowMs + w.rules.engage.ttlS * 1000;
  return { expiresAtMs: e.expiresAtMs };
}

export type HitReq = { account: string; token: string; weapon: string; claimed: number; hits: number; layer: number };

/** One hit report. The phone claims; the store applies at most what the weapon rows and the real elapsed time allow, and never more than the hp that is left. A claimed kill does not exist:
 *  the spawn dies only when its ONE hp reaches 0, and the same call settles credit. */
export function hit(w: World, q: HitReq, nowMs: number): Record<string, unknown> {
  const R = w.rules, wp = weaponCaps(R).get(q.weapon);
  if (!wp) return refuse(w, 'weapon');
  const e = w.engages.get(q.token);
  if (!e || e.account !== q.account || e.used || e.expiresAtMs <= nowMs) throw new ModelError('O0009', R.refusals.find((r) => r.id === 'token')!.text);
  if (e.layer !== q.layer) return refuse(w, 'moved');   // writes nothing; the token stays open until it expires
  const s = w.spawns.get(key(e.instance, e.layer))!;
  if (!(s.alive && s.generation === e.generation)) { e.used = true; e.result = 'dead'; return refuse(w, 'dead', { respawnAtMs: s.respawnAtMs }); }
  const elapsed = Math.min(e.lastHitAtMs === null ? R.hit.firstHitAllowanceS : (nowMs - e.lastHitAtMs) / 1000, R.hit.maxElapsedS);
  const claimedHits = Math.min(Math.max(Math.trunc(q.hits), 0), R.hit.maxHitsPerRow);
  const hitsOk = Math.min(claimedHits, Math.ceil(wp.maxHitsPerS * elapsed * R.hit.dpsSlack));
  const claimed = Math.max(q.claimed || 0, 0);
  const applied = Math.min(claimed, hitsOk * wp.maxDamage, wp.maxDamage * wp.maxHitsPerS * elapsed * R.hit.dpsSlack, s.hp);
  e.lastHitAtMs = nowMs; e.expiresAtMs = nowMs + R.engage.ttlS * 1000;
  if (applied > 0) w.hits.push({ instance: s.instance, layer: s.layer, generation: s.generation, account: q.account, character: e.character, atMs: nowMs, applied, hits: hitsOk, claimed });
  s.hp -= applied;   // THE one bar: every account's hit lands on this same number
  if (s.hp > 0) return { applied, hp: s.hp, maxHp: s.maxHp, killed: false };
  Object.assign(s, { alive: false, hp: 0, respawnAtMs: nowMs + s.respawnS * 1000, killedAtMs: nowMs });
  for (const x of w.engages.values()) if (x.instance === s.instance && x.layer === s.layer && x.generation === s.generation && !x.used) { x.used = true; x.result = 'killed'; }
  const credits = settle(w, s, nowMs);
  return { applied, hp: 0, maxHp: s.maxHp, killed: true, respawnAtMs: s.respawnAtMs, paid: credits.filter((c) => c.paid).length, credits };
}

/** Settle a kill: credit per life from the hit log. Proportional to applied damage, floor row, no last-hit (or first-hit) bonus. Reads nothing about order or who struck the last blow. */
export function settle(w: World, s: Spawn, nowMs: number): Credit[] {
  const R = w.rules, from = nowMs - R.share.hitExpiryS * 1000;
  const by = new Map<string, { character: string; damage: number }>();
  for (const h of w.hits) {
    if (h.instance !== s.instance || h.layer !== s.layer || h.generation !== s.generation || h.atMs <= from) continue;   // expired hits took hp but earn nothing
    const c = by.get(h.account) ?? { character: h.character, damage: 0 };
    c.damage += h.applied; by.set(h.account, c);
  }
  const total = [...by.values()].reduce((n, c) => n + c.damage, 0), n = by.size;
  // The EFFECTIVE floor = min(minSharePct, floorEqualShareFraction x 100 / N) percent of the counted total, N = contributors with counted damage. Written cross-multiplied (no division) as an OR,
  // which is the same as d >= min(...): the SQL zone_settle_kill uses the identical two comparisons. floorEqualShareFraction <= 1 means an equal share (1/N) always clears it.
  const qualifies = (d: number): boolean => total > 0 && (d * 100 >= R.share.minSharePct * total || d * 100 * n >= R.share.floorEqualShareFraction * 100 * total);
  const qualifiedTotal = [...by.values()].filter((c) => qualifies(c.damage)).reduce((n, c) => n + c.damage, 0);
  const out: Credit[] = [];
  for (const [account, c] of [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sharePct = total > 0 ? Math.round((c.damage * 100 / total) * 100) / 100 : 0;
    const row = (paid: boolean, reason: string, payShare: number): Credit => ({ instance: s.instance, layer: s.layer, generation: s.generation, account, character: c.character, atMs: nowMs, damage: c.damage, sharePct, payShare, paid, reason });
    const paidIn = (ms: number): number => w.credits.filter((x) => x.account === account && x.paid && x.atMs > nowMs - ms).length;
    if (!qualifies(c.damage)) out.push(row(false, 'floor', 0));
    else if (paidIn(60_000) >= R.caps.killsPerMin || paidIn(3_600_000) >= R.caps.killsPerHour) out.push(row(false, 'cap', 0));
    else if (R.caps.cooldownAcrossLayers && w.credits.some((x) => x.account === account && x.paid && x.instance === s.instance && x.layer !== s.layer && x.atMs > nowMs - s.respawnS * 1000)) out.push(row(false, 'cooldown', 0));
    else out.push(row(true, 'paid', c.damage / (R.share.renormalise ? qualifiedTotal : total)));
  }
  w.credits.push(...out);
  return out;
}

export type BatchRow = HitReq & { respawnS?: never };

/** One tick = one batch. Rows are applied in order; a row that fails is reported in its slot and does not stop the others. A batch id seen before returns the stored receipt and applies
 *  NOTHING (the second lock behind "a failed batch is never retried"). The caller must still never resend. */
export function hitBatch(w: World, batchId: string, rows: readonly BatchRow[], nowMs: number): { replayed: boolean; results: Record<string, unknown>[] } {
  const R = w.rules;
  if (!new RegExp(R.ids.batchIdPattern).test(batchId)) throw new ModelError('O0002', 'batch id: shape');
  if (!Array.isArray(rows) || rows.length > R.hit.maxBatchRows) throw new ModelError('O0002', `a hit batch is an array of at most ${R.hit.maxBatchRows} rows`);
  const seen = w.batches.get(batchId) as Record<string, unknown>[] | undefined;
  if (seen) return { replayed: true, results: seen };
  const results = rows.map((r) => { try { return { token: r.token, ...hit(w, r, nowMs) }; } catch (e) { return { token: r.token, error: e instanceof ModelError ? e.code : 'XX000', message: (e as Error).message }; } });
  w.batches.set(batchId, results);
  return { replayed: false, results };
}

/** The phone's kill_report: read-only and idempotent. It cannot kill (only hp does); it returns the receipt of its token's life, or says the life is still running. */
export function killReport(w: World, account: string, token: string, nowMs: number): Record<string, unknown> {
  const e = w.engages.get(token);
  if (!e || e.account !== account) throw new ModelError('O0009', w.rules.refusals.find((r) => r.id === 'token')!.text);
  const s = w.spawns.get(key(e.instance, e.layer))!;
  const mine = w.credits.find((c) => c.account === account && c.instance === e.instance && c.layer === e.layer && c.generation === e.generation);
  if (mine) return { state: 'settled', paid: mine.paid, reason: mine.reason, sharePct: mine.sharePct, payShare: mine.payShare };
  if (e.generation === s.generation && s.alive) return { state: 'alive', hp: s.hp, maxHp: s.maxHp, open: !e.used && e.expiresAtMs > nowMs };
  return { state: 'unpaid', reason: e.result ?? 'dead' };   // the life ended with no credit row for this account (it dealt no counted damage)
}

/** Drop hit-log rows and closed tokens older than log.keepS. */
export function prune(w: World, nowMs: number): void {
  const from = nowMs - w.rules.log.keepS * 1000;
  w.hits = w.hits.filter((h) => h.atMs > from);
  for (const [t, e] of w.engages) if (e.used && (e.lastHitAtMs ?? 0) <= from) w.engages.delete(t);
}
