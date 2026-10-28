// The build bundles only the blade tables the duel reads (data/fight.json bladeTables, scripts/blade-tables.mjs). bladeFrames throws on a
// missing table, so every (rig, weapon) the fight can reach must be listed: the hero's weapon, and the opponent's at every ladder level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keepBladeTables } from '../scripts/blade-tables.mjs';
import { bladePathsByRig } from '../src/fight/blade-paths.ts';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { validateFile } from '../src/sim/validate.js';
import { fightOpponent } from '../src/fight/foe-pick.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const SRC = readFileSync(new URL('../src/fight/blade-paths.ts', import.meta.url), 'utf8');
const kept = (rig, weapon) => FIGHT.bladeTables[rig]?.includes(weapon) ?? false;

test('fight.json validates with the bladeTables row', () => {
  assert.deepEqual(validateFile('fight', FIGHT), []);
});

test('every weapon the duel can reach has its table kept: the hero, and the opponent at every level (default and ?pitborn=v1)', () => {
  assert.ok(kept('hero', FIGHT.weapon), `hero/${FIGHT.weapon}`);
  for (const search of ['', '?pitborn=v1']) {
    const id = fightOpponent(FIGHT, search), o = OPPONENTS[id];
    for (let level = 1; level <= 100; level++) {
      const body = opponentAt(o, level);
      assert.ok(kept(body.rig, body.weapon), `${id} (${search || 'default'}) at level ${level}: ${body.rig}/${body.weapon}`);
    }
  }
  assert.deepEqual([fightOpponent(FIGHT, ''), fightOpponent(FIGHT, '?pitborn=v1')], ['pitborn', 'veteran']);
});

test('the cut keeps the named tables byte for byte and drops the rest', () => {
  const out = keepBladeTables(SRC, FIGHT.bladeTables);
  const table = JSON.parse(out.match(/bladePathsByRig\b[^=]*= (\{.*\});/)[1]);
  assert.deepEqual(Object.keys(table), ['hero']);
  assert.deepEqual(Object.keys(table.hero).sort(), [...FIGHT.bladeTables.hero].sort());
  for (const w of FIGHT.bladeTables.hero) assert.deepEqual(table.hero[w], bladePathsByRig.hero[w], `hero/${w}`);
  assert.ok(out.length < SRC.length * 0.33, `cut to ${out.length} of ${SRC.length} bytes`);   // 0.25 before Gargantua's maul (data/boss-weapons.json, 2026-10-28): + hero/maul, 28 KB raw / ~11 KB gzip of main.js
});

test('a named table the source lacks is an error, not a gap', () => {
  assert.throws(() => keepBladeTables(SRC, { hero: ['longsword', 'no-such-weapon'] }), /hero\/no-such-weapon/);
});
