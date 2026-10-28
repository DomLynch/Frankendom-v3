// Frankendom parts, stage 1 (data/parts.json, src/parts.ts, src/fight/parts-hook.ts, parts-panel.ts): the data checks, the pure rules, the save round trip (old saves load), the cut event
// naming the profile, and the menu driven the way a finger does (click on the buttons; the real feel bus carries the cut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARTS, cleanParts, collect, equip, partId, slotOfUnit, slotViews, unequip, validateParts } from '../src/parts.ts';
import { freshSave, loadSave, parseSave, writeSave, recordKill } from '../src/progression.ts';
import { validateFile } from '../src/sim/validate.js';
import { emitFeel } from '../src/fight/feel.ts';
import { noteLife } from '../src/fight/foe-name.ts';
import { mountParts } from '../src/fight/parts-hook.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const P = read('progression'), STARS = read('stars'), PROFILES = read('profiles'), PHYS = read('physics'), RAW = read('parts');
const clone = (o) => JSON.parse(JSON.stringify(o));
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), m }; };

test('data/parts.json is valid, every unit is one the physics cut cues', () => {
  assert.deepEqual(validateParts(PARTS, STARS.levels.length), []);
  assert.deepEqual(validateFile('parts', RAW), []);
  const cue = new Set(read('pickup').units);
  for (const s of PARTS.slots) for (const u of s.units) assert.ok(cue.has(u), `${s.id}: ${u} is a cut unit`);
  for (const u of cue) assert.ok(slotOfUnit(u), `${u} fills a slot`);
  assert.equal(PHYS.corpse.event, 'corpse:cut');
});

test('a bad table is named', () => {
  const bad = clone(PARTS); bad.slots[1].id = 'head'; bad.rarities.pop(); bad.rarities[0].colour = 'red'; bad.slots[6].id = 'x';
  const e = validateParts(bad, 3).join('\n');
  assert.match(e, /unique lower-case id/); assert.match(e, /one row per data\/stars\.json level/); assert.match(e, /colour/); assert.match(e, /"weapon" slot/);
  assert.match(validateFile('parts', { ...RAW, extra: 1 }).join(), /extra: unknown key/);
});

test('collect: a cut adds the part, counts repeats, keeps the best star, ignores visual units', () => {
  let s = freshSave();
  s = collect(s, 'gargantua', 'arm_left', 0);
  assert.deepEqual(s.parts, { 'gargantua:arm_left': { n: 1, star: 0 } });
  s = collect(s, 'gargantua', 'arm_left', 2); s = collect(s, 'gargantua', 'arm_left', 1);
  assert.deepEqual(s.parts['gargantua:arm_left'], { n: 3, star: 2 });
  assert.equal(collect(s, 'gargantua', 'head_split'), s, 'a visual unit fills no slot');
  assert.equal(collect(s, 'Bad Id', 'head'), s);
  assert.equal(slotOfUnit('torso_waist'), 'torso');
  assert.equal(collect(freshSave(), 'a', 'head', 9).parts['a:head'].star, 2, 'star is held to the table');
});

test('equip: one per slot, only owned parts, unequip empties the slot', () => {
  let s = collect(collect(freshSave(), 'gargantua', 'leg_left'), 'arachne', 'leg_left');
  assert.equal(equip(s, 'pitborn:leg_left'), s, 'not owned');
  assert.equal(equip(s, 'gargantua:weapon'), s, 'the weapon slot has no parts');
  s = equip(s, 'gargantua:leg_left'); assert.deepEqual(s.equipped, { leg_left: 'gargantua:leg_left' });
  s = equip(s, 'arachne:leg_left'); assert.deepEqual(s.equipped, { leg_left: 'arachne:leg_left' }, 'replaces');
  assert.equal(equip(s, 'arachne:leg_left'), s);
  s = unequip(s, 'leg_left'); assert.deepEqual(s.equipped, {});
  assert.equal(unequip(s, 'leg_left'), s);
});

test('save: parts and equipped round trip; an old save loads with neither; junk is dropped', () => {
  const st = store();
  let s = collect(collect(recordKill(freshSave(), 'gargantua', P).save, 'gargantua', 'head', 1), 'arachne', 'torso_waist');
  s = equip(s, 'gargantua:head');
  assert.ok(writeSave(st, P, s));
  const back = loadSave(st, P);
  assert.deepEqual(back.parts, s.parts); assert.deepEqual(back.equipped, s.equipped); assert.deepEqual(back.kills, s.kills);
  const old = JSON.stringify({ v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 5, banked: 0, pile: null, lost: [] });
  const o = parseSave(old, P);
  assert.equal(o.parts, undefined); assert.equal(o.equipped, undefined); assert.equal(o.coins, 5);
  const noParts = store(); writeSave(noParts, P, o);
  assert.ok(!('parts' in JSON.parse(noParts.m.get(P.key))), 'a save with no parts writes none');
  const junk = parseSave(JSON.stringify({ ...JSON.parse(old), parts: { 'arachne:head': { n: -1 }, 'bad': { n: 1 }, 'arachne:leg_left': { n: 2, star: 99 }, 'arachne:weapon': { n: 1 }, 'nobody:head': { n: 1, star: 0 } }, equipped: { head: 'nope', leg_left: 'arachne:leg_left', leg_right: 'arachne:leg_left' } }), P);
  assert.deepEqual(junk.parts, { 'arachne:leg_left': { n: 2, star: 2 } }, 'unknown bosses, bad ids and the weapon slot are dropped'); assert.deepEqual(junk.equipped, { leg_left: 'arachne:leg_left' }, 'worn only in its own slot'); junk.equipped = undefined; assert.equal(junk.equipped, undefined, 'an equipped part must be owned and fit its slot');
  assert.deepEqual(cleanParts({ parts: [], equipped: 3 }), {});
});

test('slotViews: rarity from star, trophy tie-in, worn marked, best first', () => {
  let s = collect(collect(collect(freshSave(), 'gargantua', 'head', 0), 'arachne', 'head', 2), 'pitborn', 'arm_left', 1);
  s = equip(s, 'arachne:head');
  const names = { gargantua: 'Gargantua', arachne: 'Arachne', pitborn: 'Minotaur' };
  const v = slotViews(s, (p) => names[p], (star) => STARS.levels[star].trophy?.name ?? null);
  const head = v.find((x) => x.slot.id === 'head');
  assert.deepEqual(head.parts.map((p) => [p.name, p.rarity.id, p.trophy, p.worn]), [['Arachne head', 'epic', 'Gold trophy', true], ['Gargantua head', 'common', null, false]]);
  assert.equal(head.worn.id, 'arachne:head');
  assert.equal(v.find((x) => x.slot.id === 'arm_left').parts[0].rarity.label, 'Rare');
  assert.equal(v.find((x) => x.slot.id === 'weapon').parts.length, 0);
  assert.equal(v.length, 7);
});

// ---- the menu and the hook, with a tiny DOM (click = the handler a finger reaches) and the real feel bus ----
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.style = {}; this.hidden = false; this.className = ''; this.textContent = ''; this.parent = null; }
  append(...k) { for (const c of k) { if (typeof c === 'string') this.children.push(Object.assign(new El('#text'), { textContent: c })); else { c.parent = this; this.children.push(c); } } }
  replaceChildren() { this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  all(out = []) { out.push(this); for (const c of this.children) c.all(out); return out; }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].join(' '); }
}
const mkDoc = () => ({ createElement: (t) => new El(t), body: new El('body'), head: new El('head') });
const find = (doc, pred) => doc.body.all().find(pred);
const click = (e) => e.onclick();

function page(saveIn) {
  const doc = mkDoc(), box = { save: saveIn };
  const hook = mountParts({ get: () => box.save, put: (s) => { box.save = s; }, profiles: PROFILES.profiles, stars: STARS, prog: P }, doc);
  return { doc, box, hook };
}

test('a cut of a fallen boss is kept automatically with its profile and kill star; the menu lists and equips it', () => {
  const { doc, box, hook } = page(freshSave());
  emitFeel(PHYS.corpse.event, { unit: 'arm_right', gear: [], source: 'tap', corpseId: 'shieldmaiden#4', profile: 'arachne', star: 2 });
  emitFeel(PHYS.corpse.event, { unit: 'head_split', gear: [], source: 'tap', corpseId: 'shieldmaiden#4', profile: 'arachne', star: 2 });
  emitFeel(PHYS.corpse.event, { unit: 'head', gear: [], source: 'tap', corpseId: 'shieldmaiden#4' });   // no profile: ignored
  assert.deepEqual(box.save.parts, { 'arachne:arm_right': { n: 1, star: 2 } });
  assert.equal(find(doc, (e) => e.dataset.frank === 'sheet').hidden, true, 'no prompt opens on the body');
  click(find(doc, (e) => e.dataset.frank === 'button'));
  const sheet = find(doc, (e) => e.dataset.frank === 'sheet');
  assert.equal(sheet.hidden, false);
  assert.match(sheet.text(), /Arachne right arm/); assert.match(sheet.text(), /Epic/); assert.match(sheet.text(), /Gold trophy/); assert.match(sheet.text(), /Longsword/);
  click(find(doc, (e) => e.dataset.frank === 'equip'));
  assert.deepEqual(box.save.equipped, { arm_right: 'arachne:arm_right' });
  assert.ok(find(doc, (e) => e.dataset.frank === 'unequip'), 'the button flips');
  click(find(doc, (e) => e.dataset.frank === 'unequip'));
  assert.equal(box.save.equipped?.arm_right, undefined);
  emitFeel(PHYS.corpse.event, { unit: 'leg_left', gear: [], source: 'tap', corpseId: 'x#1', profile: 'arachne', star: 0 });
  assert.match(sheet.text(), /Arachne left leg/, 'a cut while the menu is open shows at once');
  click(find(doc, (e) => e.dataset.frank === 'close')); assert.equal(sheet.hidden, true);
  hook.remove();
  emitFeel(PHYS.corpse.event, { unit: 'head', gear: [], source: 'tap', corpseId: 'x#1', profile: 'arachne' });
  assert.equal(box.save.parts['arachne:head'], undefined, 'removed: no longer listening');
});

test('the weapon slot shows the newest boss-weapon reward; no save collects nothing', () => {
  const s = recordKill(recordKill(freshSave(), 'gargantua', P).save, 'pitborn', P).save;
  const { doc, hook } = page(s);
  click(find(doc, (e) => e.dataset.frank === 'button'));
  const w = find(doc, (e) => e.dataset.slot === 'weapon');
  assert.match(w.text(), /Maul/); assert.match(w.text(), /Minotaur/); assert.ok(!w.all().some((e) => e.tag === 'button'), 'the reward is shown, not equipped here');
  hook.remove();
  const none = page(null);
  emitFeel(PHYS.corpse.event, { unit: 'head', gear: [], source: 'tap', corpseId: 'x#1', profile: 'arachne' });
  assert.equal(none.box.save, null); none.hook.remove();
});

test('a tap outside the sheet (the backdrop) closes it', () => {
  const { doc, hook } = page(freshSave());
  const back = find(doc, (e) => e.dataset.frank === 'backdrop'), sheet = find(doc, (e) => e.dataset.frank === 'sheet');
  assert.equal(back.hidden, true);
  click(find(doc, (e) => e.dataset.frank === 'button'));
  assert.equal(back.hidden, false); assert.equal(sheet.hidden, false);
  click(back);
  assert.equal(sheet.hidden, true); assert.equal(back.hidden, true);
  hook.remove();
});

test('partId is profile:slot', () => assert.equal(partId('arachne', 'head'), 'arachne:head'));

test('rarity follows each kill: a 2-star boss then a 0-star one; the killing-blow cut carries the star of its own life', () => {
  const { box, hook } = page(freshSave());
  emitFeel(PHYS.corpse.event, { unit: 'arm_left', gear: [], source: 'finisher', corpseId: 'executioner#1', profile: 'gargantua', star: 2 });
  emitFeel(PHYS.corpse.event, { unit: 'leg_left', gear: [], source: 'tap', corpseId: 'executioner#2', profile: 'gargantua', star: 0 });
  emitFeel(PHYS.corpse.event, { unit: 'leg_right', gear: [], source: 'tap', corpseId: 'executioner#1', profile: 'gargantua', star: 2 });   // a tap on the older corpse later
  assert.equal(box.save.parts['gargantua:arm_left'].star, 2);
  assert.equal(box.save.parts['gargantua:leg_left'].star, 0, 'the 0-star kill is not lent the earlier 2');
  assert.equal(box.save.parts['gargantua:leg_right'].star, 2);
  emitFeel(PHYS.corpse.event, { unit: 'head', gear: [], source: 'tap', corpseId: 'executioner#3', profile: 'gargantua' });   // an event with no star is a 0-star cut
  assert.equal(box.save.parts['gargantua:head'].star, 0);
  hook.remove();
});

test('the page hands the star to the cut: ragdoll.ts reads kind and star at the kill, main.ts sets both', () => {
  const rag = readFileSync(new URL('../src/fight/ragdoll.ts', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  // the life is noted at the TOP of the kill, before the finisher skip branch (a beheading finisher cuts through scene.finisherCut with mode 'skip' and never reaches the else branch)
  const killAt = rag.indexOf('if (killed) {'), noteAt = rag.indexOf('noteLife(lifeProfiles, lifeId'), skipAt = rag.indexOf("mode = 'skip'", killAt), elseAt = rag.indexOf('rd.kill(blowImpulse', killAt);
  assert.ok(killAt > 0 && noteAt > killAt && noteAt < skipAt && noteAt < elseAt, 'noteLife runs before the skip branch and the plain-death branch');
  assert.equal(rag.split('noteLife(lifeProfiles').length - 1, 1, 'noted once, not per branch');
  assert.match(rag, /star: lifeProfiles\.get\(corpseId\)\?\.star \?\? 0/);
  assert.match(main, /setActiveKind\(k\.kind, k\.star \?\? 0\)/);
});

test('a finisher kill (skip mode, the head cut after the kill) yields a part of the kill\'s own star, and the next life never lends its', () => {
  const lives = new Map(), { box, hook } = page(freshSave());
  // the page's order on the default finisher path: kill frame (noteLife), later scene.finisherCut announces the head cut for that corpse id
  const announce = (corpseId, unit, fallback) => emitFeel(PHYS.corpse.event, { unit, gear: [], source: 'finisher', corpseId, profile: lives.get(corpseId)?.profile ?? fallback, star: lives.get(corpseId)?.star ?? 0 });
  noteLife(lives, 'executioner#1', 'gargantua', 2);
  announce('executioner#1', 'head', 'gargantua');
  assert.equal(box.save.parts['gargantua:head'].star, 2, 'a 2-star boss beheaded by a finisher is an Epic head, not Common');
  noteLife(lives, 'executioner#2', 'gargantua', 0);
  announce('executioner#2', 'arm_left', 'gargantua');
  assert.equal(box.save.parts['gargantua:arm_left'].star, 0);
  for (let i = 3; i < 30; i++) noteLife(lives, `executioner#${i}`, 'gargantua', 0);
  assert.ok(lives.size <= 16, 'capped');
  hook.remove();
});

test('cleanParts holds a save to the known bosses and one part per boss and slot', () => {
  const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`arachne${i}:head`, { n: 1, star: 0 }]));
  assert.equal(cleanParts({ parts: many }).parts, undefined, 'unknown bosses');
  const known = new Set(['a', 'b']), wide = Object.fromEntries(['a', 'b', 'c'].flatMap((p) => ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso'].map((s) => [`${p}:${s}`, { n: 1, star: 0 }])));
  assert.equal(Object.keys(cleanParts({ parts: wide }, PARTS, known).parts).length, 12);
});
