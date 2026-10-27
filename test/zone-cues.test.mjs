// The live zone's sound rows (data/sound.json zone, src/audio/zone-cues.ts, wired in src/fight/sound/feedback.ts): Dom 2026-10-27 "I still see an instant fight scene, like a ding".
// Pins: the rows validate and a bad row is refused; the shipped zone is silent on the bell, the draw sting and the crowd's kill cheer and gasp, and keeps the body fall and the dying voice;
// the gate rings a 'once' cue for the first engagement of the visit and never again across three simulated engagements / respawns; 'every' is the single fight's behaviour (no gate: every cue
// plays on each engagement, ?postkill=v1); the kill toast clears after toastSeconds in the zone and never in the single fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile, ZONE_CUE_IDS } from '../src/sim/validate.js';
import { zoneCueGate, toastOver } from '../src/audio/zone-cues.ts';
import { cuesFor } from '../src/fight/sound/cues.ts';

const SOUND = JSON.parse(readFileSync(new URL('../data/sound.json', import.meta.url), 'utf8'));
const ROWS = SOUND.zone, clone = (x) => JSON.parse(JSON.stringify(x));

test('the rows validate; a bad row is refused', () => {
  assert.deepEqual(validateFile('sound', SOUND), []);
  const bad = (f) => { const s = clone(SOUND); f(s); return validateFile('sound', s).join('\n'); };
  assert.match(bad((s) => { s.zone.extra = 1; }), /sound\.zone\.extra: unknown key/);
  assert.match(bad((s) => { s.zone.cues.bell = 'sometimes'; }), /cues\.bell: must be one of/);
  assert.match(bad((s) => { delete s.zone.cues.draw; }), /cues\.draw/);
  assert.match(bad((s) => { s.zone.cues.gong = 'off'; }), /cues\.gong: unknown cue id/);
  assert.match(bad((s) => { s.zone.toastSeconds = 0; }), /toastSeconds/);
  assert.match(bad((s) => { s.zone.toastSeconds = NaN; }), /toastSeconds/);
  assert.match(bad((s) => { delete s.zone; }), /sound\.zone: must be an object/);
});

test('the shipped zone: the scene-change cues are off, the diegetic death stays on', () => {
  assert.deepEqual(Object.keys(ROWS.cues).sort(), [...ZONE_CUE_IDS].sort());
  for (const id of ['bell', 'draw', 'crowd_cheer', 'crowd_gasp']) assert.equal(ROWS.cues[id], 'off', id);
  for (const id of ['kill', 'death_voice']) assert.equal(ROWS.cues[id], 'on', id);
  const gate = zoneCueGate(ROWS);
  assert.equal(gate.allow('bell'), false);
  assert.equal(gate.allow('hit_flesh'), true, 'a cue with no row (a hit, a clash, a whoosh) is never gated');
});

test("a 'once' bell rings for the first engagement of the visit only, across three engagements and respawns", () => {
  const gate = zoneCueGate({ ...ROWS, cues: { ...ROWS.cues, bell: 'once' } });
  // each engagement is a new match seed (main.ts: every hand-over, leash reset and respawn makes one); the page asks the gate once per engagement draw
  const rang = [101, 102, 103].map(() => gate.allow('bell'));
  assert.deepEqual(rang, [true, false, false]);
  assert.equal(gate.allow('draw'), false, 'the other rows are independent');
});

test("a 'once' cue is per gate: a new page visit rings again", () => {
  const rows = { ...ROWS, cues: { ...ROWS.cues, bell: 'once' } };
  assert.equal(zoneCueGate(rows).allow('bell'), true);
  assert.equal(zoneCueGate(rows).allow('bell'), true);
});

test("'on' rings every engagement; 'off' never", () => {
  const every = zoneCueGate({ ...ROWS, cues: { ...ROWS.cues, bell: 'on' } }), off = zoneCueGate(ROWS);
  assert.deepEqual([1, 2, 3].map(() => every.allow('bell')), [true, true, true]);
  assert.deepEqual([1, 2, 3].map(() => off.allow('bell')), [false, false, false]);
});

test('?postkill=v1 (no zone rows, no gate): the bell rings on every engagement and every cue plays, as before', () => {
  assert.equal(zoneCueGate(null), null, 'no gate object at all: feedback.ts takes its `?? true` / unguarded path');
  const killed = [{ tick: 9, type: 'Killed', actor: 0, target: 1, move: 'light_right', location: 'torso', heading: 0 }];
  const names = cuesFor(killed, { finish: { victim: 1, location: 'torso', move: 'light_right', heading: 0 }, weapons: ['sword', 'sword'], gore: true }).map((c) => c.name);
  assert.ok(names.includes('crowd_cheer'), 'the single fight still cheers the kill');
  const gate = zoneCueGate(ROWS);
  const kept = names.filter((n) => gate.allow(n));
  assert.ok(!kept.includes('crowd_cheer') && !kept.includes('crowd_gasp'), 'the zone drops the crowd cue');
  assert.ok(kept.includes('death_voice') || kept.includes('kill'), 'the zone keeps the body fall / dying voice');
});

test("the zone's draw event is dropped from the cue list; the single fight's is kept", () => {
  const drew = [{ tick: 1, type: 'ActionStarted', actor: 0, action: 'draw' }];
  const names = cuesFor(drew).map((c) => c.name);
  assert.deepEqual(names, ['draw']);
  assert.deepEqual(names.filter((n) => zoneCueGate(ROWS).allow(n)), []);
});

test('the kill toast: clears after toastSeconds in the zone, never in the single fight', () => {
  assert.equal(toastOver(ROWS, ROWS.toastSeconds - 0.01), false);
  assert.equal(toastOver(ROWS, ROWS.toastSeconds), true);
  assert.equal(toastOver(null, 999), false);
});
