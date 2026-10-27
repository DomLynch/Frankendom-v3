// Trace for the leash-reset change: A is dragged past its leash with B on the hero. Prints hero health / B's health / who is held before and after.
// BEFORE is main's `hand(current, hero)` -> rematch(): a fresh duel (hero at full health, attackers dropped). AFTER is resetHeld (attacker-bout.ts).
//   node scripts/leash-reset-trace.mjs
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice, project } from '../src/fight/combat.ts';
import { initialState } from '../src/fight/sim.ts';
import * as play from '../src/fight/play-radius.ts';
import { joinAttacker, resetHeld } from '../src/fight/attacker-bout.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, leashed, poseAt, spotsFor, zoneDuel } from '../src/zone/spawns.ts';

const rows = JSON.parse(readFileSync(new URL('../data/respawn.json', import.meta.url), 'utf8')), fight = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
play.setPlayScale(WORLD.pitScale);
const body = opponentAt(OPPONENTS[fight.opponent], fight.level), [A, B] = spotsFor(zoneFor('')), hero = { x: A.x + 3, z: A.z + 1 };
const make = (spot) => { const p = initialPractice(7, body, fight.weapon, fight.skill), pose = poseAt(hero, spot, play.OPEN_RADIUS, rows.spawn.minDistance, initialState()); return project(zoneDuel(p.duel, pose), p.ai, p); };
const edit = (p, f) => project({ ...p.duel, fighters: f(p.duel.fighters) }, p.ai, p);
const primary = edit(edit(make(A), ([h, f]) => [{ ...h, health: 60 }, f]), ([h, f]) => [h, { ...f, body: { ...f.body, x: A.x, z: A.z + A.leash + 0.5 }, health: 30 }]);
const onB = joinAttacker(1, edit(make(B), ([h, f]) => [{ ...h, health: 60 }, { ...f, health: 45 }]));
const before = make(A);   // rematch(): fresh duel, hero full health, the attacker list emptied
const after = resetHeld(primary, [onB], 0, () => make(A));
const line = (label, hero, held, bHealth, engaged) => console.log(`${label.padEnd(8)} hero health ${String(hero).padEnd(4)} held boss ${held.padEnd(18)} B health ${String(bHealth).padEnd(8)} B still on him ${engaged}`);
console.log(`A dragged ${(A.leash + 0.5).toFixed(1)} m from its spot (leash ${A.leash} m): leashed = ${leashed(A, primary.enemy)}`);
line('at leash', primary.playerHealth, 'A (kited)', onB.practice.health, 'yes');
line('BEFORE', before.playerHealth, 'A (fresh)', 'dropped', 'no');
line('AFTER', after.practice.playerHealth, after.index === 1 ? 'B (its own fight)' : 'A', after.practice.health, 'yes');
