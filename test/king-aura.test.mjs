// THE KING's AURA (src/fight/mechanics/king-aura.ts, data/mechanics.json "king-aura"): schema, the pure rules (radius, period, wave, damage, shrink, regen), the registry and the ring row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkKingAura, validateFile, validateMechanics } from '../src/sim/validate.js';
import { auraLive, auraPeriod, auraPhase, auraRadius, step } from '../src/fight/mechanics/king-aura.ts';
import { MECHANICS, createMechanics, setMechanicScale } from '../src/fight/mechanics/index.ts';
import { initialPractice, project, stepPractice } from '../src/fight/combat.ts';
import { idleIntent } from '../src/fight/duel.ts';
import { startAction } from '../src/auto-start.ts';
import { OPPONENTS } from '../src/fight/moves.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const FILE = read('mechanics'), ROW = FILE.mechanics['king-aura'], RINGS = read('rings');
const KINDS = read('profiles').profiles.map((p) => p.id);

// A practice at `tick` with the hero `gap` metres from the King (on the x axis).
const at = (gap, tick, over = {}, kingOver = {}, base = initialPractice(731, OPPONENTS.pitborn)) => {
  const [h, k] = base.duel.fighters;
  const hero = { ...h, body: { ...h.body, x: gap, z: 0 }, phase: 'ready', ...over }, king = { ...k, body: { ...k.body, x: 0, z: 0 }, ...kingOver };
  return project({ ...base.duel, tick, fighters: [hero, king], events: [], finish: null }, base.ai);
};
const FIRST_QUIET = ROW.tickEveryTicks + 1;   // a tick that is neither a damage tick nor in the wave (and not 0 mod the period)

test('data/mechanics.json validates and every registered mechanic has a row, a spec and a ring boss', () => {
  assert.deepEqual(validateFile('mechanics', FILE), []);
  assert.deepEqual(validateMechanics(FILE, KINDS), []);
  assert.deepEqual(Object.keys(MECHANICS).sort(), ['gourd-bombs', 'king-aura']);
  for (const [id, row] of Object.entries(FILE.mechanics)) assert.ok(MECHANICS[row.type], `${id} has code for type ${row.type}`);
  assert.equal(ROW.type, 'king-aura'); assert.equal(ROW.boss, 'big-vegas');
  assert.equal(RINGS.bosses.find((b) => b.mechanic === 'king-aura').kind, 'big-vegas');
});

test('the schema refuses an unknown mechanic, an unknown key, a missing key, a bad range and a bad order', () => {
  const bad = (edit) => { const f = clone(FILE); edit(f.mechanics['king-aura']); return validateMechanics(f, KINDS).join('\n'); };
  assert.match(bad((r) => { r.type = 'spin'; }), /king-aura\.type: one of/);
  assert.match(bad((r) => { r.extra = 1; }), /king-aura\.extra: unknown key/);
  assert.match(bad((r) => { delete r.regenFactor; }), /king-aura\.regenFactor: must be a number/);
  assert.match(bad((r) => { r.regenFactor = 2; }), /regenFactor: must be a number in 0\.\.1/);
  assert.match(bad((r) => { r.tickEveryTicks = 1.5; }), /tickEveryTicks: must be a whole number/);
  assert.match(bad((r) => { r.minRadiusMetres = 9; }), /minRadiusMetres must not exceed radiusMetres/);
  assert.match(bad((r) => { r.pulseWaveTicks = 250; }), /pulseWaveTicks must not exceed frenzyPeriodTicks/);
  assert.match(bad((r) => { r.look.core = 'gold'; }), /look\.core: a #rrggbb colour/);
  assert.match(bad((r) => { delete r.look; }), /king-aura\.look: missing/);
  assert.match(bad((r) => { r.boss = 'nobody'; }), /no data\/profiles\.json row/);
  assert.match(checkKingAura('king-aura', { ...ROW, tickDamageFraction: 'big' }).join('\n'), /tickDamageFraction/);
});

test('a second mechanics row for the same boss is refused (the registry picks one runtime per row.boss)', () => {
  const dup = clone(FILE); dup.mechanics['king-aura-2'] = clone(dup.mechanics['king-aura']);
  assert.match(validateMechanics(dup, KINDS).join('\n'), /mechanics\.king-aura-2\.boss: "big-vegas" already has the row king-aura/);
  const cross = clone(FILE); cross.mechanics.gourd2 = { ...clone(cross.mechanics.gourd), boss: 'big-vegas' };
  assert.match(validateMechanics(cross, KINDS).join('\n'), /already has the row king-aura/, 'a Gourd-typed row naming the King collides with his aura row');
});

test('the radius shrinks with the King\'s health and the period quickens below the frenzy line', () => {
  assert.equal(auraRadius(ROW, 1), ROW.radiusMetres);
  assert.equal(auraRadius(ROW, 0), ROW.minRadiusMetres);
  assert.ok(auraRadius(ROW, 0.5) > ROW.minRadiusMetres && auraRadius(ROW, 0.5) < ROW.radiusMetres);
  assert.ok(auraRadius(ROW, 0.3) < auraRadius(ROW, 0.6), 'monotone');
  assert.equal(auraRadius(ROW, 3), ROW.radiusMetres, 'clamped');
  assert.equal(auraPeriod(ROW, 1), ROW.pulsePeriodTicks);
  assert.equal(auraPeriod(ROW, ROW.frenzyBelowFraction), ROW.pulsePeriodTicks);
  assert.equal(auraPeriod(ROW, ROW.frenzyBelowFraction - 0.01), ROW.frenzyPeriodTicks);
});

test('the pulse: a flare (the tell) in the last ticks of the period, then a wave over the first', () => {
  const P = ROW.pulsePeriodTicks;
  assert.deepEqual(auraPhase(ROW, P * 3, 1), { age: 0, tell: 0, wave: 0 });
  assert.equal(auraPhase(ROW, P * 3 + 1, 1).wave, 1 / ROW.pulseWaveTicks);
  assert.equal(auraPhase(ROW, P * 3 + ROW.pulseWaveTicks, 1).wave, 1);
  assert.equal(auraPhase(ROW, P * 3 + ROW.pulseWaveTicks + 1, 1).wave, 0);
  assert.equal(auraPhase(ROW, P * 3 + P - ROW.pulseTellTicks - 1, 1).tell, 0);
  assert.equal(auraPhase(ROW, P * 3 + P - ROW.pulseTellTicks, 1).tell, 1 / ROW.pulseTellTicks);
  assert.equal(auraPhase(ROW, P * 3 + P - 1, 1).tell, 1);
  assert.ok(auraPhase(ROW, P - 1, 1).tell > 0, 'the tell leads the wave: the flare ends where the wave begins');
});

test('inside the ring the hero loses a small tick every period of ticks, outside he loses nothing', () => {
  const inside = at(ROW.radiusMetres - 0.5, ROW.tickEveryTicks * 5 + 3 - 3), tickTick = ROW.tickEveryTicks * 5;   // 5 * 36 = 180: not 0 mod 300, outside the wave
  const out = step(inside, inside, ROW), h0 = inside.duel.fighters[0];
  assert.equal(h0.maxHealth * ROW.tickDamageFraction > 0, true);
  assert.equal(inside.duel.tick, tickTick);
  assert.equal(out.duel.fighters[0].health, h0.health - Math.max(1, Math.round(h0.maxHealth * ROW.tickDamageFraction)), 'one small tick');
  assert.ok(out.duel.fighters[0].health >= h0.health * (1 - 2 * ROW.tickDamageFraction), 'small');
  const quiet = at(ROW.radiusMetres - 0.5, tickTick + 1);
  assert.equal(step(quiet, quiet, ROW), quiet, 'a tick that is not a damage tick changes nothing (the same object)');
  const far = at(ROW.radiusMetres + 0.5, tickTick);
  assert.equal(step(far, far, ROW), far, 'outside the ring: nothing');
});

test('the damage multiplier (ring, star, Daily Pit) scales the tick and the wave', () => {
  const p = at(1, ROW.tickEveryTicks * 5), h = p.duel.fighters[0].maxHealth;
  const one = p.duel.fighters[0].health - step(p, p, ROW, 1).duel.fighters[0].health, two = p.duel.fighters[0].health - step(p, p, ROW, 3).duel.fighters[0].health;
  assert.equal(one, Math.max(1, Math.round(h * ROW.tickDamageFraction)));
  assert.equal(two, Math.max(1, Math.round(h * ROW.tickDamageFraction * 3)));
});

test('stamina regrows at regenFactor inside the ring and at full speed outside it', () => {
  const prior = at(1, FIRST_QUIET, { stamina: 50 });
  const grown = (gap) => { const s = at(gap, FIRST_QUIET, { stamina: 52 }); return step(prior, s, ROW).duel.fighters[0].stamina; };
  assert.ok(Math.abs(grown(1) - (50 + 2 * ROW.regenFactor)) < 1e-9, 'inside: the gain of 2 is slowed');
  assert.equal(grown(ROW.radiusMetres + 1), 52, 'outside: the sim\'s own regen');
  const hurt = at(1, FIRST_QUIET, { stamina: 52, phase: 'attack' });
  assert.equal(step(prior, hurt, ROW).duel.fighters[0].stamina, 52, 'only the standing regen phases are slowed');
});

test('the wave hurts what it passes once, not a roll, not outside, and never to death', () => {
  const P = ROW.pulsePeriodTicks, W = ROW.pulseWaveTicks, R = ROW.radiusMetres;   // full-health King
  const hit = (gap, extra = {}) => { let total = 0, h = at(gap, 0, extra).duel.fighters[0].health; for (let age = 1; age <= W; age++) { const p = at(gap, P * 4 + age, { health: h, ...extra }); const q = step(p, p, ROW); const lost = h - q.duel.fighters[0].health; total += lost; h = q.duel.fighters[0].health; } return total; };
  const maxHealth = at(1, 0).duel.fighters[0].maxHealth, wave = Math.max(1, Math.round(maxHealth * ROW.pulseDamageFraction));
  const tickLoss = (n) => n * Math.max(1, Math.round(maxHealth * ROW.tickDamageFraction));
  const ticksIn = Math.floor((P * 4 + W) / ROW.tickEveryTicks) - Math.floor((P * 4) / ROW.tickEveryTicks);
  assert.equal(hit(R - 0.3), wave + tickLoss(ticksIn), 'in the ring: the wave once, plus the ticks of those ticks');
  assert.equal(hit(R - 0.3, { phase: 'roll' }), tickLoss(ticksIn), 'mid-roll: the wave passes through him');
  assert.equal(hit(R + 2), 0, 'outside the ring: nothing');
  const low = at(1, P * 4 + 1, { health: 1 });
  assert.equal(step(low, low, ROW).duel.fighters[0].health, 1, 'never lethal');
});

test('the aura ends the tick the King falls and never covers a corpse, a finish or a dead hero', () => {
  const live = at(1, ROW.tickEveryTicks * 5);
  assert.equal(auraLive(live.duel), true);
  const dead = at(1, ROW.tickEveryTicks * 5, {}, { health: 0, phase: 'dead' });
  assert.equal(auraLive(dead.duel), false);
  assert.equal(step(dead, dead, ROW), dead, 'a fallen King: untouched');
  const heroDead = at(1, ROW.tickEveryTicks * 5, { health: 0, phase: 'dead' });
  assert.equal(step(heroDead, heroDead, ROW), heroDead);
  const finished = project({ ...live.duel, finish: { victim: 1, location: 'torso', move: 'light_right', heading: 0 } }, live.ai);
  assert.equal(step(finished, finished, ROW), finished);
});

test('the shrunk ring (a hurt King) reaches less far: the same spot is safe late in the fight', () => {
  const spot = (ROW.radiusMetres + ROW.minRadiusMetres) / 2 + 0.2;
  const full = at(spot, ROW.tickEveryTicks * 5), hurtKing = at(spot, ROW.tickEveryTicks * 5, {}, { health: full.duel.fighters[1].maxHealth * 0.1 });
  assert.notEqual(step(full, full, ROW), full, 'in the full ring');
  assert.equal(step(hurtKing, hurtKing, ROW), hurtKing, 'outside the shrunk ring');
});

test('a real duel through the engine: the aura costs the hero something, the same every run, and nothing once the King is down', () => {
  const run = (aura) => {
    let p = initialPractice(731, OPPONENTS.pitborn), lost = 0, ticks = 0;
    for (; ticks < 1500 && !p.finish; ticks++) {
      const stepped = stepPractice(p, { ...idleIntent(), action: startAction(true, p, null) });   // the page's auto-start draws the sword; after that the hero stands
      const next = aura ? step(p, stepped, ROW, 1) : stepped;
      lost += stepped.duel.fighters[0].health - next.duel.fighters[0].health;
      p = next;
    }
    return { p, lost, ticks };
  };
  const a = run(true), b = run(true), off = run(false);
  assert.ok(a.lost > 0, 'the aura took health through the real engine');
  assert.equal(a.lost, b.lost); assert.equal(JSON.stringify(a.p.duel.fighters[0]), JSON.stringify(b.p.duel.fighters[0]), 'deterministic: the same inputs are the same fight');
  assert.equal(off.lost, 0);
  // the King on the floor: from his last tick no further aura (the aura step is a no-op once he is down)
  const down = at(1, ROW.tickEveryTicks * 5, {}, { health: 0, phase: 'dead' });
  assert.equal(step(down, down, ROW), down);
});

test('the registry layer: another boss leaves the practice alone; the King runs the aura, wipes itself off him and resets', () => {
  const p = at(1, ROW.tickEveryTicks * 5), m = createMechanics(), aura = m.of('big-vegas');
  assert.ok(aura && aura.boss === 'big-vegas' && aura.group?.name === 'KingAura');
  assert.equal(m.tick(p, 'pumpkinhulk', true, 1 / 60), p, 'a fight with Lord Gourd: the King\'s aura is not his');
  assert.equal(aura.ctx.live, false);
  setMechanicScale(1);
  const hit = m.tick(p, 'big-vegas', true, 1 / 60);
  assert.notEqual(hit, p);
  assert.deepEqual(hit.duel.fighters[0].health, step(p, p, ROW, 1).duel.fighters[0].health);
  assert.equal(aura.ctx.live, true);
  setMechanicScale(2);
  assert.ok(m.tick(p, 'big-vegas', true, 1 / 60).duel.fighters[0].health <= step(p, p, ROW, 1).duel.fighters[0].health);
  setMechanicScale(1);
  assert.equal(m.tick(p, 'big-vegas', false, 1 / 60), p, 'not engaged: nothing');
  assert.equal(aura.ctx.live, false);
  m.tick(p, 'big-vegas', true, 1 / 60); aura.reset(); assert.equal(aura.ctx.live, false);
});
