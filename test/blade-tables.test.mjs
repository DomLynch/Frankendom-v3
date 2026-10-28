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

// The Gargantua freeze (2026-10-28): zone spawn 2 is the executioner (scythe) and the build had cut the scythe table, so bladeFrames threw inside stepDuel on his first heavy and the page stopped.
// Unit tests read the uncut source and never saw it. The zone's bosses are profile rows (data/profiles.json), not the fight row's opponent: check every profile at every level, and the
// zone's spawn kinds, against the table the BUILD keeps (keepBladeTables), not the source.
test('every profile row and every zone spawn kind has its weapon table in the BUILT bundle, at every level', () => {
  const PROFILES = JSON.parse(readFileSync(new URL('../data/profiles.json', import.meta.url), 'utf8')).profiles;
  const ZONE = JSON.parse(readFileSync(new URL('../data/zones/zone1.row.json', import.meta.url), 'utf8'));
  const built = JSON.parse(keepBladeTables(SRC, FIGHT.bladeTables).match(/bladePathsByRig\b[^=]*= (\{.*\});/)[1]);
  const kinds = new Set([...PROFILES.map((p) => p.id), ...ZONE.spawns.map((s) => s.kind)]);
  for (const kind of kinds) {
    const row = PROFILES.find((p) => p.id === kind);
    assert.ok(row, `zone kind ${kind} is a profile row`);
    for (let level = 1; level <= 100; level++) {
      const body = opponentAt(OPPONENTS[row.opponent], level);
      for (const kindOfBlow of ['light_right', 'heavy_overhead', 'thrust']) assert.ok(built[body.rig]?.[body.weapon]?.[kindOfBlow], `${kind} (${row.opponent}) at level ${level}: ${body.rig}/${body.weapon}/${kindOfBlow} is cut from the build`);
    }
  }
});

test('the cut keeps the named tables byte for byte and drops the rest', () => {
  const out = keepBladeTables(SRC, FIGHT.bladeTables);
  const table = JSON.parse(out.match(/bladePathsByRig\b[^=]*= (\{.*\});/)[1]);
  assert.deepEqual(Object.keys(table), ['hero']);
  assert.deepEqual(Object.keys(table.hero).sort(), [...FIGHT.bladeTables.hero].sort());
  for (const w of FIGHT.bladeTables.hero) assert.deepEqual(table.hero[w], bladePathsByRig.hero[w], `hero/${w}`);
  assert.ok(out.length < SRC.length * 0.33, `cut to ${out.length} of ${SRC.length} bytes`);   // 0.25 before the scythe (#193) and Gargantua's maul (data/boss-weapons.json, 2026-10-28: + hero/maul, 28 KB raw / ~11 KB gzip)
});

test('a named table the source lacks is an error, not a gap', () => {
  assert.throws(() => keepBladeTables(SRC, { hero: ['longsword', 'no-such-weapon'] }), /hero\/no-such-weapon/);
});
