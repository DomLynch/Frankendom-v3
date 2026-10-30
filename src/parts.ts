// Frankendom parts, stage 1 (data/parts.json; Dom 2026-10-28: "you become what you kill"). The pure rules: a part is `<profile id>:<slot id>`, collected automatically when a fallen boss is cut (the corpse:cut event),
// kept with the highest star level it was cut at, equipped one per slot. The inventory rides in the progression save as two OPTIONAL fields (`parts`, `equipped`): a save from before them loads with both
// empty, and a save with none is byte for byte the one before. Nothing here touches storage, the DOM or the sim; the page (src/fight/parts-hook.ts) and the menu (parts-panel.ts) call these.
import ROWS from '../data/parts.json' with { type: 'json' };
import PROFILE_ROWS from '../data/profiles.json' with { type: 'json' };
import { validateFit, validateWear } from './sim/validate-parts-fit.js';
const KNOWN_PROFILES: ReadonlySet<string> = new Set((PROFILE_ROWS.profiles as { id: string }[]).map((p) => p.id));   // the bosses a part can come from (data/profiles.json)

type SlotRow = { id: string; label: string; units: string[] };
type RarityRow = { star: number; id: string; label: string; colour: string };
/** One collar seam: the bone it rides, `at` (fraction of the bone's length to its first child) and the sizing rule it takes. */
export type CollarJoint = { id: string; bone: string; at: number; rule: string };
export type CollarRule = { rOf: string; rK: number; hOf: string; hK: number; hMin: number };
/** data/parts.json `fit`: every tuning number of src/fight/parts-fit.ts. */
export type FitRules = {
  limits: { boneLo: number; boneHi: number; heightLo: number; heightHi: number; coverFrac: number; meanK: number };
  seam: { bandM: number; minVerts: number; percentile: number; uvPercentile: number };
  eps: { heightM: number; boneM: number };
  bones: { hips: string; head: string };
  lift: { unit: string; keys: string[] };
  skin: { influences: number; uvStride: number };
  collar: { segments: number; roundScale: number; heightKey: string; fallback: Record<string, { of?: string; k: number }>; joints: CollarJoint[]; rules: Record<string, CollarRule> };
};
/** data/parts.json `wear`: the rules of src/parts-wear.ts and src/fight/parts-wear.ts (the flags, the mesh-name prefixes, which units can be worn and where their seam is, the budget). */
export type WearRules = {
  flags: { off: { query: string; value: string }; force: { query: string } };
  mesh: { piece: string; cap: string; join: string; source: Record<'derived' | 'original', string> };
  units: Record<string, { piece?: string; collar?: string; lift?: string }>;
  heroHost: Record<string, string>;
  heroCollars: string[];
  budget: { skinnedDrawsMax: number; partsMax: number; frameMsMedianExtra: number };
};
export type PartsFile = {
  maxCount: number; slots: SlotRow[]; rarities: RarityRow[]; fit: FitRules; wear: WearRules;
  button: { label: string; aria: string; sizePx: number; topPx: number; rightPx: number; zIndex: number };
  panel: { zIndex: number; maxWidthPx: number; maxHeightFrac: number };
  text: Record<'notWearable' | 'title' | 'close' | 'hint' | 'empty' | 'equip' | 'unequip' | 'equipped' | 'none' | 'weaponDefault' | 'weaponReward', string>;
};
/** One owned part: how many times it was cut (all stars) and the best star level it was cut at. */
export type PartRow = { n: number; star: number };
/** The two optional save fields. */
export type PartsSave = { parts?: Record<string, PartRow>; equipped?: Record<string, string> };

const ID = /^[a-z0-9][a-z0-9-]*$/, HEX = /^#[0-9a-fA-F]{6}$/;

/** Why `file` is not a good parts table (one string per problem; empty = fine). `profileIds`: data/profiles.json ids (unused by rows today, kept for the stage 2 stat rows); `stars`: how many data/stars.json levels exist. */
export function validateParts(file: PartsFile, stars: number): string[] {
  const e: string[] = [], word = (at: string, v: unknown, max = 60) => { if (!(typeof v === 'string' && v.trim().length > 0 && v.length <= max)) e.push(`parts.${at}: 1-${max} characters`); };
  const num = (at: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) e.push(`parts.${at}: a number in ${lo}..${hi}`); };
  num('maxCount', file.maxCount, 1, 99999);
  const ids = new Set<string>(), units = new Set<string>();
  if (!Array.isArray(file.slots) || !file.slots.length) e.push('parts.slots: at least one slot');
  for (const s of file.slots ?? []) {
    const at = `slots.${String(s.id)}`;
    if (typeof s.id !== 'string' || !/^[a-z][a-z_]*$/.test(s.id) || ids.has(s.id)) e.push(`parts.${at}: a unique lower-case id`); else ids.add(s.id);
    word(`${at}.label`, s.label, 24);
    if (!Array.isArray(s.units)) e.push(`parts.${at}.units: a list`);
    else for (const u of s.units) if (typeof u !== 'string' || !/^[a-z_]+$/.test(u) || units.has(u)) e.push(`parts.${at}.units: "${String(u)}" is not a unit name, or another slot has it`); else units.add(u);
  }
  if (!ids.has('weapon')) e.push('parts.slots: a "weapon" slot (the boss-weapon reward is shown there)');
  if (!Array.isArray(file.rarities) || file.rarities.length !== stars) e.push(`parts.rarities: one row per data/stars.json level (${stars})`);
  (file.rarities ?? []).forEach((r, i) => {
    if (r.star !== i) e.push(`parts.rarities[${i}].star: ${i} (rows in star order)`);
    word(`rarities[${i}].label`, r.label, 16);
    if (typeof r.id !== 'string' || !ID.test(r.id)) e.push(`parts.rarities[${i}].id: a lower-case word`);
    if (!(typeof r.colour === 'string' && HEX.test(r.colour))) e.push(`parts.rarities[${i}].colour: a #rrggbb colour`);
  });
  for (const k of ['sizePx', 'topPx', 'rightPx', 'zIndex'] as const) num(`button.${k}`, file.button?.[k], 0, 1000);
  word('button.label', file.button?.label, 4); word('button.aria', file.button?.aria, 80);
  num('panel.zIndex', file.panel?.zIndex, 0, 1000); num('panel.maxWidthPx', file.panel?.maxWidthPx, 200, 800); num('panel.maxHeightFrac', file.panel?.maxHeightFrac, 0.3, 1);
  for (const [k, v] of Object.entries(file.text ?? {})) word(`text.${k}`, v, 80);
  e.push(...validateWear(file.wear, file.fit, file.slots));
  e.push(...validateFit(file.fit));   // src/sim/validate-parts-fit.js (diagnostics are plain words and src/*.ts is scanned for them: the same split as validate-rings.js)
  return e;
}
export const PARTS = ROWS as unknown as PartsFile;

export const partId = (profile: string, slot: string): string => `${profile}:${slot}`;
/** The slot a cut unit fills, or null (a visual unit such as head_split, or a unit the table does not name). */
export const slotOfUnit = (unit: string, file: PartsFile = PARTS): string | null => file.slots.find((s) => s.units.includes(unit))?.id ?? null;
/** `profile:slot` split, or null when it is not an id of this table's shape. */
function splitPart(id: string, file: PartsFile = PARTS): { profile: string; slot: string } | null {
  const i = id.indexOf(':');
  if (i < 1) return null;
  const profile = id.slice(0, i), slot = id.slice(i + 1);
  return ID.test(profile) && file.slots.some((s) => s.id === slot && s.units.length) ? { profile, slot } : null;
}

const partsOf = (s: PartsSave): Record<string, PartRow> => s.parts ?? {};

/** The save after boss `profile`'s `unit` is cut at `star` (a new object; the same one when the unit fills no slot or the profile is no id). Counts every cut, keeps the best star. */
export function collect<T extends PartsSave>(save: T, profile: string, unit: string, star = 0, file: PartsFile = PARTS): T {
  const slot = slotOfUnit(unit, file);
  if (!slot || !ID.test(profile)) return save;
  const id = partId(profile, slot), old = partsOf(save)[id], s = Math.max(0, Math.min(file.rarities.length - 1, Math.floor(star) || 0));
  return { ...save, parts: { ...partsOf(save), [id]: { n: Math.min(file.maxCount, (old?.n ?? 0) + 1), star: Math.max(old?.star ?? 0, s) } } };
}

/** The save with `id` worn in its slot (one per slot; wearing the worn part again changes nothing). The same save when the part is not owned. */
export function equip<T extends PartsSave>(save: T, id: string, file: PartsFile = PARTS): T {
  const p = splitPart(id, file);
  if (!p || !partsOf(save)[id] || save.equipped?.[p.slot] === id) return save;
  return { ...save, equipped: { ...(save.equipped ?? {}), [p.slot]: id } };
}
/** The save with `slot` empty (the same save when it already was). */
export function unequip<T extends PartsSave>(save: T, slot: string): T {
  if (!save.equipped || save.equipped[slot] === undefined) return save;
  const equipped = { ...save.equipped }; delete equipped[slot];
  return { ...save, equipped };
}

/** The two fields from a parsed save object, cleaned: unknown shapes dropped, counts and stars clamped, an equipped part kept only while it is owned and fits its slot. Absent when empty. */
export function cleanParts(j: { parts?: unknown; equipped?: unknown }, file: PartsFile = PARTS, known: ReadonlySet<string> = KNOWN_PROFILES): PartsSave {
  const parts: Record<string, PartRow> = {}, out: PartsSave = {}, cap = known.size * file.slots.filter((s) => s.units.length).length;   // at most one part per known boss and slot: a hand-edited save cannot grow without bound
  if (j.parts && typeof j.parts === 'object' && !Array.isArray(j.parts))
    for (const [id, v] of Object.entries(j.parts as Record<string, unknown>)) {
      const r = v as { n?: unknown; star?: unknown }, at = splitPart(id, file);
      if (Object.keys(parts).length >= cap) break;
      if (!at || !known.has(at.profile) ||!r || typeof r !== 'object' || typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 1) continue;
      const star = typeof r.star === 'number' && Number.isInteger(r.star) ? Math.max(0, Math.min(file.rarities.length - 1, r.star)) : 0;
      parts[id] = { n: Math.min(file.maxCount, r.n), star };
    }
  if (Object.keys(parts).length) out.parts = parts;
  const equipped: Record<string, string> = {};
  if (j.equipped && typeof j.equipped === 'object' && !Array.isArray(j.equipped))
    for (const [slot, id] of Object.entries(j.equipped as Record<string, unknown>)) if (typeof id === 'string' && parts[id] && splitPart(id, file)?.slot === slot) equipped[slot] = id;
  if (Object.keys(equipped).length) out.equipped = equipped;
  return out;
}

/** One line of the menu: a part to show. `name`: the boss's name + the slot's label. */
type PartView = { id: string; profile: string; name: string; boss: string; n: number; star: number; rarity: RarityRow; trophy: string | null; worn: boolean };
export type SlotView = { slot: SlotRow; worn: PartView | null; parts: PartView[] };
/** The menu's rows, pure: every slot with the parts owned for it (best star first, then by boss name). `bossName`: profile id -> display name; `trophyOf`: star -> trophy name (null for none). The weapon slot has no parts (the page shows its reward). */
export function slotViews(save: PartsSave, bossName: (profile: string) => string, trophyOf: (star: number) => string | null, file: PartsFile = PARTS): SlotView[] {
  return file.slots.map((slot) => {
    const parts: PartView[] = [];
    for (const [id, row] of Object.entries(partsOf(save))) {
      const p = splitPart(id, file);
      if (!p || p.slot !== slot.id) continue;
      const boss = bossName(p.profile), rarity = file.rarities[row.star] ?? file.rarities[0]!;
      parts.push({ id, profile: p.profile, name: `${boss} ${slot.label.toLowerCase()}`, boss, n: row.n, star: row.star, rarity, trophy: trophyOf(row.star), worn: save.equipped?.[slot.id] === id });
    }
    parts.sort((a, b) => b.star - a.star || a.boss.localeCompare(b.boss));
    return { slot, worn: parts.find((p) => p.worn) ?? null, parts };
  });
}
