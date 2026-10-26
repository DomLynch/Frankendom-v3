// The opponent's melee special obeys the player's reach rules (data/fight.json foeSpecialReach, src/fight/foe-special-reach.ts): pressed only
// inside 2.2 m, fizzles (SpecialFizzled, no damage) when the hero is past 2.6 m at release; ?special=v1 = V1's 3.0 m start and no release check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { OPPONENTS, opponentAt, profileAt } from '../src/fight/moves.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { recordSpecials } from '../src/fight/replay.ts';
import { brainFor, brainProfile } from '../src/brain.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../src/fight/play-radius.ts';
import { setStab } from '../src/fight/stab-rule.ts';
import { setStanceRows } from '../src/fight/stance-era.ts';
import { setFoeSpecialReach, foeSpecialReachFor, foeStartReach, foeSpecialFizzles } from '../src/fight/foe-special-reach.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const BRAINS = JSON.parse(readFileSync(new URL('../data/brains.json', import.meta.url), 'utf8'));

// The page fight (src/client/main.ts fresh()) with the hero idle; at each foe special the hero is held `D` metres away (as scratchpad sim did for the audit).
function specials(search, D, ticks = 40000) {
  setPlayScale(playScaleFor(FIGHT.opponent, Infinity)); setLateNotice(true); setStab(true); setStanceRows(true);
  setFoeSpecialReach(foeSpecialReachFor(FIGHT.foeSpecialReach, search));
  const opponent = OPPONENTS[FIGHT.opponent];
  let p = initialPractice(FIGHT.seed, opponentAt(opponent, FIGHT.level), FIGHT.weapon, FIGHT.skill, recordSpecials({ specials: true, level: FIGHT.level, opponent: FIGHT.opponent }), undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2);
  const ai = brainProfile(profileAt(opponent, FIGHT.level), brainFor(BRAINS.brains, FIGHT.ai, search));
  const out = { started: 0, landed: 0, fizzled: 0, damage: 0, startGap: 0, hitOnFizzle: 0 };
  let live = false;
  try {
    for (let t = 0; t < ticks; t++) {
      p = stepPractice(p, quantizeIntent({ move: { x: 0, z: 0, yaw: 0, run: false }, action: p.phase === 'sheathed' && !p.finish ? 'light' : null, guard: false, lock: true }), ai);
      const [h, f] = p.duel.fighters, gap = Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z);
      for (const e of p.events) {
        if (e.actor !== 1) continue;
        if (e.type === 'SpecialStarted') { out.started++; live = true; out.startGap = Math.max(out.startGap, gap); }
        if (e.type === 'SpecialLanded') { out.landed++; out.damage += e.damage; live = false; }
        if (e.type === 'SpecialFizzled') { out.fizzled++; live = false; if (p.events.some((x) => x.type === 'Staggered' || (x.type === 'SpecialLanded' && x.actor === 1))) out.hitOnFizzle++; }
      }
      h.health = h.maxHealth;
      if (live && D && gap < D) { const ux = (h.body.x - f.body.x) / (gap || 1), uz = (h.body.z - f.body.z) / (gap || 1); h.body = { ...h.body, x: f.body.x + ux * D, z: f.body.z + uz * D }; }
      if (!live && f.phase === 'ready' && !f.special && f.skillCooldown > 0 && t % 200 === 0) f.skillCooldown = 0;
    }
  } finally { setFoeSpecialReach(null); }
  return out;
}

test('the data row and the toggle: 2.2 m start, 2.6 m release; ?special=v1 and on 0 = off', () => {
  assert.deepEqual(foeSpecialReachFor(FIGHT.foeSpecialReach, ''), { start: 2.2, release: 2.6 });
  assert.equal(foeSpecialReachFor(FIGHT.foeSpecialReach, '?special=v1'), null);
  assert.equal(foeSpecialReachFor({ ...FIGHT.foeSpecialReach, on: 0 }, ''), null);
  assert.throws(() => foeSpecialReachFor({ on: 1, start: 0, release: 2 }), /positive/);
  assert.throws(() => foeSpecialReachFor({ on: 1, start: 2.2, release: 2 }), /at least/);
});

test('the rule is off by default (headless / Gate 0 never set it) and applies to a plain foe melee special only', () => {
  assert.equal(foeStartReach({}, false, 3), 3);
  assert.equal(foeSpecialFizzles({}, false, 9), false);
  setFoeSpecialReach({ start: 2.2, release: 2.6 });
  try {
    assert.equal(foeStartReach({}, false, 3), 2.2);
    assert.equal(foeSpecialFizzles({}, false, 2.7), true);
    assert.equal(foeSpecialFizzles({}, false, 2.6), false);
    assert.equal(foeStartReach({ picked: true }, false, 3), 3, 'the player\'s own special keeps its sandbox rule');
    assert.equal(foeStartReach({ spell: {} }, false, 3), 3, 'a spell keeps its range rows');
    assert.equal(foeStartReach({ bowSpecial: 'x' }, false, 3), 3, 'a bow volley keeps its own');
    assert.equal(foeStartReach({}, true, 3), 3, 'a cone breath keeps its range');
    assert.equal(foeSpecialFizzles({}, true, 9), false);
  } finally { setFoeSpecialReach(null); }
});

test('the Pitborn\'s special: held at 3.5 m it never lands (all fizzle, no damage); at 2.0 m it lands; ?special=v1 lands from 3.5 m', () => {
  const far = specials('', 3.5), near = specials('', 2.0), v1 = specials('?special=v1', 3.5);
  // (one special may still be winding up when the run ends: resolved = started or started - 1)
  assert.ok(far.started >= 5 && far.landed === 0 && far.damage === 0 && far.fizzled >= far.started - 1, JSON.stringify(far));
  assert.equal(far.hitOnFizzle, 0);
  assert.ok(near.started >= 5 && near.landed >= near.started - 1 && near.fizzled === 0 && near.damage > 0, JSON.stringify(near));
  assert.ok(v1.started >= 5 && v1.landed >= v1.started - 1 && v1.fizzled === 0, JSON.stringify(v1));
  assert.ok(far.startGap <= 2.2 + 1e-9, `he only starts inside 2.2 m (${far.startGap})`);
});
