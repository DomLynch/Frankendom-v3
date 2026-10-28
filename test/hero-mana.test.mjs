// "Remove mana for now" (Dom 2026-10-28): the HERO has no MANA bar and no mana cost or gate (data/fight.json heroMana, src/fight/hero-mana.ts);
// ?mana=v1 restores both. The opponents keep their own pool and spells. The flag is an era flag like special-terms: off in a headless run, so every other suite steps today's numbers.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HERO_NO_MANA, heroNoManaFor, heroPool, manaFree, setHeroNoMana } from '../src/fight/hero-mana.ts';
import { initialDuel, createFighter, legal, opponentFighter } from '../src/fight/duel.ts';
import { OPPONENTS } from '../src/fight/moves.ts';
import { MANA_MAX } from '../src/fight/sandbox-rules.ts';
import { mountManaBar } from '../src/fight/mana-bar.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
afterEach(() => setHeroNoMana(false));

// A document with just enough DOM for mountManaBar: a #stamina anchor and a head.
function page() {
  const byId = new Map(), made = [];
  const el = (tag) => ({ tag, style: { setProperty() {} }, setAttribute() {}, append() {}, insertAdjacentElement(_w, n) { made.push(n); if (n.id) byId.set(n.id, n); } });
  const doc = { head: el('head'), createElement: (tag) => el(tag), getElementById: (id) => (id === 'stamina' ? el('meter') : byId.get(id) ?? null) };
  return { doc, made };
}

test('the data row: no hero mana by default; ?mana=v1 = the bar and the cost; a bad row throws', () => {
  assert.equal(FIGHT.heroMana.mana, false);
  assert.equal(heroNoManaFor(FIGHT.heroMana, ''), true, 'default: no mana');
  assert.equal(heroNoManaFor(FIGHT.heroMana, '?ring=v1'), true);
  assert.equal(heroNoManaFor(FIGHT.heroMana, '?mana=v1'), false, '?mana=v1 restores it');
  assert.equal(heroNoManaFor(FIGHT.heroMana, '?spec=v1&mana=v1'), false);
  assert.equal(heroNoManaFor(undefined, ''), false, 'no row = off');
  assert.throws(() => heroNoManaFor({ mana: 0 }, ''), /boolean/);
  assert.equal(HERO_NO_MANA, false, 'a headless run is off unless a driver sets it');
});

test('the HUD: no MANA bar by default (the STAMINA bar keeps the row); ?mana=v1 mounts it', () => {
  assert.ok(MANA_MAX > 0, 'the sandbox mana rows are on, so the bar would mount');
  setHeroNoMana(true);
  const a = page();
  assert.equal(mountManaBar(a.doc, MANA_MAX), null);
  assert.equal(a.made.length, 0, 'no caption, no meter, no layout CSS');
  setHeroNoMana(false);
  const b = page();
  assert.ok(mountManaBar(b.doc, MANA_MAX), '?mana=v1: the bar mounts as before');
  assert.equal(b.made.length, 2);
});

test('the sim: the hero carries no pool and nothing he shoots is gated on mana; the foe keeps hers', () => {
  const stripped = (on) => { setHeroNoMana(on); return initialDuel(OPPONENTS.veteran, 'staff').fighters; };
  let [hero, foe] = stripped(true);
  assert.equal(hero.maxMana, undefined, 'no pool'); assert.equal(hero.mana, undefined);
  assert.equal(manaFree(hero), true);
  assert.equal(foe.maxMana, MANA_MAX, 'the foe still carries her pool'); assert.equal(manaFree(foe), false);
  assert.equal(legal({ ...hero, phase: 'ready' }, 'light'), true, 'a staff bolt is not refused for want of mana');
  assert.equal(legal({ ...foe, phase: 'ready', mana: 0, weapon: 'staff' }, 'light'), false, 'the foe is still refused with an empty pool');
  [hero] = stripped(false);
  assert.equal(hero.maxMana, MANA_MAX, '?mana=v1: the pool is back');
  assert.equal(legal({ ...hero, phase: 'ready', mana: 0 }, 'light'), false, '?mana=v1: refused with an empty pool, as before');
  assert.equal(opponentFighter(OPPONENTS.veteran, hero.body).maxMana, MANA_MAX);
  assert.equal(heroPool(createFighter(hero.body, 'ready')).maxMana, MANA_MAX, 'flag off: heroPool changes nothing');
});
