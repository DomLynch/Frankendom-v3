// The world fight's RECORD (Lead, 2026-10-13, "BASE"): the inputs the page fed Zone 1's combat loop (src/fight/world.ts stepCombat, via world-combat.ts), packed small, so the server can run the same loop again
// and see the kill before anything spendable or permanent pays. It owns no rule: `stepHero` below is the ONE place a frame step is made, called by the live loop and by the replay alike, and the sim is stepCombat.
// A record is a window: it opens when a creature joins an empty loop and carries the hero's body at that moment (claims, bounded by the replay), every join and release, and per step the page's pose and presses.
// Poses and presses are quantized BEFORE the live loop uses them (cm, milliradian), so the replay sees exactly the numbers the page's sim saw. This is a Zone 1 module, not the Pit's FightRecord. The header stamps the sim's RECORD_VERSION: the replay runs only a record of its own version (a stale one is the no-record tier, not fraud).
import { M } from './detmath.ts';
import { worldRule } from './world-rules.ts';
import { CC_LADDER, type CcLadder } from './cc-ladder.ts';
import { LEVELS, OPPONENTS, PLAYER_WEAPONS, RULES, type Direction, type WeaponId } from './moves.ts';
import { MAX_RECORD_BYTES, RECORD_VERSION, fromBase64Url, toBase64Url } from './record.ts';
import { DIALS, SHEET_SKILLS, checkSheet, statUp, type Sheet } from './sheet-rows.ts';
import { isSpellId, resolveSpell } from './spell-cast.ts';
import { ALLOW_DUPLICATE } from './spell-rows.ts';
import { STAMINA_MAX, creature, newWorld, player, stepCombat, type Event, type Fighter, type World } from './world.ts';

// The world sim's version (Combat, 2026-10-13): what a replay of this record means. tests/world-sim-guard.test.ts hashes the world files (world.ts, open-fight.ts, this file, speeds.ts, attackers.ts) with the Pit's
// RECORD_VERSION; a change to any of them, or a Pit sim bump, fails that test until this is bumped and the digest re-pinned. The packed record stamps it, and a verifier replays only a record of ITS OWN version.
export const WORLD_SIM_VERSION = 45;
export const ME = 'me', STEP = 1 / 60;
export type Press = 'light' | 'heavy' | 'thrust' | 'kick';
const PRESSES: readonly (Press | null)[] = [null, 'light', 'heavy', 'thrust', 'kick'];
const SIDES: readonly (Direction | null)[] = [null, 'right', 'left', 'overhead', 'thrust', 'low'];   // the held guard side (the Pit's thumbs), packed in flag bits 6-8; absent = the straight guard
/** The most a pose may move between two steps, m/s: a run, or a roll's own displacement (the hero's cut reaches no farther). Measured against a real roll in world-record.test.ts. */
export const MAX_HERO_MPS = worldRule('maxHeroMps');
export const MAX_CREATURES = worldRule('maxCreatures'), MAX_EVENTS = worldRule('maxEvents');
/** Five minutes of world fight: a window past it is not recorded, not unpacked, not replayed (a replay of the decoder's old 108k ticks cost a second on the writer). */
export const MAX_WORLD_TICKS = worldRule('maxWorldTicks');
export const INSTANCE = /^[a-z0-9._:-]{1,96}$/;

/** The hero's body at the window's start. gear is the page's claim; the replay bounds it by the caps and the server may check it against its own ledger. */
export type RecordHero = { level: number; weapon: WeaponId; health: number; stamina: number; posture: number; exhausted: boolean; sheet?: Sheet; spell?: { id: string; skill: number }; spell2?: { id: string; skill: number } };   // spell2: slot b, the same claim shape (WSV 42); absent = one slot, the record byte for byte as before. spell: the equipped spell and the skill it is cast at (the Pit record's spell block; the server holds it to the grimoire and the stored skill, origins/server/spell-check.ts); absent = no spell. sheet (series PR 4): the hero's dials, the claim the server holds to its expectation; with one, attack and res fight as 1 (the sheet carries them)
export type JoinEvent = { s: number; id: string; kind: string; x: number; z: number; level: number; seed?: number };   // the creature at its pose (m) when it joined, before step s
export type ReleaseEvent = { s: number; id: string };
/** One step: the pose the page gave the loop (null = the loop's own body), the presses (attack and roll already nulled when the hero is dead), and the held guard. Integers: cm, milliradian, thousandths. */
export type WorldStep = { pose: { x: number; z: number; f: number } | null; guard: boolean; gd: Direction | null; attack: Press | null; roll: { x: number; z: number } | null; cast?: true; cast2?: true };   // cast2: the second slot's press (key absent when not pressed). cast: the SKILL / cast press (the Pit's special slot, spell-cast.ts); the key is absent when not pressed, so a record without a cast is byte for byte what it was
export type WorldRecord = { rv: number; wv: number; hero: RecordHero; joins: JoinEvent[]; releases: ReleaseEvent[]; steps: WorldStep[] };

export const cm = (v: number): number => Math.round(v * 100) || 0, mrad = (v: number): number => Math.round(v * 1000) || 0;   // || 0: never -0
const fromCm = (n: number): number => n / 100, fromMrad = (n: number): number => n / 1000;

/** The ONE frame step: the first step of a page frame takes the page's pose (and re-applies his gear); the rest keep the loop's body. Used by the live loop and the replay, so they cannot differ. */
export function stepHero(world: World, step: WorldStep, gear: { level: number; shielded: boolean }): { world: World; events: Event[] } {
  let w = world;
  if (step.pose) { const m = w.fighters[0]!; w = { ...w, fighters: [{ ...m, ...gear, x: fromCm(step.pose.x), z: fromCm(step.pose.z), facing: m.phase === 'roll' ? m.facing : fromMrad(step.pose.f) }, ...w.fighters.slice(1)] }; }
  return stepCombat(w, { [ME]: { x: 0, z: 0, attack: step.attack, ...(step.cast ? { special: true } : {}), ...(step.cast2 ? { special2: true } : {}), guard: step.guard, guardDirection: step.gd, roll: step.roll ? { x: fromMrad(step.roll.x), z: fromMrad(step.roll.z) } : null } }, STEP);
}
export const joinFighter = (j: JoinEvent): Fighter => ({ ...creature(j.id, j.kind, fromCm(j.x), fromCm(j.z), 0, j.level), ...(j.seed === undefined ? {} : { seed: j.seed }) });   // seed: this bout's roll (bout-seed.ts)
/** The page's numbers, quantized: what the live loop must step with so a replay matches. */
export const quantStep = (hero: { x: number; z: number; facing: number } | null, guard: boolean, attack: Press | null, roll: { x: number; z: number } | null, gd: Direction | null = null, cast = false, cast2 = false): WorldStep => ({
  pose: hero ? { x: cm(hero.x), z: cm(hero.z), f: mrad(hero.facing) } : null, guard, gd: guard ? gd : null, attack, roll: roll ? { x: mrad(roll.x), z: mrad(roll.z) } : null, ...(cast ? { cast: true as const } : {}), ...(cast2 ? { cast2: true as const } : {}),
});
/** The ladder holds no mark that still counts at `tick` (the world clock in Pit ticks): every mark is older than its kind's window (cc-ladder.ts markOf, same test, same `end ?? last` reference), so the next landing finds
 *  it exactly as it would find an empty ladder, now and at every later tick. The ladder is never pruned, so 'empty' would stay false for the rest of the session after one stun; 'quiet' is the same fact. */
export const ccQuiet = (ladder: CcLadder | undefined, tick: number, rows = CC_LADDER): boolean =>
  !ladder || ladder.every((m) => { const k = rows.kinds[m.family]; return !k || tick - (k.windowFrom === 'end' ? m.end ?? m.last : m.last) > k.window; });
/** The hero is at rest and carries nothing the header lacks: ready, full bar, no wound, no cooldown, no stance, a quiet CC ladder. Only then does a window open (a record cannot carry the rest of his Pit fighter). */
export function heroClean(world: World): boolean {
  const m = world.fighters[0], d = world.streams[ME]?.duel.fighters[0];
  return !!m && m.phase === 'ready' && m.maxStamina === STAMINA_MAX && !m.special && !m.skill && !m.stance && ccQuiet(m.cc, Math.round(world.time * 60)) && !(m.threat && Object.keys(m.threat).length)
    && (!d || (d.wound === 0 && !d.legWound && d.maxStamina === STAMINA_MAX && d.skillCooldown === 0 && d.move === null && d.phase !== 'dead'));
}
export const startBody = (h: RecordHero): Fighter => { const spell = h.spell ? resolveSpell(h.spell.id, h.spell.skill, h.sheet?.spellPower ?? 0) : undefined, spell2 = h.spell2 ? resolveSpell(h.spell2.id, h.spell2.skill, h.sheet?.spellPower ?? 0) : undefined, p = player(ME, 0, 0, 0, h.level, null, { weapon: h.weapon, ...(h.sheet ? { sheet: h.sheet } : {}), ...(spell ? { spell } : {}), ...(spell2 ? { spell2 } : {}) }); return { ...p, health: h.health, stamina: h.stamina, posture: h.posture, exhausted: h.exhausted }; };

// ---- the recorder: the live loop feeds it, the page asks for the packed record at a kill -----------------------------------------------
export function createWorldRecorder() {
  let rec: WorldRecord | null = null, steps = 0, over = false;
  return {
    /** Open a window (discarding any before it) at the hero's body now. */
    open(hero: RecordHero): void { rec = { rv: RECORD_VERSION, wv: WORLD_SIM_VERSION, hero, joins: [], releases: [], steps: [] }; steps = 0; over = false; },
    active: (): boolean => rec !== null && !over,
    join(id: string, kind: string, x: number, z: number, level: number, seed?: number): void { if (rec && !over) rec.joins.push({ s: steps, id, kind, x: cm(x), z: cm(z), level, ...(seed === undefined ? {} : { seed }) }); },
    release(id: string): void { if (rec && !over) rec.releases.push({ s: steps, id }); },
    step(s: WorldStep): void { if (!rec || over) return; if (steps >= MAX_WORLD_TICKS || rec.joins.length + rec.releases.length > MAX_EVENTS) { over = true; return; } rec.steps.push(s); steps++; },
    steps: (): number => steps,
    /** The window so far, or null (none open, or it grew past its bounds). */
    take(): WorldRecord | null { return rec && !over && rec.steps.length > 0 ? { rv: rec.rv, wv: rec.wv, hero: rec.hero, joins: [...rec.joins], releases: [...rec.releases], steps: [...rec.steps] } : null; },
    discard(): void { rec = null; steps = 0; over = false; },
  };
}

// ---- the pack: JSON header, then the steps as zigzag varints (pose as a delta on the last pose), gzip, base64url -----------------------------------
const MAGIC = [0x57, 0x52, 2];   // 'W' 'R' version 2: the sheet block follows the JSON header
const SHEET_IDS: readonly string[] = [...DIALS.map((d) => d.id), ...SHEET_SKILLS.map((k) => k.id)];   // sheet-defs row order: a sheet's wire index
const zig = (n: number): number => (n < 0 ? -n * 2 - 1 : n * 2);
const unzig = (n: number): number => (n % 2 ? -(n + 1) / 2 : n / 2);
function putVar(out: number[], n: number): void { while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); } out.push(n); }
export function packWorldRecord(r: WorldRecord): Uint8Array {
  const { sheet, ...body0 } = r.hero;
  const head = new TextEncoder().encode(JSON.stringify({ v: r.rv, w: r.wv, h: body0, j: r.joins.map((e) => (e.seed === undefined ? [e.s, e.id, e.kind, e.x, e.z, e.level] : [e.s, e.id, e.kind, e.x, e.z, e.level, e.seed])), r: r.releases.map((e) => [e.s, e.id]), n: r.steps.length }));
  const out: number[] = [...MAGIC]; putVar(out, head.length);
  const pairs = Object.entries(sheet ?? {}).map(([id, v]) => [SHEET_IDS.indexOf(id), v] as const).sort((a, b) => a[0] - b[0]);
  const sheetBytes: number[] = [pairs.length];
  for (const [row, v] of pairs) { if (row < 0 || row > 255 || !Number.isInteger(v) || v < 0 || v > 255) throw Error('World record: a sheet row is a known row and a whole number 0 to 255'); sheetBytes.push(row, v); }
  let px = 0, pz = 0, pf = 0;
  const body: number[] = [];
  for (const s of r.steps) {
    putVar(body, (s.pose ? 1 : 0) | (s.guard ? 2 : 0) | (PRESSES.indexOf(s.attack) << 2) | (s.roll ? 32 : 0) | (SIDES.indexOf(s.guard ? s.gd : null) << 6) | (s.cast ? 512 : 0) | (s.cast2 ? 1024 : 0));
    if (s.pose) { putVar(body, zig(s.pose.x - px)); putVar(body, zig(s.pose.z - pz)); putVar(body, zig(s.pose.f - pf)); px = s.pose.x; pz = s.pose.z; pf = s.pose.f; }
    if (s.roll) { putVar(body, zig(s.roll.x)); putVar(body, zig(s.roll.z)); }
  }
  const all = new Uint8Array(out.length + head.length + sheetBytes.length + body.length);
  all.set(out); all.set(head, out.length); all.set(sheetBytes, out.length + head.length); all.set(body, out.length + head.length + sheetBytes.length);
  return all;
}
const isU32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e9;
export function unpackWorldRecord(bytes: Uint8Array): WorldRecord {
  let i = 0;
  const get = (): number => { let n = 0, m = 1; for (;;) { if (i >= bytes.length) throw Error('World record: truncated'); const b = bytes[i++]!; n += (b & 127) * m; if (b < 128) return n; m *= 128; if (m > 34_359_738_368) throw Error('World record: bad number'); } };
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) throw Error('World record: not a world record');
  i = 3; const hl = get(); if (hl > 65_536 || i + hl > bytes.length) throw Error('World record: bad header');
  let h: { v: number; w: number; h: RecordHero; j: unknown[][]; r: unknown[][]; n: number };
  try { h = JSON.parse(new TextDecoder().decode(bytes.subarray(i, i + hl))); } catch { throw Error('World record: bad header'); }
  i += hl;
  if (!h || typeof h !== 'object' || !isInt(h.v) || !isInt(h.w) || !isInt(h.n) || h.n < 0 || h.n > MAX_WORLD_TICKS || !Array.isArray(h.j) || !Array.isArray(h.r) || h.j.length > MAX_EVENTS || h.r.length > MAX_EVENTS) throw Error('World record: bad header');
  const hero = h.h; if (!hero || typeof hero !== 'object') throw Error('World record: bad hero');
  delete hero.sheet;   // the sheet lives only in its own block
  const nSheet = get(); if (nSheet > SHEET_IDS.length || i + 2 * nSheet > bytes.length) throw Error('World record: bad sheet');
  if (nSheet) { const sheet: Record<string, number> = {}; let prev = -1; for (let k = 0; k < nSheet; k++) { const row = bytes[i++]!, v = bytes[i++]!; if (row <= prev || row >= SHEET_IDS.length) throw Error('World record: bad sheet'); prev = row; sheet[SHEET_IDS[row]!] = v; } hero.sheet = sheet; }
  const joins = h.j.map((e): JoinEvent => { if (!Array.isArray(e) || !isInt(e[0]) || typeof e[1] !== 'string' || typeof e[2] !== 'string' || !isInt(e[3]) || !isInt(e[4]) || !isInt(e[5])) throw Error('World record: bad join'); if (e.length > 7 || (e.length === 7 && !isU32(e[6]))) throw Error('World record: bad join seed'); return { s: e[0], id: e[1], kind: e[2], x: e[3], z: e[4], level: e[5], ...(e.length === 7 ? { seed: e[6] as number } : {}) }; });
  const releases = h.r.map((e): ReleaseEvent => { if (!Array.isArray(e) || !isInt(e[0]) || typeof e[1] !== 'string') throw Error('World record: bad release'); return { s: e[0], id: e[1] }; });
  const steps: WorldStep[] = []; let px = 0, pz = 0, pf = 0;
  for (let k = 0; k < h.n; k++) {
    const fl = get(), attack = PRESSES[(fl >> 2) & 7], gd = SIDES[(fl >> 6) & 7]; if (attack === undefined || gd === undefined || fl >= 2048 || (gd !== null && !(fl & 2))) throw Error('World record: bad step');
    let pose: WorldStep['pose'] = null, roll: WorldStep['roll'] = null;
    if (fl & 1) { px += unzig(get()); pz += unzig(get()); pf += unzig(get()); pose = { x: px, z: pz, f: pf }; }
    if (fl & 32) roll = { x: unzig(get()), z: unzig(get()) };
    steps.push({ pose, guard: !!(fl & 2), gd, attack, roll, ...(fl & 512 ? { cast: true as const } : {}), ...(fl & 1024 ? { cast2: true as const } : {}) });
  }
  if (i !== bytes.length) throw Error('World record: trailing bytes');
  return { rv: h.v, wv: h.w, hero, joins, releases, steps };
}
async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes)).then(() => writer.close()).catch(() => {});
  const parts: Uint8Array[] = [], reader = stream.readable.getReader();
  let total = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > MAX_RECORD_BYTES) { await reader.cancel(); throw Error(`World record: expands past ${MAX_RECORD_BYTES} bytes`); } parts.push(value); }
  const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const encodeWorldRecord = async (r: WorldRecord): Promise<string> => toBase64Url(await pipe(packWorldRecord(r), new CompressionStream('gzip')));
export async function decodeWorldRecord(s: string): Promise<WorldRecord> {
  let bytes: Uint8Array;
  try { bytes = await pipe(fromBase64Url(s), new DecompressionStream('gzip')); } catch (error) { throw new Error(`World record: cannot decode (${error instanceof Error ? error.message : String(error)})`, { cause: error }); }
  return unpackWorldRecord(bytes);
}

// ---- the replay: bounds first, then the same loop ------------------------------------------------------------------------------------------------
export type Replayed = { ok: true; kills: string[]; heroDied: boolean; ticks: number; killStep: Record<string, number>; joins: JoinEvent[]; hero: RecordHero } | { ok: false; reason: string };
const bad = (reason: string): Replayed => ({ ok: false, reason });
/** Run a record through the world loop and report who the hero killed and whether he lived. Pure; bounded by MAX_WORLD_TICKS. Refuses (never throws) what no honest page could have produced. */
export function replayWorldRecord(r: WorldRecord): Replayed {
  const h = r.hero, n = r.steps.length;
  if (r.wv !== WORLD_SIM_VERSION) return bad('sim version');   // the WORLD sim files moved (tests/world-sim-guard.test.ts): same reason as the Pit's, no verdict on the player
  if (r.rv !== RECORD_VERSION) return bad('sim version');   // the sim moved since the page wrote it: not a verdict on the player
  if (n === 0 || n > MAX_WORLD_TICKS) return bad('ticks');
  if (!PLAYER_WEAPONS.includes(h.weapon)) return bad('weapon');   // the sim honours the hero's weapon (open-fight.ts heroSheeted): any weapon a player can wield; which one the account HOLDS is the server's check (HeroLimit.weapon, origins/server/world-verify.ts: the ledger's main hand or DEFAULT_WEAPON)
  if (!Number.isInteger(h.level) || h.level < 1 || h.level > LEVELS) return bad('hero level');
  if (h.spell && (typeof h.spell.id !== 'string' || !isSpellId(h.spell.id) || !Number.isInteger(h.spell.skill) || h.spell.skill < 0 || h.spell.skill > 100)) return bad('hero spell');   // a spell in the catalogue and a whole skill 0-100; whether the account holds it is the server's check (origins/server/spell-check.ts)
  if (h.spell2 && (!h.spell || typeof h.spell2.id !== 'string' || !isSpellId(h.spell2.id) || !Number.isInteger(h.spell2.skill) || h.spell2.skill < 0 || h.spell2.skill > 100 || (!ALLOW_DUPLICATE && h.spell2.id === h.spell.id))) return bad('hero spell');   // slot b: the same claim shape, and only beside a slot-a spell (an empty slot a keeps the class special); a duplicate only where the slot rows allow it
  if (h.sheet) { try { checkSheet(h.sheet); } catch { return bad('hero sheet'); } }   // known dials, floor..cap, and a legal point budget
  if (!(h.health > 0 && h.health <= (h.sheet ? Math.round(statUp(h.sheet, 'health', RULES.health)) : RULES.health)) || !(h.stamina >= 0 && h.stamina <= STAMINA_MAX) || !(h.posture >= 0 && h.posture <= RULES.posture.max) || typeof h.exhausted !== 'boolean') return bad('hero body');
  const ids = new Set<string>();
  for (const j of r.joins) {
    if (!INSTANCE.test(j.id) || j.id === ME || !Object.prototype.hasOwnProperty.call(OPPONENTS, j.kind) || j.level < 1 || j.level > LEVELS || j.s < 0 || j.s > n || Math.abs(j.x) > 1e7 || Math.abs(j.z) > 1e7) return bad('join');
    ids.add(j.id);
  }
  for (const e of r.releases) if (e.s < 0 || e.s > n || !ids.has(e.id)) return bad('release');
  const order = (a: { s: number }[]) => a.every((e, k) => k === 0 || a[k - 1]!.s <= e.s); if (!order(r.joins) || !order(r.releases)) return bad('order');
  if (!r.steps[0]!.pose) return bad('pose');
  const gear = { level: h.level, shielded: false };   // the sheet carries Attack and armour (world.ts player)
  let world = newWorld([startBody(h)]), dead = false, last: { x: number; z: number; k: number } | null = null, ji = 0, ri = 0;
  const kills: string[] = [], killStep: Record<string, number> = {}, joined = new Set<string>();
  const events = (k: number): string | null => {
    while (ri < r.releases.length && r.releases[ri]!.s <= k) { const id = r.releases[ri++]!.id; world = { ...world, fighters: world.fighters.filter((f) => f.id !== id) }; }
    while (ji < r.joins.length && r.joins[ji]!.s <= k) {
      const j = r.joins[ji++]!; if (dead || joined.has(j.id) && world.fighters.some((f) => f.id === j.id)) return 'join';
      if (world.fighters.length - 1 >= MAX_CREATURES) return 'crowd';
      joined.add(j.id); world = { ...world, fighters: [...world.fighters, joinFighter(j)] };
    }
    return null;
  };
  for (let k = 0; k < n; k++) {
    const bound = events(k); if (bound) return bad(bound);
    const s = r.steps[k]!;
    if (dead && (s.attack || s.roll || s.cast || s.cast2)) return bad('acted dead');
    if (s.cast && !h.spell) return bad('cast without a spell');
    if (s.cast2 && !h.spell2) return bad('cast without a spell');
    if (s.pose) {
      const x = fromCm(s.pose.x), z = fromCm(s.pose.z);
      if (last && M.hypot(x - last.x, z - last.z) > MAX_HERO_MPS * STEP * (k - last.k) + 0.02) return bad('speed');
      last = { x, z, k };
    }
    const res = stepHero(world, s, gear); world = res.world;
    for (const ev of res.events) {
      if (ev.type === 'Died') { if (ev.id === ME) dead = true; else if (ev.by === ME && !kills.includes(ev.id)) { kills.push(ev.id); killStep[ev.id] = k; } }
      else if (ev.type === 'Evaded') world = { ...world, fighters: world.fighters.filter((f) => f.id !== ev.id) };
    }
  }
  const late = events(n); if (late) return bad(late);
  return { ok: true, kills, heroDied: dead, ticks: n, killStep, joins: r.joins, hero: h };
}
