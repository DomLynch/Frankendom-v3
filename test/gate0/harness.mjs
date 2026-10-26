// Gate 0 (docs/PLAN.md section 8, addition 1): the headless replay diff. Recorded input scripts (test/gate0/scripts/*.json) are stepped
// through V1's fight sim at the seed tag (extracted by extract.mjs into .gate0/v1) and through V3's own src/fight, and the sim state is
// hashed every tick. Same hashes on every tick = the fight logic was not edited. Driver shape ported from V2's test/parity.mjs.
//
// One side = one copy of src/fight imported by file URL. Each copy has its own module-level era flags (play-radius, stab-rule,
// stance-era), so a run sets them on the side it steps. Nothing here imports match.ts: it pulls in modules the seed dropped.
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractV1, ROOT, V1_DIR } from './extract.mjs';
import { brainFor, brainProfile } from '../../src/brain.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const BRAINS = readJson(join(HERE, '..', '..', 'data', 'brains.json'));
// a config with a `page` query fights with the blade sweeps the page picks for it (src/hero-reach.ts sweepTableFor: V1's by default,
// the picked clips' under ?reach=clip) on both sides; a config without one is V1's sweeps
const { sweepTableFor } = await import('../../src/hero-reach.ts');
export const CONFIGS = readJson(join(HERE, 'configs.json')).configs;
const scriptsIn = (dir) => readdirSync(join(HERE, dir)).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(HERE, dir, f)));
export const SCRIPTS = scriptsIn('scripts');
// V3-only scripts (v3-scripts/): inputs V1 never had (the directional heavies' actions), so V1 has no reference for them. They run V3 against a second, independent
// copy of V3 (determinism) and against the pinned hashes in v3-golden.json (v3-gate0.test.mjs), never against V1.
export const V3_SCRIPTS = scriptsIn('v3-scripts');
export const V3_DIR = ROOT;

// ---- one side -------------------------------------------------------------------------------------------------------------------
const sides = new Map();
export async function loadSide(dir) {
  if (sides.has(dir)) return sides.get(dir);
  const mod = (name) => import(pathToFileURL(join(dir, 'src', 'fight', `${name}.ts`)).href);
  const [combat, moves, playRadius, stabRule, stanceEra, record, blade, bladePaths] = await Promise.all(['combat', 'moves', 'play-radius', 'stab-rule', 'stance-era', 'record', 'blade', 'blade-paths'].map(mod));
  const side = { dir, combat, moves, playRadius, stabRule, stanceEra, record, blade, bladePaths };
  sides.set(dir, side);
  return side;
}
export async function loadV1() { extractV1(); return loadSide(V1_DIR); }
export const loadV3 = () => loadSide(V3_DIR);

// V1's recordSpecials (src/fight/replay.ts:16-17 at 82a994d15), re-derived here because replay.ts imports core/loot.ts, which the seed
// dropped. skillOf is core/loot.ts:65 at 82a994d15: Object.values(SKILL_ROWS).find((r) => r.opponent === opponent)?.id ?? null.
// specialOf is moves.ts's own (moves.ts:191), taken from the side being stepped.
export function recordSpecials(side, record) {
  if (!record.specials) return undefined;
  const { SKILL_ROWS, specialOf } = side.moves;
  const aiSkill = Object.values(SKILL_ROWS).find((r) => r.opponent === record.opponent)?.id ?? null;
  const name = specialOf(record.opponent, record.level);
  return { level: record.level, aiSkill, ...(name ? { name } : {}) };
}

// One side's blade sweeps: `table` (sweepTableFor's shape, rig -> weapon -> path -> poses) laid over V1's, or null for V1's. V3 sets it
// as the page does (src/fight/blade.ts setSweepOverride, src/hero-clips.ts); V1 has no such switch, so its own table objects get the same
// rows written into them (and V1's back afterwards). Same sweeps on both sides, so V3 must still replay V1 tick for tick: the switch
// changes the table and nothing else.
function setSweeps(side, table) {
  if (side.blade.setSweepOverride) { side.blade.setSweepOverride(table); return; }
  side.v1Sweeps ??= new Map();
  for (const [rig, weapons] of Object.entries(side.bladePaths.bladePathsByRig)) for (const [weapon, own] of Object.entries(weapons)) {
    const key = `${rig}/${weapon}`;
    if (!side.v1Sweeps.has(key)) side.v1Sweeps.set(key, { ...own });
    Object.assign(own, side.v1Sweeps.get(key), table?.[rig]?.[weapon] ?? {});
  }
}

// Sets this side's era flags and builds the fight, as V1's Match.begin('career') does (src/fight/match.ts:144-176 at 82a994d15)
// for the career config, or a plain initialPractice(seed, opponentAt(o, level)) for a config marked plain.
export function startFight(side, config, seed) {
  const { combat, moves, playRadius, stabRule, stanceEra } = side;
  const f = config.flags;
  playRadius.setPlayScale(f.playScaleFor ? playRadius.playScaleFor(f.playScaleFor, Infinity) : f.playScale);
  playRadius.setLateNotice(f.lateNotice); stabRule.setStab(f.stab); stanceEra.setStanceRows(f.stanceRows);
  setSweeps(side, config.page === undefined ? null : sweepTableFor(config.page));
  const opponent = moves.OPPONENTS[config.opponent];
  // a config naming a `brain` (data/brains.json) lays that row over this side's own V1 profile, as the driver does (src/brain.ts)
  const body = moves.opponentAt(opponent, config.level), profile = brainProfile(moves.profileAt(opponent, config.level), config.brain ? brainFor(BRAINS.brains, config.brain) : undefined);
  const practice = config.plain
    ? combat.initialPractice(seed, body)
    : combat.initialPractice(seed, body, config.weapon ?? moves.DEFAULT_WEAPON, config.skill ?? null,
      recordSpecials(side, { specials: config.specials, level: config.level, opponent: config.opponent }),
      undefined, config.stance, undefined, undefined, undefined, undefined, undefined, config.skill2);
  return { practice, profile };
}

// ---- input scripts --------------------------------------------------------------------------------------------------------------
// A script is data: segments of held input, each `ticks` long. `action` fires on the segment's first tick, or every `every` ticks
// (from `offset`) when given; move/guard/held/guardDirection/lock/cancel are levels held for the whole segment. `repeat` loops a
// nested list. A `random` block is a seeded generator (mulberry32) whose every weight and range is in the JSON row.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (rnd, weights) => { const e = Object.entries(weights), sum = e.reduce((s, [, w]) => s + w, 0); let r = rnd() * sum; for (const [k, w] of e) { if ((r -= w) < 0) return k; } return e[e.length - 1][0]; };
const between = (rnd, [lo, hi]) => lo + Math.floor(rnd() * (hi - lo + 1));

function randomSegments(g) {
  const rnd = mulberry32(g.seed), out = [...(g.prelude ?? [])];
  let t = out.reduce((s, x) => s + x.ticks, 0);
  while (t < g.ticks) {
    const ticks = Math.min(between(rnd, g.segmentTicks), g.ticks - t);
    const seg = { ticks };
    if (rnd() < g.moveChance) { const a = rnd() * 2 * Math.PI; seg.move = { x: Math.sin(a), z: Math.cos(a), yaw: 0, run: rnd() < g.runChance }; }
    if (rnd() < g.actionChance) { seg.action = pick(rnd, g.actions); if (rnd() < g.repeatChance) seg.every = between(rnd, g.every); }
    if (rnd() < g.guardChance) { seg.guard = true; if (rnd() < g.directionChance) seg.guardDirection = g.directions[between(rnd, [0, g.directions.length - 1])]; }
    if (rnd() < g.heldChance) seg.held = true;
    if (rnd() < g.unlockChance) seg.lock = false;
    if (rnd() < g.cancelChance) seg.cancel = true;
    out.push(seg); t += ticks;
  }
  return out;
}

function* expand(segments) {
  for (const s of segments) {
    if (s.repeat) { for (let r = 0; r < s.repeat; r++) yield* expand(s.segments); continue; }
    for (let i = 0; i < s.ticks; i++) {
      const fire = s.action && (s.every ? i >= (s.offset ?? 0) && (i - (s.offset ?? 0)) % s.every === 0 : i === (s.offset ?? 0));
      const intent = { move: { x: 0, z: 0, yaw: 0, run: false, ...s.move }, action: fire ? s.action : null, guard: !!s.guard, lock: s.lock ?? true };
      if (s.held) intent.held = true;
      if (s.guardDirection) intent.guardDirection = s.guardDirection;
      if (s.cancel && (!s.action || fire)) intent.cancel = true;
      yield intent;
    }
  }
}
// The script's intents, each through V1's quantizeIntent (src/fight/record.ts:262), as a live fight's recorder hands them to the sim.
export function intentsOf(script, quantizeIntent) {
  return [...expand(script.random ? randomSegments(script.random) : script.segments)].map(quantizeIntent);
}

// ---- hashing ---------------------------------------------------------------------------------------------------------------------
// A stable serialisation: sorted keys, numbers as their shortest round-trip text (so a 1-ulp drift shows), -0, NaN and Infinity kept
// distinct, undefined object keys skipped (as JSON does).
export function canon(v) {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'number': return Object.is(v, -0) ? '-0' : Number.isFinite(v) ? String(v) : `"#${v}"`;
    case 'string': return JSON.stringify(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'undefined': return 'undefined';
    case 'object':
      if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
      if (v instanceof Map || v instanceof Set) return `${v.constructor.name}${canon([...v])}`;
      return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    default: throw new Error(`gate0: cannot hash a ${typeof v} in sim state`);
  }
}
export const tickState = (p) => ({ duel: p.duel, ai: p.ai, events: p.events });

// The first path where two states differ, with both values (shortened).
export function firstDiff(a, b, path = '') {
  if (canon(a) === canon(b)) return null;
  const obj = (x) => x !== null && typeof x === 'object';
  if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) { const d = firstDiff(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`); if (d) return d; }
  }
  const short = (x) => { const s = x === undefined ? 'absent' : canon(x); return s.length > 120 ? `${s.slice(0, 117)}...` : s; };
  return { path: path || '(root)', a: short(a), b: short(b) };
}

// Steps one side through the intents, hashing the state after every tick; stops at the finish (as V1's verifyRecord does) or at
// `stopAt` ticks, returning that tick's state.
export function runSide(side, config, seed, intents, stopAt = Infinity) {
  let { practice, profile } = startFight(side, config, seed);
  const running = createHash('sha256'), digests = [];
  for (let i = 0; i < intents.length && i < stopAt; i++) {
    practice = side.combat.stepPractice(practice, intents[i], profile);
    const s = canon(tickState(practice));
    running.update(s);
    digests.push(createHash('sha256').update(s).digest('hex').slice(0, 16));
    if (practice.duel.finish) break;
  }
  const finish = practice.duel.finish;
  const outcome = !finish ? 'none' : finish.draw ? 'draw' : finish.victim === 1 ? 'killed' : 'died';
  return { digests, ticks: digests.length, hash: running.digest('hex').slice(0, 16), outcome, practice };
}

// Runs one (config, seed, script) on two sides. same=true when every tick's hash matches; otherwise `diff` names the first differing
// tick (1-based: the state after that many steps) and field, found by re-running both sides to that tick.
// `intents` may be passed per side ({ a, b }) so a test can flip one input on one side.
export function compare(a, b, config, seed, script, intents) {
  const ia = intents?.a ?? intentsOf(script, a.record.quantizeIntent), ib = intents?.b ?? ia;
  const ra = runSide(a, config, seed, ia), rb = runSide(b, config, seed, ib);
  const row = { config: config.id, seed, script: script.id, ticks: [ra.ticks, rb.ticks], hash: [ra.hash, rb.hash], outcome: [ra.outcome, rb.outcome], same: true, diff: null };
  const n = Math.max(ra.ticks, rb.ticks);
  let tick = -1;
  for (let i = 0; i < n; i++) if (ra.digests[i] !== rb.digests[i]) { tick = i; break; }
  if (tick < 0) return row;
  row.same = false;
  if (tick >= ra.ticks || tick >= rb.ticks) { row.diff = { tick: tick + 1, path: '(fight length)', a: `${ra.ticks} ticks`, b: `${rb.ticks} ticks` }; return row; }
  const pa = runSide(a, config, seed, ia, tick + 1).practice, pb = runSide(b, config, seed, ib, tick + 1).practice;
  row.diff = { tick: tick + 1, ...firstDiff(tickState(pa), tickState(pb)) };
  return row;
}

export const describe = (r) => `${r.config}/seed ${r.seed}/${r.script}: ` + (r.same
  ? `same, ${r.ticks[0]} ticks, ${r.hash[0]}, ${r.outcome[0]}`
  : `DIFF at tick ${r.diff.tick}, ${r.diff.path}: ${r.diff.a} vs ${r.diff.b}`);

// The player's swings by move over a whole script (AttackStarted, actor 0): what a V3-only script actually exercised.
export function startedMoves(side, config, seed, script) {
  let { practice, profile } = startFight(side, config, seed);
  const counts = {};
  for (const intent of intentsOf(script, side.record.quantizeIntent)) {
    practice = side.combat.stepPractice(practice, intent, profile);
    for (const e of practice.duel.events) if (e.type === 'AttackStarted' && e.actor === 0) counts[e.move] = (counts[e.move] ?? 0) + 1;
    if (practice.duel.finish) break;
  }
  return counts;
}
// A second, independent copy of this tree's sim (its own module instances and era flags), for the V3-only determinism rows. The art is left out.
export async function loadV3Copy() {
  const dir = mkdtempSync(join(tmpdir(), 'gate0-v3-'));
  cpSync(join(V3_DIR, 'src'), join(dir, 'src'), { recursive: true, filter: (p) => !p.includes(`${join('src', 'assets')}`) });
  return { side: await loadSide(dir), dispose: () => rmSync(dir, { recursive: true, force: true }) };
}
// Every V3-only (config, seed, script) row, side a against side b.
export function v3Rows(a, b) {
  const rows = [];
  for (const config of CONFIGS) for (const seed of config.seeds) for (const script of V3_SCRIPTS) rows.push(compare(a, b, config, seed, script));
  return rows;
}
export const V3_GOLDEN = join(HERE, 'v3-golden.json');
export const readV3Golden = () => readJson(V3_GOLDEN);

// Every (config, seed, script) row, side a against side b.
export function allRows(a, b) {
  const rows = [];
  for (const config of CONFIGS) for (const seed of config.seeds) for (const script of SCRIPTS) rows.push(compare(a, b, config, seed, script));
  return rows;
}
