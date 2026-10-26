// Dom's picked hero clips (data/hero-clips.json): baked into warrior.glb beside V1's own, V1's clips untouched (so ?clips=v1 is today's
// clips exactly), and a sim sweep for every path a row names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLADE_PICKS } from '../src/fight/blade-picks.ts';
import { bladePathsByRig } from '../src/fight/blade-paths.ts';
import { WEAPONS, total } from '../src/fight/moves.ts';
import { pullbackFor, reachFor, sweepTableFor } from '../src/hero-reach.ts';
import { guardClipTime } from '../src/fight/guard-hold.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROWS = JSON.parse(readFileSync(new URL('../data/hero-clips.json', import.meta.url), 'utf8'));
const glb = (bytes) => { const n = bytes.readUInt32LE(12); return { j: JSON.parse(bytes.subarray(20, 20 + n)), bin: bytes.subarray(28 + n) }; };
const now = glb(readFileSync(new URL('../src/assets/warrior.glb', import.meta.url)));
// One animation as data: per channel, its target joint name, path and the raw bytes of its keys and values.
const clipData = ({ j, bin }, an) => an.channels.map((c) => {
  const s = an.samplers[c.sampler], bytes = (ai) => { const a = j.accessors[ai], v = j.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); return bin.subarray(o, o + v.byteLength).toString('base64'); };
  return `${j.nodes[c.target.node].name}.${c.target.path}:${bytes(s.input)}:${bytes(s.output)}`;
});

test('every picked clip is in warrior.glb: all 65 joints and the pelvis height, as long as its row cuts it', () => {
  const joints = now.j.skins[0].joints.length;
  for (const r of ROWS.clips) {
    const an = now.j.animations.find((a) => a.name === r.clip);
    assert.ok(an, `${r.clip} is baked (scripts/hero-clips/build.py)`);
    assert.equal(an.channels.filter((c) => c.target.path === 'rotation').length, joints, `${r.clip}: a rotation track per joint`);
    assert.ok(an.channels.some((c) => c.target.path === 'translation' && now.j.nodes[c.target.node].name === 'pelvis'), `${r.clip}: pelvis height`);
    const end = Math.max(...an.samplers.map((s) => now.j.accessors[s.input].max[0]));
    assert.ok(Math.abs(end - (r.to - r.from)) < 1e-3, `${r.clip}: ${end} s, row ${r.to - r.from} s`);
    if (r.role === 'Guard') continue;   // a guard has no contact key (its held block is the last key) and no sweep
    const source = (r.contact - r.from) / (r.to - r.from);
    assert.ok(source > 0 && source < 1, `${r.clip}: contact key inside the clip`);
  }
});

test("the picked guard (Dom 2026-10-26, Great Sword Blocking): one row, held by its `hold`, no contact key, no sweep", () => {
  const guards = ROWS.clips.filter((r) => r.role === 'Guard');
  assert.equal(guards.length, 1);
  const [g] = guards;
  assert.equal(g.mixamo, '122380901');
  assert.deepEqual(g.paths, [], 'a guard never sweeps a blade (the sim hits with attack paths only)');
  assert.equal(g.contact, undefined);
  assert.deepEqual(Object.keys(g.hold).sort(), ['knock', 'period', 'raise', 'sway']);
  for (const k of Object.keys(g.hold)) assert.ok(g.hold[k] > 0, `hold.${k}`);
  assert.ok(g.hold.sway + g.hold.knock < g.to - g.from, 'the sway and the knock stay inside the clip');
});

test('the held guard: the clip into the block over `raise`, then held at the last key with a sway, a blocked hit knocks it back and re-sets it', () => {
  const hold = { raise: 0.15, sway: 0.06, period: 3.2, knock: 0.12 }, d = 0.5, end = 0.499;
  assert.equal(guardClipTime(hold, d, end, 0), 0, 'the first guard frame is the clip\'s first key');
  assert.ok(Math.abs(guardClipTime(hold, d, end, 0.075) - 0.25) < 1e-9, 'half the raise = half the clip');
  assert.equal(guardClipTime(hold, d, end, 0.15), end, 'raised: the block (the last key, clamped)');
  assert.ok(Math.abs(guardClipTime(hold, d, end, 0.15 + 1.6) - (d - 0.06)) < 1e-9, 'half a sway period: `sway` back into the settle');
  assert.equal(guardClipTime(hold, d, end, 0.15 + 3.2), end, 'a full period: back on the block');
  assert.ok(Math.abs(guardClipTime(hold, d, end, 5, 0.5) - (guardClipTime(hold, d, end, 5) - 0.12)) < 1e-9, 'mid-impact: knocked back `knock`');
  assert.equal(guardClipTime(hold, d, end, 0.15, 1), end, 'impact over: re-set');
});

test("V1's own clips are still in warrior.glb, byte for byte (?clips=v1 plays them)", () => {
  let v1;
  try { v1 = glb(execFileSync('git', ['show', 'v1-seed-82a994d15:src/assets/warrior.glb'], { cwd: ROOT, maxBuffer: 1 << 26 })); }
  catch { return assert.fail('the seed tag is not in this checkout: git fetch --no-tags --depth=1 origin refs/tags/v1-seed-82a994d15:refs/tags/v1-seed-82a994d15'); }
  assert.equal(v1.j.animations.length + ROWS.clips.length, now.j.animations.length, 'only the picked clips were added');
  for (const an of v1.j.animations) {
    const mine = now.j.animations.find((a) => a.name === an.name);
    assert.ok(mine, `${an.name} kept`);
    assert.deepEqual(clipData(now, mine), clipData(v1, an), `${an.name} unchanged`);
  }
});

test('a sim sweep for every path a row names, one pose per tick, and none for any other path or weapon', () => {
  const paths = ROWS.clips.flatMap((r) => r.paths), w = WEAPONS[ROWS.weapon];
  assert.deepEqual(Object.keys(BLADE_PICKS).sort(), [...paths].sort());
  for (const kind of paths) {
    assert.equal(BLADE_PICKS[kind].length, total(w.paths[kind]) + 1, `${kind}: ticks + 1 poses`);
    assert.equal(BLADE_PICKS[kind].length, bladePathsByRig[ROWS.rig][ROWS.weapon][kind].length, `${kind}: as long as V1's`);
    for (const pose of BLADE_PICKS[kind]) assert.ok(pose.length === 6 && pose.every(Number.isFinite), `${kind}: base and tip`);
  }
});

test("reach (Strategy 2026-10-26): V1's sweeps under the picked clips by default, the clips' own under ?reach=clip, V1's always under ?clips=v1", () => {
  assert.equal(ROWS.sweeps.default, 'v1', 'the row keeps V1\'s reach by default');
  const cases = [['', 'v1', null], ['?reach=clip', 'clip', BLADE_PICKS], ['?reach=v1', 'v1', null], ['?reach=bogus', 'v1', null],
    ['?clips=v1', 'v1', null], ['?clips=v1&reach=clip', 'v1', null], ['?gfx=v1&reach=clip', 'clip', BLADE_PICKS]];
  for (const [search, reach, sweeps] of cases) {
    assert.equal(reachFor(search), reach, search);
    assert.equal(sweepTableFor(search)?.[ROWS.rig]?.[ROWS.weapon] ?? null, sweeps, search);
    for (const r of ROWS.clips) assert.equal(pullbackFor(search, r), reach === 'v1' ? r.pullback : 0, `${search} ${r.clip} pullback`);
  }
});

test("a row's pullback is its picked sweep's tip minus V1's, forward, at the contact tick of every path it draws (to the millimetre)", () => {
  const w = WEAPONS[ROWS.weapon], v1 = bladePathsByRig[ROWS.rig][ROWS.weapon];
  for (const r of ROWS.clips) for (const kind of r.paths) {
    const c = w.paths[kind].windup, measured = BLADE_PICKS[kind][c][5] - v1[kind][c][5];
    assert.ok(Math.abs(measured - r.pullback) <= 0.001, `${r.clip} ${kind}: measured ${measured.toFixed(4)} m, row ${r.pullback}`);
  }
});
