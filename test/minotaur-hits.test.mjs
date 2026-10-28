// Dom 2026-10-28: "against the Minotaur my sword attacks did nothing, specials and the kick worked". DATA-DRIVEN: every hero weapon (the fight row's, every data/progression.json unlock and every
// weapon-defs row with a `player` slot) x every star level (data/stars.json levels) x every strike the weapon has, against every boss kind on the Minotaur's archetype (data/profiles.json),
// built by the real kind builder (src/fight/spawn-kind.ts, stars and the kill-ladder escalation laid on as the page lays them) with his cleaver sweep override laid on as the zone lays it.
// Each combination must land damage > 0 (HP drops); the Gargantua (the other boss body) is the control. Plus the real hand-over: kills 1 and 2 saved, the hero's weapon from heroWeapon().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSweepOverride } from '../src/fight/blade.ts';
import { stepDuel, idleIntent } from '../src/fight/duel.ts';
import { foeSweepsFor } from '../src/fight/foe-reach.ts';
import { WEAPONS, NATURAL_WEAPONS } from '../src/fight/moves.ts';
import { DIRECTIONAL_HEAVY_IDS } from '../src/fight/move-rows.ts';
import { kindTable, kindPractice } from '../src/fight/spawn-kind.ts';
import { escalation, freshSave, recordKill, heroWeapon } from '../src/progression.ts';
import { readData } from './helpers/boss-rows.mjs';

const FIGHT = readData('fight'), PROFILES = readData('profiles'), DIFF = readData('difficulty'), BRAINS = readData('brains'), STARS = readData('stars'), PROG = readData('progression');
const ctxOf = (weapon, tune) => ({ profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null,
  weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, stars: STARS, tune });
const HERO_WEAPONS = [...new Set([FIGHT.weapon, ...PROG.bosses.map((b) => b.weapon), ...readData('../src/fight/weapon-defs').weapons.filter((w) => w.player != null && !NATURAL_WEAPONS.has(w.id) && WEAPONS[w.id]).map((w) => w.id)])];
const STAR_LEVELS = STARS.levels.map((l) => l.star);
const MINOTAUR_ARCHETYPE = PROFILES.profiles.find((q) => q.id === FIGHT.order.kinds['yard-pitborn']).opponent;   // the zone row's yard spawn kind
const MINOTAUR_KINDS = PROFILES.profiles.filter((p) => p.opponent === MINOTAUR_ARCHETYPE).map((p) => p.id);
const CONTROL = FIGHT.order.profile;   // the zone's first boss (the Gargantua): another body, the same blows
const GAPS = [1.0, 1.3, 1.6, 1.9];
/** The strikes the hero can send: the plain light and heavy, the stab, the kick, the two sidelong lights and the directional heavies (the Action ids of src/fight/duel.ts a press names). */
const STRIKES = ['light', 'light_left', 'light_right', 'heavy', 'thrust', 'kick', ...DIRECTIONAL_HEAVY_IDS.map((m) => m.replace(/^heavy_overhead$/, 'heavy'))];

/** Damage the hero's `action` deals a standing `kind` at star `star` at `gap` metres (the boss does nothing), by the real kind builder. */
function dealt({ weapon, kind, star, action, gap, tune }) {
  const ctx = ctxOf(weapon, tune), k = kindTable(ctx)(kind, star);
  setSweepOverride(foeSweepsFor(FIGHT.foeReach, '', k.opponentId));
  try {
    let d = kindPractice(k, ctx, FIGHT.seed).duel;
    const [h, f] = d.fighters;
    d = { ...d, fighters: [{ ...h, phase: 'ready', body: { x: 0, z: 0, heading: 0, distance: 0 } }, { ...f, phase: 'ready', body: { x: 0, z: gap, heading: Math.PI, distance: 0 } }] };
    const hp0 = d.fighters[1].health;
    let total = 0;
    for (let t = 0; t < 160; t++) {
      d = stepDuel(d, [{ ...idleIntent(), action: t === 0 ? action : null }, idleIntent()]);
      for (const e of d.events) if (e.type === 'Hit' && e.actor === 0) total += e.damage ?? 0;
    }
    return { total, hpDrop: hp0 - d.fighters[1].health };
  } finally { setSweepOverride(null); }
}
const lands = (args) => GAPS.some((gap) => { const r = dealt({ ...args, gap }); return r.total > 0 && r.hpDrop > 0; });

test('every hero weapon x star level x strike lands damage on every Minotaur kind (the Gargantua is the control)', () => {
  const matrix = [];
  for (const weapon of HERO_WEAPONS) for (const star of STAR_LEVELS) for (const action of STRIKES) for (const kind of [...MINOTAUR_KINDS, CONTROL]) {
    const ok = lands({ weapon, star, action, kind });
    matrix.push(`${weapon} s${star} ${action} ${kind}: ${ok ? 'hit' : 'NO DAMAGE'}`);
  }
  console.log(`matrix ${HERO_WEAPONS.length} weapons x ${STAR_LEVELS.length} stars x ${STRIKES.length} strikes x ${MINOTAUR_KINDS.length + 1} kinds = ${matrix.length}; failures: ${matrix.filter((m) => m.endsWith('NO DAMAGE')).length}`);
  assert.deepEqual(matrix.filter((m) => m.endsWith('NO DAMAGE')), []);
});

test('the real hand-over: kills 1 and 2 saved, each weapon the hero can hold lands every strike on the Minotaur at every star', () => {
  let save = freshSave();
  for (const boss of PROG.bosses.slice(0, 2)) save = recordKill(save, boss.id, PROG).save;
  const tune = escalation(save, PROG);
  const held = [heroWeapon(save, PROG, FIGHT.weapon, HERO_WEAPONS, ''), ...save.unlocked.map((w) => heroWeapon(save, PROG, FIGHT.weapon, HERO_WEAPONS, `?${PROG.weaponQuery}=${w}`))];
  assert.equal(held[0], PROG.autoEquip ? save.unlocked.at(-1) : FIGHT.weapon, 'the hero keeps the fight row weapon unless autoEquip');
  const fails = [];
  for (const weapon of new Set(held)) for (const star of STAR_LEVELS) for (const action of STRIKES) for (const kind of MINOTAUR_KINDS)
    if (!lands({ weapon, kind, star, action, tune })) fails.push(`${weapon} s${star} ${action} ${kind}`);
  assert.deepEqual(fails, []);
});
