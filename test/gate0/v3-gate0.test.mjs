// Gate 0, V3-only rows: the directional heavies (V2 PR #60) are inputs V1 never had, so V1 at the seed tag has no reference for them. Instead:
//   1. every V3-only script (v3-scripts/) replays tick for tick the same in two independent module copies of this tree (determinism);
//   2. every row stays on its pinned hash in v3-golden.json (re-pin only on purpose: node scripts/gate0-v3-golden.mjs --write);
//   3. the V3-only scripts really throw the new moves, and V1's scripts (scripts/, the V1-vs-V3 rows in gate0.test.mjs) never do.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIGS, SCRIPTS, V3_SCRIPTS, compare, describe, loadV3, loadV3Copy, readV3Golden, startedMoves } from './harness.mjs';

const v3 = await loadV3(), copy = await loadV3Copy();
after(() => copy.dispose());
const golden = readV3Golden().rows, key = (r) => `${r.config}/${r.seed}/${r.script}`, pinned = new Map(golden.map((g) => [key(g), g]));
const DIRECTIONAL = ['heavy_right', 'heavy_left', 'heavy_thrust'];

test('v3-golden.json pins exactly the V3-only rows', () => {
  const rows = CONFIGS.flatMap((c) => c.seeds.flatMap((seed) => V3_SCRIPTS.map((s) => `${c.id}/${seed}/${s.id}`)));
  assert.deepEqual([...pinned.keys()].sort(), rows.sort());
});

for (const config of CONFIGS) for (const seed of config.seeds) for (const script of V3_SCRIPTS) {
  test(`gate 0 V3-only: deterministic and pinned, ${config.id} seed ${seed} ${script.id}`, (t) => {
    const r = compare(v3, copy.side, config, seed, script), g = pinned.get(key(r));
    t.diagnostic(describe(r));
    assert.ok(r.same, describe(r));
    assert.ok(r.ticks[0] > 1, 'the script steps the fight');
    assert.deepEqual({ ticks: r.ticks[0], hash: r.hash[0], outcome: r.outcome[0] }, { ticks: g.ticks, hash: g.hash, outcome: g.outcome }, `${key(r)} is off its pinned hash (v3-golden.json)`);
  });
}

test('the directional-heavies script throws all three new moves under every config', () => {
  const script = V3_SCRIPTS.find((s) => s.id === 'directional-heavies');
  for (const config of CONFIGS) for (const seed of config.seeds) {
    const m = startedMoves(v3, config, seed, script);
    for (const id of DIRECTIONAL) assert.ok((m[id] ?? 0) > 0, `${config.id}/${seed}: no ${id} started`);
  }
});

test('V1\'s scripts never throw a directional heavy (so the V1-vs-V3 rows cannot reach them)', () => {
  for (const config of CONFIGS) for (const seed of config.seeds) for (const script of SCRIPTS) {
    const m = startedMoves(v3, config, seed, script);
    for (const id of DIRECTIONAL) assert.equal(m[id] ?? 0, 0, `${config.id}/${seed}/${script.id} started ${id}`);
  }
});
