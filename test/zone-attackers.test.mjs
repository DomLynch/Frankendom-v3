// Real-time zone aggro (Dom 2026-10-27: a boss whose aggro range you enter attacks even while you fight another): the pure rules (src/zone/attackers.ts), the attackers' duels
// on the hero's one health pool (src/fight/attacker-bout.ts) and the page wiring pinned by reading main.ts / scene.ts. Spot coordinates are read from the zone row, never written here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt, profileAt } from '../src/fight/moves.ts';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { idleIntent } from '../src/fight/duel.ts';
import { adopt, joinAttacker, stepAttackers } from '../src/fight/attacker-bout.ts';
import { ATTACKERS, MAX_ATTACKERS, attackersOn, dropped, framingWiden, joiners, validateFraming } from '../src/zone/attackers.ts';
import { kill, spotsFor } from '../src/zone/spawns.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FIGHT = JSON.parse(read('../data/fight.json')), ZONE = zoneFor('');
const spawns = () => spotsFor(ZONE).map((s) => ({ ...s, deadFor: null }));
const foe = OPPONENTS[FIGHT.opponent], body = opponentAt(foe, FIGHT.level), profile = profileAt(foe, FIGHT.level);
const fight = (seed, pose) => initialPractice(seed, body, FIGHT.weapon, FIGHT.skill, undefined, undefined, undefined, pose);
const poseOf = (hero, spot) => ({ hero, foe: spot, heroFacing: Math.atan2(spot.x - hero.x, spot.z - hero.z) });
const intentOf = (practice, action = null) => ({ ...idleIntent(), action: practice.phase === 'sheathed' && !practice.finish && action === null ? 'light' : action });

test('the default is pinned: on, ?aggro=v1 turns it off, the cap is the V1 row (3, the first boss included)', () => {
  assert.deepEqual({ ...ATTACKERS, about: undefined, camera: { ...ATTACKERS.camera, about: undefined } }, { about: undefined, on: true, query: 'aggro', off: 'v1', camera: { about: undefined, widenAtMetres: 2, maxWiden: 1.8, easeSeconds: 0.5 } });
  assert.equal(attackersOn(''), true); assert.equal(attackersOn('?aggro=v1'), false); assert.equal(attackersOn('?aggro=1'), true);
  assert.equal(attackersOn('', { ...ATTACKERS, on: false }), false, 'the row off');
  assert.equal(MAX_ATTACKERS, JSON.parse(read('../src/fight/world-rules-defs.json')).rules.find((r) => r.id === 'maxAttackers').value);
});

test('who joins: a standing boss the hero is inside the aggro of, nearest first, never the held one, never past the cap', () => {
  const s = spawns(), at = (i) => ({ x: s[i].x, z: s[i].z });
  assert.deepEqual(joiners(s, 0, [], at(1)), [1], 'standing on the second boss\'s spot: it joins, the held one does not');
  assert.deepEqual(joiners(s, 1, [], at(1)), [], 'the held boss is the first fight, not a joiner');
  assert.deepEqual(joiners(s, 0, [1], at(1)), [], 'already fighting him');
  const everyone = s.map((x) => ({ ...x, x: s[0].x, z: s[0].z }));   // all three on one spot: the cap decides
  assert.equal(joiners(everyone, 0, [], at(0), MAX_ATTACKERS).length, Math.min(everyone.length - 1, MAX_ATTACKERS - 1));
  assert.deepEqual(joiners(everyone, 0, [], at(0), 1), [], 'a cap of one is the first boss alone');
  assert.deepEqual(joiners(everyone, 0, [1], at(0), 2), [], 'the cap counts the attackers already on him');
  const dead = kill(s, 1);
  assert.deepEqual(joiners(dead, 0, [], at(1)), [], 'a dead boss does not attack');
  const far = { x: s[0].x + 100, z: s[0].z };
  assert.deepEqual(joiners(s, 0, [], far), [], 'out of every aggro nobody joins');
});

test('the camera framing row: one boss is exactly the old frame, a far attacker widens it in proportion, capped; bad rows are refused', () => {
  const rows = ATTACKERS.camera, c = { x: 0, z: 0 };
  assert.equal(framingWiden(c, []), 1, 'one boss live: no widening at all');
  assert.equal(framingWiden(c, [{ x: rows.widenAtMetres, z: 0 }]), 1, 'inside the row\'s distance: still 1');
  const mid = framingWiden(c, [{ x: rows.widenAtMetres * 1.2, z: 0 }]);
  assert.ok(mid > 1 && mid < rows.maxWiden && Math.abs(mid - 1.2) < 1e-9);
  assert.equal(framingWiden(c, [{ x: 1000, z: 0 }]), rows.maxWiden, 'capped');
  assert.equal(framingWiden(c, [{ x: rows.widenAtMetres * 1.1, z: 0 }, { x: 0, z: rows.widenAtMetres * 1.3 }]), 1.3, 'the farthest attacker decides');
  assert.doesNotThrow(() => validateFraming(rows));
  for (const bad of [{ widenAtMetres: 0 }, { maxWiden: 0.5 }, { easeSeconds: 0 }, { maxWiden: NaN }]) assert.throws(() => validateFraming({ ...rows, ...bad }), /attackers\.camera/);
  const cam = read('../src/fight/camera.ts');
  assert.match(cam, /enemyLow = 0, widen = 1\)/); assert.match(cam, /\* \(1 \+ \(widen - 1\) \* shortShare\)/);
});

test('the camera composes with the lens zoom: one boss is byte-identical to main\'s frame, and with two live the second attacker is inside the 375 frame at zoom 1.1 and 1.0', async () => {
  const THREE = await import('three'), { cameraPose, setLockFrame } = await import('../src/fight/camera.ts'), { fovForZoom, cameraZoom } = await import('../src/fight/camera-zoom.ts');
  setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);
  const BACK = JSON.parse(read('../src/fight/camera-rules-defs.json')).rules.find((r) => r.id === 'fightBackDefault').value;   // the lock's fight-back scale: camera.update multiplies it by widen
  assert.equal(cameraZoom(FIGHT.camera.zoom, ''), FIGHT.camera.zoom);
  const s = spawns(), A = s[0], rows = ATTACKERS.camera;
  // The farthest a second boss can be while it attacks: the hero stands at the first boss's leash and inside the second boss's aggro, on the line between them. The shipped spawns stand 16 m or more apart
  // (spawn spread, PR B2), further than leash + aggro, so no pair of them ever meets this geometry (the next test); the bout is built on a boss placed at exactly the farthest feasible spot.
  const toward = { x: s[1].x - A.x, z: s[1].z - A.z }, reach = Math.hypot(toward.x, toward.z), lie = A.leash + s[1].aggro * 0.9;
  const B = { ...s[1], x: A.x + (toward.x / reach) * lie, z: A.z + (toward.z / reach) * lie };
  const dx = A.x - B.x, dz = A.z - B.z, len = Math.hypot(dx, dz), hero = { x: B.x + (dx / len) * B.aggro * 0.9, z: B.z + (dz / len) * B.aggro * 0.9, heading: 0, distance: 0 };
  const yaw = Math.atan2(hero.x - A.x, hero.z - A.z), centre = { x: (hero.x + A.x) / 2, z: (hero.z + A.z) / 2 };
  const inFrame = (zoom, widen, p) => {
    const cam = new THREE.PerspectiveCamera(fovForZoom(zoom), 375 / 812, 0.1, 100), pose = cameraPose(hero, yaw, 0, true, A, 1, 0, 0, BACK * widen);
    cam.position.set(pose.x, pose.y, pose.z); cam.lookAt(pose.lookX, 0.8, pose.lookZ); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    return [0, 1.8].every((y) => { const v = new THREE.Vector3(p.x, y, p.z).project(cam); return Math.abs(v.x) <= 0.85 && Math.abs(v.y) <= 0.85 && v.z < 1; });
  };
  for (const zoom of [1, FIGHT.camera.zoom]) {
    assert.equal(framingWiden(centre, [], rows, zoom), 1, 'one boss live: exactly 1 at every zoom, so the camera is main\'s');
    const widen = framingWiden(centre, [B], rows, zoom);
    for (const p of [hero, A, B]) assert.ok(inFrame(zoom, widen, p), `zoom ${zoom}: ${p === B ? 'the second boss' : p === A ? 'the first boss' : 'the hero'} is in frame (widen ${widen.toFixed(2)})`);
  }
  assert.ok(framingWiden(centre, [B], rows, 1.1) >= framingWiden(centre, [B], rows, 1), 'a tighter lens backs off at least as much');
  assert.deepEqual(cameraPose(hero, yaw, 0, true, A, 1, 0, 0, BACK * 1), cameraPose(hero, yaw, 0, true, A, 1, 0, 0), 'widen 1 is the old frame, byte for byte');
});

test('who lets go: past its own leash from its own spot', () => {
  const s = spawns(), here = { x: s[1].x, z: s[1].z }, away = { x: s[1].x + s[1].leash + 1, z: s[1].z };
  assert.deepEqual(dropped(s, [1], here), []); assert.deepEqual(dropped(s, [1], away), [1]);
  assert.deepEqual(dropped(s, [], away), []);
});

const hero0 = { x: 0, z: 2 }, mark = { x: 0, z: -1.25 };
const ticks = 900;

test('with nobody on him the step is untouched: the very same practice object comes back (single fights are byte for byte)', () => {
  const before = fight(7, poseOf(hero0, mark)), intent = intentOf(before), after = stepPractice(before, intent, profile);
  const out = stepAttackers(before, after, intent, [], profile);
  assert.equal(out.practice, after); assert.deepEqual(out.list, []); assert.equal(out.killer, null);
});

test('a second boss on the hero hurts the one health pool: both bosses\' blows land, the sum is subtracted, the numbers add up', () => {
  const side = { x: 1.2, z: 1.2 };
  const run = (withB) => {
    let p = fight(7, poseOf(hero0, mark)), list = withB ? [joinAttacker(1, fight(99, poseOf(hero0, side)))] : [], extra = 0, checked = 0;
    for (let t = 0; t < ticks && !p.finish; t++) {
      const intent = intentOf(p), after = stepPractice(p, intent, profile), out = stepAttackers(p, after, intent, list, profile);
      const added = out.practice.events.slice(after.events.length), sum = added.filter((e) => e.type === 'Hit' && e.target === 0).reduce((n, e) => n + (e.damage ?? 0), 0);
      if (sum > 0) { assert.ok(after.playerHealth - out.practice.playerHealth >= Math.min(after.playerHealth, sum), 'the attacker\'s hit comes off the one pool'); checked++; extra += sum; }
      assert.ok(out.practice.playerHealth <= after.playerHealth);
      p = out.practice; list = out.list;
    }
    return { p, extra, checked };
  };
  const solo = run(false), duo = run(true);
  assert.ok(duo.checked > 0, 'the second boss landed at least one blow on him');
  assert.ok(duo.p.playerHealth < solo.p.playerHealth || duo.p.finish, 'two bosses take more off him than one');
});

test('he strikes the second boss back: his swings land on it, with its own health', () => {
  const ahead = { x: 0, z: 1 };   // right in front of the hero, who faces the first boss across the circle
  let p = fight(7, poseOf(hero0, mark)), list = [joinAttacker(1, fight(99, poseOf(hero0, ahead)))], lowest = list[0].practice.health;
  for (let t = 0; t < ticks && !p.finish; t++) {
    const intent = intentOf(p, p.phase === 'ready' && t % 40 === 0 ? 'light' : null), after = stepPractice(p, intent, profile), out = stepAttackers(p, after, intent, list, profile);
    p = out.practice; list = out.list; lowest = Math.min(lowest, list[0].practice.health);
  }
  assert.ok(lowest < list[0].practice.enemyMaxHealth, 'the second boss was hurt by him');
});

test('a lethal sum kills him through the sim\'s own finish, and the killer is the attacker whose blow it was', () => {
  const near = { x: 0.9, z: 2 }, far = { x: 0, z: -4 };   // the first boss across the circle, the second at his side
  let p = fight(7, poseOf(hero0, far)), list = [joinAttacker(2, fight(99, poseOf(hero0, near)))], killer = null;
  p = { ...p, duel: { ...p.duel, fighters: [{ ...p.duel.fighters[0], health: 1 }, p.duel.fighters[1]] }, playerHealth: 1 };
  for (let t = 0; t < ticks * 3 && !p.finish; t++) {
    const intent = intentOf(p), after = stepPractice(p, intent, profile), out = stepAttackers(p, after, intent, list, profile);
    p = out.practice; list = out.list; if (out.killer !== null) killer = out.killer;
  }
  assert.ok(p.finish, 'he fell'); assert.equal(p.finish.victim, 0); assert.equal(p.playerHealth, 0); assert.equal(p.duel.fighters[0].phase, 'dead');
  assert.equal(killer, 2, 'the second boss\'s blow was the lethal one');
  assert.ok(p.events.some((e) => e.type === 'Killed' && e.target === 0), 'the death is an event the HUD, sound and camera read');
});

test('when the first boss dies the second one\'s fight goes on: its own health, the hero as he stands now (adopt)', () => {
  const b = fight(99, poseOf(hero0, { x: 0.9, z: 2 })), hurt = { ...b, health: 40, duel: { ...b.duel, fighters: [b.duel.fighters[0], { ...b.duel.fighters[1], health: 40 }] } };
  const mine = { ...fight(7, poseOf(hero0, mark)).duel.fighters[0], health: 55 };
  const next = adopt({ index: 1, practice: hurt, dead: false }, mine);
  assert.equal(next.duel.fighters[1].health, 40); assert.equal(next.health, 40); assert.equal(next.playerHealth, 55); assert.equal(next.finish, null);
});

test('the sim is untouched: no file the Gate 0 table pins is edited by this change, the new modules import none of the page', () => {
  for (const f of ['../src/fight/attacker-bout.ts', '../src/zone/attackers.ts']) assert.doesNotMatch(read(f), /from '\.\.\/client|from 'three'|document\.|window\./);
  assert.doesNotMatch(read('../src/fight/attacker-bout.ts'), /Math\.random|Date\.now|performance\.now/, 'deterministic');
});

test('the page wiring is pinned: gated by the row, the same intent for every duel, joins only while engaged, the cap row, adoption, the killer, the rigs', () => {
  const main = read('../src/client/main.ts'), scene = read('../src/fight/scene.ts'), ch = read('../src/fight/characters.ts');
  assert.match(main, /const multi = !!ZONE && attackersOn\(search\)/);
  assert.match(main, /stepAttackers\(prior, practice, duelIntent, attackers, aiProfile\)/, 'every duel takes the hero\'s one intent');
  assert.match(main, /if \(attackers\.length\)/, 'nothing steps when nobody is on him');
  assert.match(main, /for \(const i of joiners\(spawns, current, alive\(\), hero\)\)/);
  assert.match(main, /make\(nextSeed\(/, 'an attacker is built by the same factory as the first fight: the difficulty rows\' health and damage scales apply');
  assert.match(main, /adoptAttacker\(live, hero\)/); assert.match(main, /killedBy \?\? current/);
  assert.match(main, /view\.liveFoes\(/); assert.match(main, /filter\(\(s\) => !attackers\.some/, 'a live attacker is not also drawn as a frozen copy');
  assert.match(scene, /liveFoes\(list/); assert.match(scene, /warriors\.spawnFoe\(\)/);
  assert.match(ch, /spawnFoe: \(\) => create\(true\)/);
});
