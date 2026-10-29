// Replay = live (audit C, 2026-10-29). stepDuel reads module-global era flags a driver sets (knock-sim, special-pace, special-terms, hero-mana); the fight record carried none of them, so a
// headless replay ran them OFF (or inherited whatever the process had set) and stepped a different fight than the page played. This test plays a fight LIVE under chosen flags, records it
// with the real recorder, then replays it through verifyRecord with the AMBIENT flags set the other way: the replay must end on the very same duel state as the live fight.
// It uses only the long-standing API (createRecorder, verifyRecord, the flag setters), so it also runs on the code before the fix and fails there: that is its fail-first receipt.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { OPPONENTS, opponentAt, profileAt } from '../src/fight/moves.ts';
import { distance } from '../src/fight/duel.ts';
import { RECORD_VERSION, createRecorder, packRecord, unpackRecord } from '../src/fight/record.ts';
import { recordSpecials, verifyRecord } from '../src/fight/replay.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../src/fight/play-radius.ts';
import { setStab } from '../src/fight/stab-rule.ts';
import { setStanceRows } from '../src/fight/stance-era.ts';
import { knockSimFor, setKnockSim } from '../src/fight/knock-sim.ts';
import { setSpecialPace, specialPaceFor } from '../src/fight/special-pace.ts';
import { setSpecialTerms, specialTermsFor } from '../src/fight/special-terms.ts';
import { heroNoManaFor, setHeroNoMana } from '../src/fight/hero-mana.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const FIGHT = read('../data/fight.json'), FEEL_SIM = read('../data/feel-sim.json'), FEEL_DEFAULTS = read('../data/feel-defaults.json');
const foeId = FIGHT.opponent, opponent = OPPONENTS[foeId], profile = profileAt(opponent, FIGHT.level);

// The four long-standing flags, each turned on from the page's own rows (what src/client/main.ts does with an empty search).
const SETTERS = {
  'knock-sim': (on) => setKnockSim(on ? knockSimFor(FEEL_SIM, '', FEEL_DEFAULTS) : null),
  'special-pace': (on) => setSpecialPace(on ? specialPaceFor(FIGHT.specialPace, '') : null),
  'special-terms': (on) => setSpecialTerms(on ? specialTermsFor(FIGHT.specialTerms, '') : null),
  'hero-mana': (on) => setHeroNoMana(on ? heroNoManaFor(FIGHT.heroMana, '') : false),
};
const IDS = Object.keys(SETTERS);
const flags = (...on) => { for (const id of IDS) SETTERS[id](on.includes(id)); };
afterEach(() => flags());

const eraOf = () => { setPlayScale(playScaleFor(foeId, RECORD_VERSION)); setLateNotice(true); setStab(true); setStanceRows(true); };
const meta = () => ({ build: 'era-replay-test', opponent: foeId, weapon: FIGHT.weapon, skill: FIGHT.skill, level: FIGHT.level, seed: FIGHT.seed, specials: true, stances: FIGHT.stance, skill2: FIGHT.skill2 });

// A scripted hero: walk to the foe, then a mix of light, kick and both specials, so the flags (cooldowns, stamina, the mana pool, knockdown, pace) all have something to bite on.
const intentAt = (t, practice) => {
  const gap = distance(practice.duel.fighters[0].body, practice.duel.fighters[1].body);
  const action = t % 150 === 60 ? 'skill2' : t % 90 === 30 ? 'skill' : t % 200 === 120 ? 'kick' : t % 45 === 10 ? 'light' : null;
  return { move: { x: 0, z: gap > 1.6 ? 1 : 0, yaw: 0, run: false }, action, guard: false, lock: true };
};

/** Plays TICKS live under the flags `on`, recording with the real recorder. Returns the finished record and the live duel as JSON. */
function playLive(on, TICKS = 900) {
  flags(...on); eraOf();
  let practice = initialPractice(FIGHT.seed, opponentAt(opponent, FIGHT.level), FIGHT.weapon, FIGHT.skill, recordSpecials({ specials: true, level: FIGHT.level, opponent: foeId }), undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2);
  const recorder = createRecorder(meta());
  let ticks = 0;
  for (; ticks < TICKS && !practice.finish; ticks++) practice = stepPractice(practice, recorder.push(intentAt(ticks, practice)), profile);
  const f = practice.finish;
  const record = recorder.finish(f ? (f.draw ? 'draw' : f.victim === 1 ? 'killed' : 'died') : 'abandoned');
  return { record, live: JSON.stringify(practice.duel), ticks };
}
const replayed = (record) => { const v = verifyRecord(record, undefined, { sheet: 'trust' }); return { v, replay: v.practice ? JSON.stringify(v.practice.duel) : null }; };

test('the scripted fight really bites on every flag (each flag alone changes the live fight)', () => {
  const base = playLive([]).live;
  for (const id of IDS) assert.notEqual(playLive([id]).live, base, `${id} on must change the fight, or this test cannot see it`);
});

test('a fight played with every era flag on replays to the same duel with the ambient flags OFF', () => {
  const { record, live } = playLive(IDS);
  flags();   // the replay process has none set (a server, Share's headless check, a test)
  const { v, replay } = replayed(record);
  assert.equal(replay, live, `the replay must end where the live fight did (${v.ok ? 'ok' : v.reason})`);
  assert.ok(v.ok, v.ok ? '' : v.reason);
});

test('a fight played with every era flag OFF replays to the same duel with the ambient flags ON (a replay never inherits the process)', () => {
  const { record, live } = playLive([]);
  flags(...IDS);
  const { v, replay } = replayed(record);
  assert.equal(replay, live, `the replay must end where the live fight did (${v.ok ? 'ok' : v.reason})`);
});

test('each flag alone: live with it on, replay with every flag ambient-off and then ambient-on, both match', () => {
  for (const id of IDS) {
    const { record, live } = playLive([id]);
    for (const ambient of [[], IDS]) { flags(...ambient); assert.equal(replayed(record).replay, live, `${id}: replay with ambient [${ambient}] must match the live fight`); }
  }
});

test('the stamp survives pack and unpack: the decoded record replays to the live duel', () => {
  const { record, live } = playLive(IDS);
  const again = unpackRecord(packRecord(record));
  flags();
  assert.equal(replayed(again).replay, live);
});
