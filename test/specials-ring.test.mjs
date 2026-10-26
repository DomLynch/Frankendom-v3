// The specials (Dom 2026-10-26): the hero's specials every 9 s with no stamina (data/fight.json specialTerms, src/fight/special-terms.ts;
// ?spec=v1 = V1's 6 s / 15 s and the Whirlwind's 40 stamina), and the honest SPECIAL buttons (combat.ts specialReadiness): the ready ring
// lights exactly when a press now would be taken by the sim — cooldown, stamina, reach, the post-strike recovery and the buffer rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialPractice, stepPractice, accepts, specialReach, specialReadiness, clarityOf } from '../src/fight/combat.ts';
import { OPPONENTS, RULES, SKILL_ROWS, opponentAt, profileAt, specialOf } from '../src/fight/moves.ts';
import { distance, inBufferWindow, legal } from '../src/fight/duel.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../src/fight/play-radius.ts';
import { setStab } from '../src/fight/stab-rule.ts';
import { setStanceRows } from '../src/fight/stance-era.ts';
import { setSpecialPace, specialPaceFor } from '../src/fight/special-pace.ts';
import { setSpecialTerms, specialTermsFor } from '../src/fight/special-terms.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
// Re-pinned 2026-10-26 (fix-forward, Dom's Pitborn call): these are the HERO's special rules, scripted against the Centurion they were written
// on (data/fight.json opponentV1, still the page's fight under ?pitborn=v1). The Pitborn (the default since) whips the scripted Skull Crack's
// windup and hits through it (SpecialInterrupted), so "counted from the strike" never reaches its strike; the rules under test are the same
// for both. The ring-never-lies sweep runs against both opponents.
const HERO_RULES_FOE = FIGHT.opponentV1.opponent;
let foeId = HERO_RULES_FOE, opponent = OPPONENTS[foeId], profile = profileAt(opponent, FIGHT.level);
const use = (id) => { foeId = id; opponent = OPPONENTS[id]; profile = profileAt(opponent, FIGHT.level); };

// The page fight as src/client/main.ts starts it, under the flags `search` picks.
function fight(search = '') {
  setPlayScale(playScaleFor(foeId, Infinity)); setLateNotice(true); setStab(true); setStanceRows(true);
  setSpecialPace(specialPaceFor(FIGHT.specialPace, search)); setSpecialTerms(specialTermsFor(FIGHT.specialTerms, search));
  const aiSkill = Object.values(SKILL_ROWS).find((r) => r.opponent === foeId)?.id ?? null, name = specialOf(foeId, FIGHT.level);
  return initialPractice(FIGHT.seed, opponentAt(opponent, FIGHT.level), FIGHT.weapon, FIGHT.skill,
    { level: FIGHT.level, aiSkill, ...(name ? { name } : {}) }, undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2);
}
const off = () => { setSpecialPace(null); setSpecialTerms(null); };
const step = (p, action = null, walk = false) => {
  const h = p.duel.fighters[0], gap = distance(h.body, p.duel.fighters[1].body);
  return stepPractice(p, quantizeIntent({ move: { x: 0, z: walk && gap > 1.6 ? 1 : 0, yaw: 0, run: false }, action, guard: false, lock: true }), profile);
};
// A copy of the practice with fighter 0 (and optionally the foe's position) edited: a state the sim could hold, to probe one gate.
const edit = (p, hero, foeAt) => {
  const [h, w] = p.duel.fighters;
  const foe = foeAt === undefined ? w : { ...w, body: { ...w.body, x: h.body.x + Math.sin(h.body.heading) * foeAt, z: h.body.z + Math.cos(h.body.heading) * foeAt } };
  return { ...p, duel: { ...p.duel, fighters: [{ ...h, ...hero }, foe] } };
};
// Draw, walk in and stand until `until` holds.
function settle(p, until, max = 900) {
  for (let t = 0; t < max; t++) { if (until(p, t)) return p; p = step(p, t === 2 ? 'light' : null, true); }
  throw Error('never settled');
}
const started = (p, slot) => p.events.some((e) => e.actor === 0 && (slot === 'skill' ? e.type === 'SpecialStarted' : e.type === 'AttackStarted' && e.move === 'skill_reaping'));

test('the data rows: 540 ticks and 0 stamina; ?spec=v1 = none (V1\'s numbers)', () => {
  assert.equal(FIGHT.skill, 'cleave'); assert.equal(FIGHT.skill2, 'reaping');
  assert.deepEqual(specialTermsFor(FIGHT.specialTerms, ''), { cooldown: 540, stamina: 0 });
  assert.equal(specialTermsFor(FIGHT.specialTerms, '?spec=v1'), null);
  assert.equal(specialTermsFor(FIGHT.specialTerms, '?ring=v1&spec=v1'), null);
  assert.throws(() => specialTermsFor({ cooldown: 0, stamina: 0 }), /positive/);
  assert.equal(RULES.skillCooldown, 900, "V1's Whirlwind cooldown (15 s)");
});

for (const [label, search, cool2, cool1, cost] of [['default', '', 540, 540, 0], ['?spec=v1', '?spec=v1', 900, 360, 40]]) {
  test(`Whirlwind and Skull Crack cooldowns and stamina, ${label}`, () => {
    let p = settle(fight(search), (q) => { const h = q.duel.fighters[0]; return h.phase === 'ready' && !h.skillCooldown2 && distance(h.body, q.duel.fighters[1].body) < 2; });
    const before = p.duel.fighters[0].stamina;
    p = step(p, 'skill2');
    assert.ok(started(p, 'skill2'), 'the Whirlwind started');
    assert.equal(p.duel.fighters[0].skillCooldown2, cool2, 'counted from the press');
    if (cost) assert.ok(p.duel.fighters[0].stamina <= before - cost + 1, `spent ${cost}`); else assert.ok(p.duel.fighters[0].stamina >= before, 'no stamina spent');
    // The Skull Crack: from its release (the strike), on slot a.
    let q = settle(fight(search), (x) => { const h = x.duel.fighters[0]; return h.phase === 'ready' && !h.skillCooldown && distance(h.body, x.duel.fighters[1].body) < 2; });
    q = step(q, 'skill'); assert.ok(started(q, 'skill'), 'the Skull Crack started');
    for (let t = 0; t < 60 && q.duel.fighters[0].special; t++) q = step(q);
    assert.equal(q.duel.fighters[0].skillCooldown, cool1, 'counted from the strike');
    assert.ok(q.duel.fighters[0].specialRecover > 0, 'the post-strike recovery is kept');
    off();
  });
}

test('the Whirlwind fires twice 540 ticks apart (default), and not before', () => {
  let p = settle(fight(), (q) => { const h = q.duel.fighters[0]; return h.phase === 'ready' && !h.skillCooldown2 && distance(h.body, q.duel.fighters[1].body) < 2; });
  p = step(p, 'skill2'); assert.ok(started(p, 'skill2'));
  const first = p.duel.tick;
  let second = -1;
  for (let t = 0; t < 900 && second < 0 && p.playerHealth && p.health; t++) {
    const press = p.duel.tick - first >= 520 ? 'skill2' : null;   // pressed every tick from 520: the sim takes it the first tick it is legal
    if (press && p.duel.tick - first < 540) assert.equal(specialReadiness(p.duel, 'skill2').reason === 'cooldown' || !specialReadiness(p.duel, 'skill2').ready, true);
    p = stepPractice(p, quantizeIntent({ move: { x: 0, z: 0, yaw: 0, run: false }, action: press, guard: !press, lock: true }), profile);   // guard held while waiting
    if (started(p, 'skill2')) second = p.duel.tick;
  }
  assert.ok(second > 0, 'a second Whirlwind');
  assert.ok(second - first >= 540 && second - first <= 600, `${second - first} ticks apart`);
  off();
});

test('zero stamina: a hero at 5 stamina may Whirlwind; under ?spec=v1 he may not, and the helper says why', () => {
  for (const [search, ok] of [['', true], ['?spec=v1', false]]) {
    const p = edit(settle(fight(search), (q) => q.duel.fighters[0].phase === 'ready' && !q.duel.fighters[0].skillCooldown2), { stamina: 5 });
    assert.equal(legal(p.duel.fighters[0], 'skill2'), ok, search);
    const r = specialReadiness(p.duel, 'skill2');
    assert.equal(r.ready, ok); assert.equal(r.reason, ok ? null : 'stamina'); assert.equal(r.short, !ok);
    off();
  }
});

test('helper: cooldown reason and fraction', () => {
  const p = settle(fight(), (q) => q.duel.fighters[0].phase === 'ready');
  const r = specialReadiness(edit(p, { skillCooldown2: 270 }).duel, 'skill2');
  assert.equal(r.ready, false); assert.equal(r.reason, 'cooldown'); assert.equal(r.cooldownLeft, 270);
  assert.ok(Math.abs(r.cooldownFrac - 0.5) < 1e-9, `half of 540: ${r.cooldownFrac}`);
  const first = specialReadiness(fight().duel, 'skill2');   // tick 0: the 2 s first-ready window
  assert.equal(first.reason, 'cooldown'); assert.equal(first.cooldownFrac, 0);
  off();
});

test("helper: the Skull Crack's reach is the sim's 2.2 m, not the 1.6 m cone row", () => {
  const p = settle(fight(), (q) => q.duel.fighters[0].phase === 'ready' && !q.duel.fighters[0].skillCooldown);
  assert.equal(specialReach(p.duel.fighters[0]), 2.2);
  const at = (gap) => specialReadiness(edit(p, {}, gap).duel, 'skill');
  assert.equal(at(2.0).ready, true, '2.0 m: past the old 1.6 m dim, the sim takes it');
  assert.equal(at(2.4).ready, false); assert.equal(at(2.4).reason, 'range');
  // and the sim agrees: at 2.4 m the press is refused with the "far" cue, at 2.0 m it starts
  assert.ok(step(edit(p, {}, 2.4), 'skill').events.some((e) => e.type === 'SpecialRefused' && e.actor === 0));
  assert.ok(step(edit(p, {}, 2.0), 'skill').events.some((e) => e.type === 'SpecialStarted' && e.actor === 0));
  assert.equal(specialReadiness(edit(p, {}, 2.4).duel, 'skill2').ready, true, 'the Whirlwind has no range gate');
  off();
});

test('helper: the buffer window — lit in a swing tail only when the queued press will fire', () => {
  let p = settle(fight(), (q) => q.duel.fighters[0].phase === 'ready' && !q.duel.fighters[0].skillCooldown2 && q.duel.tick > 200);
  p = step(p, 'light');
  for (let t = 0; t < 120 && !inBufferWindow(p.duel.fighters[0]); t++) p = step(p);
  assert.ok(inBufferWindow(p.duel.fighters[0]) && p.duel.fighters[0].phase === 'attack', 'in the tail of the light swing');
  assert.equal(specialReadiness(p.duel, 'skill2').ready, true, 'cooled: the queued Whirlwind will fire');
  const cooling = edit(p, { skillCooldown2: 200 });
  assert.equal(accepts(cooling, 'skill2'), true, "accepts() lights the whole tail (today's lie)");
  assert.equal(specialReadiness(cooling.duel, 'skill2').ready, false); assert.equal(specialReadiness(cooling.duel, 'skill2').reason, 'cooldown');
  off();
});

// The ring never lies: from every state of a scripted fight, press once and watch the next bufferTtl ticks. ready <=> the special starts
// (the Skull Crack's far refusal counts as not taken). A hit on the hero in that span clears any buffer, so those probes are skipped.
// Against the Pitborn the scripted fight is shorter (he kills or is killed sooner): ~410-440 probes, so his floor is 400.
for (const [foe, floor] of [[HERO_RULES_FOE, 500], [FIGHT.opponent, 400]]) for (const search of ['', '?spec=v1']) for (const slot of ['skill', 'skill2']) {
  test(`the ring never lies: ${slot}, ${search || 'default'}, vs ${foe}`, (t) => {
    use(foe); t.after(() => use(HERO_RULES_FOE));
    let p = fight(search), checked = 0, lit = 0;
    for (let t = 0; t < 2400 && p.health && p.playerHealth; t++) {
      if (t > 60 && p.duel.fighters[0].phase !== 'hurt' && p.duel.fighters[0].phase !== 'sheathed' && p.duel.fighters[0].phase !== 'draw') {
        const r = specialReadiness(p.duel, slot), reach = slot === 'skill' ? specialReach(p.duel.fighters[0]) : null;
        const side = (x) => reach !== null && distance(x.duel.fighters[0].body, x.duel.fighters[1].body) > reach;
        let q = step(p, slot), fired = started(q, slot), hurt = q.duel.fighters[0].phase === 'hurt', crossed = false;
        for (let k = 0; k < RULES.bufferTtl + 1 && !fired && !hurt; k++) { q = step(q); fired = started(q, slot); hurt ||= q.duel.fighters[0].phase === 'hurt'; crossed ||= side(q) !== side(p); }
        // A queued Skull Crack is judged for reach when it fires, not when pressed: a foe crossing the 2.2 m edge inside the queue is unknowable at the press.
        if ((!hurt || fired) && !crossed) { assert.equal(fired, r.ready, `tick ${p.duel.tick}: ready ${r.ready} (${r.reason}) but the press ${fired ? 'fired' : 'was dropped'}; phase ${p.duel.fighters[0].phase} age ${p.duel.fighters[0].age}`); checked++; lit += r.ready ? 1 : 0; }
      }
      const press = t === 2 ? 'light' : t > 60 && t % 23 === 0 ? 'light' : t > 60 && t % 97 === 0 ? 'heavy' : null;
      p = step(p, press, true);
    }
    assert.ok(checked > floor && lit > 20, `${checked} probes, ${lit} lit`);
    off();
  });
}

test('a buffered special the sim drops shakes its button (PressRefused), like an immediate refusal', () => {
  let p = settle(fight(), (q) => q.duel.fighters[0].phase === 'ready' && q.duel.tick > 200);
  p = step(edit(p, { skillCooldown2: 300 }), 'light');
  for (let t = 0; t < 120 && !inBufferWindow(p.duel.fighters[0]); t++) p = step(p);
  p = step(p, 'skill2');
  assert.ok(!p.clarity.some((c) => c.type === 'PressRefused'), 'queued, not refused, at the press');
  assert.ok(p.duel.fighters[0].buffer?.action === 'skill2', 'the press is queued');
  let refused = false;
  for (let t = 0; t < RULES.bufferTtl + 2 && !refused; t++) { p = step(p); refused = p.clarity.some((c) => c.type === 'PressRefused' && c.action === 'skill2'); }
  assert.ok(refused, 'the dropped press is reported');
  assert.equal(typeof clarityOf, 'function');
  off();
});
