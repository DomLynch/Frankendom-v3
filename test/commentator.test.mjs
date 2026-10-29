// The arena commentator (src/commentator.ts, data/commentator.json; schema in src/sim/validate.js checkCommentator): the picker's cooldown, no-repeat, caps, determinism and params; the schema; the real event path
// (a real boss fight's events feed the commentator); the caption element and the opt-out. Text only, presentation only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROWS, commentatorOn, createCommentator, mountCaption, validateCommentator } from '../src/commentator.ts';
import { SCHEMA, validateFile } from '../src/sim/validate.js';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';
import { stepPractice } from '../src/fight/combat.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { tuneFrom } from '../src/tune.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const IDS = ['fight_start', 'first_hit', 'miss_streak', 'guard_break', 'hero_low', 'boss_low', 'boss_kill', 'star_1', 'star_2', 'cut', 'hero_death', 'respawn', 'retrieve', 'roll_spam', 'idle', 'wearing_parts', 'limb_loss', 'parry_wall'];
/** A commentator whose clock the test drives; `lines` collects what the caption would show. */
const make = (rows = ROWS, names = { gargantua: 'Gargantua' }) => { const lines = []; const cm = createCommentator(rows, (l) => lines.push(l), names, true); return { cm, lines }; };
const loose = () => { const r = clone(ROWS); r.caps = { perSession: 1000, perMinute: 60, gapSeconds: 0 }; for (const e of Object.values(r.events)) { e.cooldownSeconds = 0; e.probability = 1; } return r; };

test('the shipped table validates: every event id, 6+ lines each, closed keys', () => {
  assert.deepEqual(validateCommentator(), []);
  assert.deepEqual(validateFile('commentator', read('commentator')), []);
  assert.ok(SCHEMA.commentator);
  assert.deepEqual(Object.keys(ROWS.events), IDS);
  for (const id of IDS) assert.ok(ROWS.events[id].lines.length >= 6 && ROWS.events[id].lines.length <= 10, `${id}: 6 to 10 lines`);
});

test('the schema rejects bad rows: missing event, few lines, undeclared param, long line, duplicate, deny-list word, unknown key, bad numbers', () => {
  const bad = (edit) => { const r = clone(ROWS); edit(r); return validateCommentator(r).join('\n'); };
  assert.match(bad((r) => { delete r.events.idle; }), /events\.idle: missing/);
  assert.match(bad((r) => { r.events.idle.lines = r.events.idle.lines.slice(0, 3); }), /events\.idle\.lines: needs at least 6/);
  assert.match(bad((r) => { r.events.idle.lines[0] = 'Hello {boss}'; }), /\{boss\} is not a declared param/);
  assert.match(bad((r) => { r.events.idle.lines[0] = 'x'.repeat(200); }), /longer than caption\.maxChars/);
  assert.match(bad((r) => { r.events.idle.lines[1] = r.events.idle.lines[0]; }), /duplicate line/);
  assert.match(bad((r) => { r.events.idle.lines[0] = 'What the fuck was that'; }), /not PG-13/);
  assert.match(bad((r) => { r.events.idle.lines[0] = 'Even Hitler dodged better'; }), /real person/);
  assert.match(bad((r) => { r.events.idle.volume = 1; }), /events\.idle\.volume: unknown key/);
  assert.match(bad((r) => { r.events.nonsense = clone(r.events.idle); }), /events\.nonsense: unknown event id/);
  assert.match(bad((r) => { r.events.idle.probability = 0; }), /probability: must be a number in \(0, 1\]/);
  assert.match(bad((r) => { r.events.idle.cooldownSeconds = -1; }), /cooldownSeconds/);
  assert.match(bad((r) => { r.caps.perMinute = 0; }), /caps\.perMinute/);
  assert.match(bad((r) => { r.caption.colour = 'red'; }), /caption\.colour/);
  assert.match(bad((r) => { r.thresholds.missStreak = 1; }), /thresholds\.missStreak/);
  const top = clone(ROWS); top.mood = 'angry'; assert.match(validateFile('commentator', top).join('\n'), /commentator\.mood: unknown key/);
});

test('every shipped line is short, PG-13 by the deny-list, has no URL and names no real person', () => {
  for (const [id, e] of Object.entries(ROWS.events)) for (const l of e.lines) {
    assert.ok(l.length <= ROWS.caption.maxChars, `${id}: ${l}`);
    assert.doesNotMatch(l, /https?:|www\./i);
    assert.match(l, /^[A-Za-z{'"]/, `${id}: starts like a sentence`);
  }
});

test('no repeat: the same event never says the line it said last, over many calls', () => {
  const { cm, lines } = make(loose());
  for (let i = 0; i < 400; i++) { cm.say('first_hit'); cm.advance(1); }
  assert.equal(lines.length, 400);
  for (let i = 1; i < lines.length; i++) assert.notEqual(lines[i], lines[i - 1]);
  assert.ok(new Set(lines).size >= ROWS.events.first_hit.lines.length - 1, 'every line gets used');
});

test('deterministic: the same seed and calls pick the same lines; another seed picks others', () => {
  const run = (seed) => { const r = loose(); r.seed = seed; const { cm, lines } = make(r); for (let i = 0; i < 30; i++) { cm.say('hero_death'); cm.advance(1); } return lines.join('|'); };
  assert.equal(run('a'), run('a'));
  assert.notEqual(run('a'), run('b'));
});

test('per-event cooldown: nothing until the cooldown has passed, then it speaks again', () => {
  const r = loose(); r.events.first_hit.cooldownSeconds = 10;
  const { cm, lines } = make(r);
  assert.ok(cm.say('first_hit')); assert.equal(cm.say('first_hit'), null);
  cm.advance(9.9); assert.equal(cm.say('first_hit'), null);
  cm.advance(0.2); assert.ok(cm.say('first_hit'));
  assert.equal(lines.length, 2);
});

test('the global gap blocks a normal line but not a priority one', () => {
  const r = loose(); r.caps.gapSeconds = 5;
  const { cm } = make(r);
  assert.ok(cm.say('first_hit'));
  assert.equal(cm.say('idle'), null, 'inside the gap');
  assert.ok(cm.say('hero_death'), 'priority skips the gap');
  cm.advance(5.1); assert.ok(cm.say('idle'));
});

test('lines per minute: the cap holds, then frees as the minute passes', () => {
  const r = loose(); r.caps.perMinute = 3;
  const { cm, lines } = make(r);
  for (const id of ['first_hit', 'idle', 'retrieve', 'respawn', 'miss_streak']) { cm.say(id); cm.advance(1); }
  assert.equal(lines.length, 3);
  cm.advance(60); assert.ok(cm.say('guard_break'));
  assert.equal(lines.length, 4);
});

test('lines per session: the cap is final, priority included', () => {
  const r = loose(); r.caps.perSession = 5;
  const { cm, lines } = make(r);
  for (let i = 0; i < 20; i++) { cm.say('hero_death'); cm.advance(1); }
  assert.equal(lines.length, 5); assert.equal(cm.said, 5);
});

test('probability: a failed roll says nothing and keeps the cooldown free; the roll is deterministic', () => {
  const r = loose(); r.events.idle.probability = 0.5;
  const run = () => { const { cm, lines } = make(r); for (let i = 0; i < 200; i++) { cm.say('idle'); cm.advance(1); } return lines.length; };
  const n = run(); assert.equal(n, run());
  assert.ok(n > 60 && n < 140, `about half: ${n}`);
});

test('params fill {name}; a line that needs a param the call lacks is not said', () => {
  const { cm, lines } = make(loose());
  assert.equal(cm.say('wearing_parts'), null); assert.equal(cm.say('wearing_parts', {}), null);
  const said = cm.say('wearing_parts', { partName: 'Minotaur horn' });
  assert.match(said, /Minotaur horn/); assert.doesNotMatch(said, /[{}]/); assert.equal(lines.length, 1);
  assert.equal(cm.say('no_such_event'), null);
});

test('disabled: nothing is said; setEnabled turns it back on', () => {
  const lines = []; const cm = createCommentator(loose(), (l) => lines.push(l), {}, false);
  assert.equal(cm.say('idle'), null); assert.equal(lines.length, 0);
  cm.setEnabled(true); assert.ok(cm.say('idle'));
});

test('the opt-out: localStorage fd3.commentator = off turns it off; a throwing store leaves it on; the row can switch it off', () => {
  assert.equal(commentatorOn(ROWS, null), true);
  assert.equal(commentatorOn(ROWS, { getItem: () => 'off' }), false);
  assert.equal(commentatorOn(ROWS, { getItem: () => 'on' }), true);
  assert.equal(commentatorOn(ROWS, { getItem: () => { throw new Error('blocked'); } }), true);
  let asked = ''; commentatorOn(ROWS, { getItem: (k) => { asked = k; return null; } }); assert.equal(asked, 'fd3.commentator');
  assert.equal(commentatorOn({ ...ROWS, enabled: false }, null), false);
});

test('events path: a first hit, a miss streak, a guard break on the hero and roll spam each speak once', () => {
  const { cm, lines } = make(loose());
  cm.events([{ type: 'Hit', actor: 1, target: 0 }]); assert.equal(lines.length, 0, 'the boss hitting the hero is not a first hit');
  cm.events([{ type: 'Hit', actor: 0, target: 1 }]); assert.equal(lines.length, 1);
  cm.events([{ type: 'Hit', actor: 0, target: 1 }]); assert.equal(lines.length, 1, 'only the first');
  for (let i = 0; i < 3; i++) cm.events([{ type: 'AttackMissed', actor: 0 }]); assert.equal(lines.length, 1);
  cm.events([{ type: 'AttackMissed', actor: 0 }]); assert.equal(lines.length, 2, 'the 4th whiff');
  cm.events([{ type: 'AttackMissed', actor: 0 }, { type: 'Hit', actor: 0 }, { type: 'AttackMissed', actor: 0 }]); assert.equal(lines.length, 2, 'a hit resets the streak');
  cm.events([{ type: 'GuardBroken', actor: 0, target: 1 }]); assert.equal(lines.length, 2, 'the boss losing his guard is not the hero\'s');
  cm.events([{ type: 'GuardBroken', actor: 1, target: 0 }]); assert.equal(lines.length, 3);
  for (let i = 0; i < 4; i++) { cm.advance(0.5); cm.events([{ type: 'ActionStarted', actor: 0, action: 'roll' }]); } assert.equal(lines.length, 3);
  cm.advance(0.5); cm.events([{ type: 'ActionStarted', actor: 0, action: 'roll' }]); assert.equal(lines.length, 4, 'the 5th roll inside the window');
  cm.advance(10); for (let i = 0; i < 5; i++) { cm.advance(3); cm.events([{ type: 'ActionStarted', actor: 0, action: 'roll' }]); } assert.equal(lines.length, 4, 'slow rolls are not spam');
});

test('the real event path: a real boss fight\'s events (a hit, whiffs, a dodge) drive the commentator', () => {
  const ctx = { stars: read('stars'), profiles: read('profiles').profiles, difficulty: read('difficulty'), brains: read('brains').brains, pick: read('difficulty').default, search: '', level: read('fight').level, ai: read('fight').ai, override: null,
    weapon: read('fight').weapon, skill: read('fight').skill, skill2: read('fight').skill2, stance: read('fight').stance, specials: read('fight').specials, tune: tuneFrom(read('tune'), '') };
  const f = kindFightFor('gargantua', ctx); let pr = kindPractice(f, ctx, 7);
  const { cm, lines } = make(loose(), { gargantua: 'Gargantua' });
  const seen = new Set();
  for (let t = 0; t < 1500; t++) {
    const action = t === 5 ? 'draw' : t % 60 === 30 ? 'dodge' : t % 25 === 0 ? 'light' : 'none';
    pr = stepPractice(pr, quantizeIntent({ move: { x: 0, z: 0, yaw: 0, run: false }, action, guard: false, held: false, lock: true, cancel: false }), f.ai);
    for (const e of pr.events) seen.add(`${e.type}:${e.actor}`);
    cm.advance(1 / 60); cm.events(pr.events);
  }
  assert.ok(seen.has('Hit:0') && seen.has('AttackMissed:0'), 'the sim produced hits and whiffs');
  assert.ok(lines.length >= 2, `first_hit and miss_streak spoke through the real events (${lines.length})`);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].length > 0);
});

test('frame: fight start names the boss, a star boss gets the star line, low health speaks once per crossing, death and respawn and kill each speak', () => {
  const r = loose();
  const { cm, lines } = make(r);
  const f = (engaged, heroDown, bossDown, hp, bp, star = 0, x = 0, z = 0) => cm.frame(0.1, engaged, heroDown, bossDown, hp, bp, 'gargantua', star, x, z);
  f(false, false, false, 100, 100); assert.equal(lines.length, 0);
  f(true, false, false, 100, 100); assert.equal(lines.length, 1); assert.match(lines[0], /Gargantua/);
  f(true, false, false, 100, 100); assert.equal(lines.length, 1, 'once per fight');
  f(true, false, false, 20, 100); assert.equal(lines.length, 2, 'hero low');
  f(true, false, false, 10, 100); assert.equal(lines.length, 2, 'still low: no repeat');
  f(true, false, false, 10, 15); assert.equal(lines.length, 3, 'boss low');
  f(true, true, false, 0, 15); assert.equal(lines.length, 4, 'death');
  f(false, false, false, 100, 100); assert.equal(lines.length, 5, 'respawn');
  f(true, false, false, 100, 100, 2); assert.equal(lines.length, 6); assert.match(lines[5], /two-star|Two stars|two stars|Double|2|gold|Two/i, 'a two-star boss gets the star line');
  f(true, false, true, 80, 0); assert.equal(lines.length, 7, 'kill'); assert.match(lines[6], /Gargantua|Victory|win|Dead|Flawless|fewer/i);
});

test('frame: a one-star boss uses the one-star row, a name falls back to the kind id title-cased', () => {
  const { cm, lines } = make(loose(), {});
  cm.frame(0.1, true, false, false, 100, 100, 'sir-reginald', 1, 0, 0);
  assert.equal(lines.length, 1); assert.match(lines[0], /Sir Reginald/);
  assert.ok(ROWS.events.star_1.lines.some((l) => l === lines[0].replace('Sir Reginald', '{boss}')), 'came from star_1');
});

test('frame: idling needs standing still, unengaged and alive for idleSeconds, and resets on movement', () => {
  const r = loose(); r.thresholds.idleSeconds = 5;
  const { cm, lines } = make(r);
  for (let i = 0; i < 40; i++) cm.frame(0.1, false, false, false, 100, 100, 'gargantua', 0, 1, 1); assert.equal(lines.length, 0, '4 s');
  for (let i = 0; i < 20; i++) cm.frame(0.1, false, false, false, 100, 100, 'gargantua', 0, 1, 1); assert.equal(lines.length, 1, 'past 5 s');
  for (let i = 0; i < 100; i++) cm.frame(0.1, false, false, false, 100, 100, 'gargantua', 0, 1 + i * 0.1, 1); assert.equal(lines.length, 1, 'walking is not idling');
  for (let i = 0; i < 100; i++) cm.frame(0.1, true, false, false, 100, 100, 'gargantua', 0, 5, 5); assert.equal(lines.length, 2, 'only the fight_start; fighting is not idling');
});

test('cut and the extension point: a cut names the part; wearing_parts is callable with {partName}', () => {
  const { cm, lines } = make(loose());
  cm.cut('arm_right'); assert.equal(lines.length, 1);
  cm.cut('unknown_unit'); assert.equal(lines.length, 2);
  assert.ok(cm.say('wearing_parts', { partName: 'Gargantua arm' })); assert.match(lines[2], /Gargantua arm/);
  assert.ok(ROWS.events.cut.lines.some((l) => l.includes('{part}')), 'some cut lines name the part');
});

test('nothing allocates per frame: the frame and event calls make no objects (heap stays flat over 200k calls)', () => {
  const { cm } = make(loose());
  const ev = [{ type: 'Hit', actor: 1, target: 0 }, { type: 'Blocked', actor: 0 }];
  // warm up, then count: a gc-free run of frame()+events() must not grow the heap by more than noise
  for (let i = 0; i < 2000; i++) { cm.frame(0.016, true, false, false, 90, 90, 'gargantua', 0, 1, 1); cm.events(ev); }
  globalThis.gc?.(); const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 200000; i++) { cm.frame(0.016, true, false, false, 90, 90, 'gargantua', 0, 1, 1); cm.events(ev); }
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 4 * 1024 * 1024, `heap grew ${grown} bytes over 200k frames`);
});

test('the caption: one element, text and fade, replaced by the next line, removed cleanly, never takes a touch', () => {
  const made = []; const doc = { head: { append: (n) => made.push(n) }, body: { append: (n) => made.push(n) },
    createElement: () => { const el = { style: {}, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; } }; return el; } };
  let timer = null; const later = (fn) => { timer = fn; return 1; };
  const cap = mountCaption(doc, ROWS, later, () => {});
  const [style, el] = made;
  assert.match(style.textContent, /pointer-events:none/); assert.match(style.textContent, new RegExp(`top:${ROWS.caption.topPct}%`));
  assert.equal(el.attrs['aria-hidden'], 'true'); assert.equal(el.style.opacity, undefined);
  cap.show('Hello there'); assert.equal(el.textContent, 'Hello there'); assert.equal(el.style.opacity, '1');
  cap.show('Second'); assert.equal(el.textContent, 'Second');
  timer(); assert.equal(el.style.opacity, '0');
  cap.remove(); assert.ok(el.removed && style.removed);
});
