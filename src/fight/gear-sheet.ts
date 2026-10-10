// The gear sheet (Fitting rail, paperdoll, pack, rack) and its live mannequin, moved out of src/main.ts unchanged (Web, 2026-10-09) so Zone 1 can mount
// the same screen: every wear / stow / try-on decision is made here and nowhere else. The page hands in what it owns (profile, scene, names) as `d`.
import { captureException } from '@sentry/browser';
import { enterGearRoom, type GearRoom } from './gear-room.ts';
import { TIERS, type Tier } from '../grades.ts';
import { isLegendOpponent, legendAt } from '../legends.ts';
import { PACK, PAPERDOLL, emptyLoot, ownedName, packFull, paperdollOf, slotOf, type Loot, type LootId, type Paperdoll } from './loot.ts';
import { applyLocal, wornIdsOf, wornTiersOf, type GearOp } from './gear-ledger.ts';
import { shortLink } from '../share-store.ts';

export const lootThumb = (id: LootId) => `/game/img/loot/${id}.thumb.webp`;   // armour: scripts/loot-layers.mjs; weapons: scripts/weapon-thumbs.mjs
type View = { wear(ids: readonly string[], tiers: Record<string, Tier>): void; gearStage?: () => Parameters<typeof enterGearRoom>[0] };
export type GearSheetDeps = {
  element: <T extends HTMLElement = HTMLElement>(id: string) => T; journal: HTMLElement; canvas: HTMLElement;
  profile: () => { loot?: Loot }; persist: () => void; view: () => View; weapon: () => string;
  emptyPack?: string;   // the empty rack's line: a host that is not the Pit says its own words
  act?: (op: GearOp) => boolean;   // a signed-in character's wear / stow goes to the server (gear-ledger.ts stepsFor): true = handled; false or absent = the local ledger (a guest, the Pit today)
};
export function createGearSheet(d: GearSheetDeps) {
  const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const pieceName = (id: LootId) => ownedName(id, d.profile().loot?.taken?.[id]?.tier);   // the ledger the sheet is showing (the server's, signed in), never the device profile's
  const act = (op: GearOp) => { if (!d.act?.(op)) setLoot(applyLocal(d.profile().loot ?? emptyLoot(), op)); };
  // Show a ledger that is not the local profile's (the server's, for a signed-in character): the rig and the sheet follow it, nothing is written to the profile.
  function showLoot(loot: Loot) { d.profile().loot = loot; d.view().wear(wornIdsOf(d.profile().loot), wornTiersOf(d.profile().loot)); renderLoot(); }
  function setLoot(loot: Loot) { d.profile().loot = loot; d.persist(); d.view().wear(wornIdsOf(d.profile().loot), wornTiersOf(d.profile().loot)); renderLoot(); }
  // One rack row: the piece's name, who it was taken from, and Wear/Worn on the journal's own wear path.
  function rackRow(id: LootId): HTMLLIElement {
    const loot = d.profile().loot ?? emptyLoot(), worn = wornIdsOf(d.profile().loot);
    const li = document.createElement('li'), name = document.createElement('span'), button = document.createElement('button'), taken = loot.taken?.[id], isWorn = worn.includes(id);
    li.setAttribute('data-loot', id); li.setAttribute('data-worn', String(isWorn)); li.setAttribute('tabindex', '0');
    name.textContent = pieceName(id);
    button.setAttribute('data-wear', id); button.textContent = isWorn ? 'Worn' : 'Wear';
    button.addEventListener('click', () => act(isWorn ? { kind: 'unwear', key: paperdollOf(slotOf(id)) } : { kind: 'wear', id }));
    li.append(name);
    if (taken) {
      const small = document.createElement('small'), bold = document.createElement('b');
      // Legends (2026-09-27): a piece keeps who it was taken from, by the legend of the rung it was taken at (Provenance.tier); a
      // piece with no rung, or off the legend roster, keeps its own name as before.
      const from = id.split('.')[0]!, legend = taken.tier && isLegendOpponent(from) ? legendAt(from, taken.tier) : null;
      small.setAttribute('data-taken', ''); bold.textContent = legend ? `From ${legend.name}` : pieceName(id); bold.textContent = bold.textContent[0]!.toUpperCase() + bold.textContent.slice(1);
      small.append(bold, document.createTextNode(` · your ${ordinal(taken.attempt)} attempt, ${taken.healthLeft} health left`));
      // The Watch link names the fight's opponent (share-store shortLink): the loader refuses a record for another opponent than the page booted.
      if (taken.recordId) { const watch = document.createElement('a'); watch.setAttribute('data-watch', ''); watch.setAttribute('href', shortLink(location.origin, taken.recordId)); watch.textContent = 'Watch'; small.append(document.createTextNode(' '), watch); }
      li.append(small);
    }
    li.append(button);
    return li;
  }
  function renderLoot() {
    const loot = d.profile().loot ?? emptyLoot();
    for (const key of Object.keys(PAPERDOLL) as Paperdoll[]) {
      const id = loot.equipped[key];
      d.element(`slot-${key}-name`).textContent = id ? pieceName(id) : key === 'main' ? d.weapon()[0]!.toUpperCase() + d.weapon().slice(1) : 'Empty';
      d.element(`slot-${key}`).classList.toggle('on', !!id || key === 'main');
      d.element(`slot-${key}`).setAttribute('data-loot', id ?? '');   // the worn id, for the paperdoll's image layers (style.css loot-layers block)
      d.element(`slot-${key}`).hidden = key === 'crest' && !id;   // the rail shows the crest only while one is worn (Strategy 2026-10-01)
      thumbFor(d.element(`slot-${key}`), id);
      const off = d.element<HTMLButtonElement>(`slot-${key}-off`);
      off.hidden = !id; off.disabled = packFull(loot);   // Store moves the piece into the pack; a full pack says why beneath it (#pack-full)
      off.setAttribute('aria-describedby', off.disabled ? 'pack-full' : '');
    }
    // The pack (loot.ts PACK): the open slots hold what Store put there, each with Wear; the rest are drawn locked, a placeholder only.
    const pack = Array.from({ length: PACK.total }, (_, i) => {
      const li = document.createElement('li'), id = loot.pack?.[i];
      if (i >= PACK.open) { li.className = 'pack-locked'; li.setAttribute('aria-label', 'Locked pack slot'); return li; }
      if (!id) { li.className = 'pack-empty'; li.setAttribute('aria-label', 'Empty pack slot'); if (i === 0 && !loot.pack?.length) li.textContent = d.emptyPack ?? 'Nothing stored. Win gear in the arena.'; return li; }
      const text = document.createElement('div'), name = document.createElement('strong'), rank = document.createElement('small'), button = document.createElement('button');
      li.setAttribute('data-loot', id); name.textContent = sentence(pieceName(id)); rank.textContent = rankText(id); rank.dataset.rank = String(Math.min(10, Math.max(1, d.profile().loot?.taken?.[id]?.tier ?? 1))).padStart(2, '0');
      button.type = 'button'; button.setAttribute('data-fit', id); button.setAttribute('aria-label', `Try on ${pieceName(id)}`); button.textContent = '›';
      button.addEventListener('click', () => tryOn(id));
      text.append(name, rank); li.append(text, button); thumbFor(li, id, 'pack-thumb');
      return li;
    });
    d.element('pack').replaceChildren(...pack);
    d.element('pack-full').hidden = !(packFull(loot) && Object.keys(loot.equipped).length);
    const rows = loot.owned.map(rackRow);
    while (rows.length < 5) { const li = document.createElement('li'); li.className = 'rack-empty'; rows.push(li); }
    d.element('loot-rack').replaceChildren(...rows);
    if (fitId && !loot.pack?.includes(fitId)) fitId = null;   // the piece was worn or the pack changed under the fitting
    if (fitKey && !loot.equipped[fitKey]) fitKey = null;
    renderFitting();
  }
  // The gear sheet (Fitting rail, Strategy 2026-10-01). The rail is the slots; tapping a worn one shows it with Store, tapping a stored row
  // tries it on: the live rig wears it (in memory only: d.view().wear, never the profile) with Cancel and Wear this. Wear this is the pack's own
  // swap (loot.ts wearFromPack: the piece it replaces takes its pack place); Cancel and closing the sheet dress the rig as the profile says.
  let fitId: LootId | null = null, fitKey: Paperdoll | null = null, gear: GearRoom | undefined;
  const sentence = (text: string) => text[0]!.toUpperCase() + text.slice(1);
  const rankText = (id: LootId) => TIERS[(d.profile().loot?.taken?.[id]?.tier ?? 1) - 1] ?? 'Recruit';   // a piece with no tier reads Recruit
  // A piece's picture inside `host` (one img, made once); a piece with no thumbnail (a weapon, today) shows its name instead.
  const thumbs = new WeakMap<HTMLElement, { img: HTMLImageElement; src: string }>();
  function thumbFor(host: HTMLElement, id: LootId | undefined, cls = 'slot-thumb') {
    let t = thumbs.get(host);
    if (!t) {
      const img = document.createElement('img'); img.className = cls; img.alt = ''; img.width = img.height = 48;
      img.addEventListener('error', () => { img.hidden = true; host.classList.toggle('noart', true); });
      host.append(img); t = { img, src: '' }; thumbs.set(host, t);
    }
    host.classList.toggle('noart', !id); t.img.hidden = !id;
    if (id) { const src = lootThumb(id); if (t.src !== src) { t.src = src; host.classList.toggle('noart', false); t.img.src = src; } }
  }
  function dressed() {
    const tiers = wornTiersOf(d.profile().loot);
    if (!fitId) return d.view().wear(wornIdsOf(d.profile().loot), tiers);
    const key = paperdollOf(slotOf(fitId)), level = d.profile().loot?.taken?.[fitId]?.tier;
    d.view().wear([...wornIdsOf(d.profile().loot).filter((id) => paperdollOf(slotOf(id)) !== key), fitId], level ? { ...tiers, [fitId]: TIERS[level - 1] ?? 'Recruit' } : tiers);
  }
  const tryOn = (id: LootId | null) => { fitId = id; fitKey = null; dressed(); renderFitting(); };
  function renderFitting() {
    const loot = d.profile().loot ?? emptyLoot(), shown = fitId ?? (fitKey ? loot.equipped[fitKey] : undefined);
    const selected = fitId ? paperdollOf(slotOf(fitId)) : fitKey;
    for (const key of Object.keys(PAPERDOLL) as Paperdoll[]) { const slot = d.element(`slot-${key}`); slot.classList.toggle('sel', key === selected); slot.classList.toggle('try', !!fitId && key === selected); }
    Array.from(d.element('pack').children).forEach((li, i) => li.classList.toggle('sel', !!fitId && loot.pack?.[i] === fitId));
    d.element('fitting').hidden = !shown;
    if (!shown) return;
    const replaced = fitId ? loot.equipped[paperdollOf(slotOf(fitId))] : undefined, full = packFull(loot);
    const holder = d.element('fitting'), thumb = d.element<HTMLImageElement>('fitting-thumb');
    thumb.hidden = false; thumb.src = lootThumb(shown);
    d.element('fitting-name').textContent = sentence(pieceName(shown));
    d.element('fitting-rank').textContent = fitId ? `${rankText(fitId)} · ${replaced ? `replaces ${pieceName(replaced)}, ${rankText(replaced)}` : 'fills an empty slot'}` : `${rankText(shown)} · worn`;
    d.element('fitting-note').textContent = !fitId && full ? 'Pack full: wear a packed piece to free a slot.' : '';
    d.element('fitting-cancel').hidden = d.element('fitting-wear').hidden = !fitId;
    const store = d.element<HTMLButtonElement>('fitting-store'); store.hidden = !!fitId; store.disabled = full;
    holder.dataset.mode = fitId ? 'try' : 'worn';
  }
  d.element('fitting-thumb').addEventListener('error', () => { d.element('fitting-thumb').hidden = true; });
  d.element('fitting-cancel').addEventListener('click', () => tryOn(null));
  d.element('fitting-wear').addEventListener('click', () => { const id = fitId; fitId = fitKey = null; if (id) act({ kind: 'wearFromPack', id }); });
  d.element('fitting-store').addEventListener('click', () => { const key = fitKey; fitId = fitKey = null; if (key) act({ kind: 'stow', key }); });
  for (const key of Object.keys(PAPERDOLL) as Paperdoll[]) d.element(`slot-${key}`).addEventListener('click', (event) => {
    if ((event.target as Element).closest('.slot-off') || !d.profile().loot?.equipped[key]) return;   // an empty slot has nothing to show; the hidden per-slot Store is the old path
    const again = !fitId && fitKey === key; fitId = null; fitKey = again ? null : key; dressed(); renderFitting();
  });
  // The live mannequin: entered when the sheet opens (the arena hidden, the rig idle in the stage window), left when it closes.
  function enterGear() {
    const v = d.view();
    if (gear || typeof v.gearStage !== 'function') return;
    try { gear = enterGearRoom(v.gearStage(), d.element('gear-window'), { width: () => d.canvas.clientWidth, height: () => d.canvas.clientHeight }); d.journal.dataset.gear = 'live'; document.body.dataset.gear = 'live'; requestAnimationFrame(() => gear?.fit()); }
    catch (error) { gear = undefined; captureException(error, { tags: { gear: 'enter' } }); }
  }
  function leaveGear() {
    fitId = fitKey = null;
    if (gear) { gear.leave(); gear = undefined; }
    delete d.journal.dataset.gear; if (document.body) delete document.body.dataset.gear;
    d.view().wear(wornIdsOf(d.profile().loot), wornTiersOf(d.profile().loot)); renderFitting();
  }
  for (const key of Object.keys(PAPERDOLL) as Paperdoll[]) d.element(`slot-${key}-off`).addEventListener('click', () => act({ kind: 'stow', key }));
  return { setLoot, showLoot, act, renderLoot, enterGear, leaveGear, thumbFor, sentence, rankText, gear: () => gear };
}
