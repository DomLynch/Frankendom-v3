// Frankendom parts, stage 2 wear (Dom 2026-10-30: "you become what you kill"): the pure rules. Which equipped parts the hero wears (the save's `equipped` map, or the stills' ?wear= list), which of them
// can be worn at all (a wearable donor body, a unit with a wear row), and what changes between two loadouts. Nothing here touches three, the DOM, the sim or storage; the scene work is src/fight/parts-wear.ts.
// The rows: data/parts.json `wear` (flags, mesh prefixes, units, budget), data/parts-fit-rows.json (donors). Look only: no stat reads any of this.
import { PARTS, slotOfUnit, type PartsFile, type WearRules } from './parts.ts';
import { fitBodyOf, isWearable, type FitRowsFile, FIT_ROWS } from './parts-fit-rows.ts';

/** One part on the body: `id` = `<profile>:<slot>`, `unit` the cut unit it replaces, `stem` the donor's data/rig.json `files` key, `source` which GLB of it loads. */
export type WornPart = { id: string; profile: string; slot: string; unit: string; stem: string; source: 'derived' | 'original'; piece: string; collar: string | undefined; lift: string | undefined };
export type WearFlags = { on: boolean; force: string[] | null };

/** The page's wear switches (?parts=off wears nothing; ?wear=<id>,<id> wears exactly those ids and ignores the save). Pure on the search string, like every flag row (radar.ts radarOn). */
export function wearFlags(search: string, rows: WearRules = PARTS.wear): WearFlags {
  const q = new URLSearchParams(search), list = q.get(rows.flags.force.query);
  return { on: q.get(rows.flags.off.query) !== rows.flags.off.value, force: list === null ? null : list.split(',').map((s) => s.trim()).filter(Boolean) };
}

/** The unit a slot wears, or null (the weapon slot has none). A slot holds one unit today; the first is the one worn. */
export const unitOfSlot = (slot: string, file: PartsFile = PARTS): string | null => file.slots.find((s) => s.id === slot)?.units[0] ?? null;
/** `profile:slot` split, or null. Profiles are lower-case ids, slots data/parts.json ids. */
export function splitId(id: string): { profile: string; slot: string } | null {
  const i = id.indexOf(':');
  return i > 0 && i < id.length - 1 ? { profile: id.slice(0, i), slot: id.slice(i + 1) } : null;
}
/** The data/rig.json `files` key of a donor body: its fit row's `stem`, else the profile id. */
export const stemOf = (profile: string, rows: FitRowsFile = FIT_ROWS): string => fitBodyOf(profile, rows)?.stem ?? profile;

/** Whether a slot of boss `profile` can be worn: the donor body is wearable (the Equip button gate, parts-panel.ts) AND the slot's unit has a wear row (the torso has none yet). */
export function canWear(profile: string, slot: string, file: PartsFile = PARTS, rows: FitRowsFile = FIT_ROWS): boolean {
  const unit = unitOfSlot(slot, file);
  return unit !== null && unit in file.wear.units && isWearable(profile, rows);
}

/** The loadout to wear, in slot order: an `equipped` map (slot -> part id), cleaned. An id for another slot, an unwearable donor, a slot with no wear row or a second id for a slot is dropped; at most `budget.partsMax`. */
export function wornParts(equipped: Readonly<Record<string, string>> | readonly string[] | null | undefined, file: PartsFile = PARTS, rows: FitRowsFile = FIT_ROWS): WornPart[] {
  const ids = Array.isArray(equipped) ? (equipped as string[]) : Object.values(equipped ?? {}), bySlot = new Map<string, WornPart>();
  for (const id of ids) {
    const p = typeof id === 'string' ? splitId(id) : null;
    if (!p || bySlot.has(p.slot) || !canWear(p.profile, p.slot, file, rows)) continue;
    const unit = unitOfSlot(p.slot, file)!, row = file.wear.units[unit]!, body = fitBodyOf(p.profile, rows)!;
    bySlot.set(p.slot, { id, profile: p.profile, slot: p.slot, unit, stem: stemOf(p.profile, rows), source: body.source ?? 'original', piece: row.piece ?? unit, collar: row.collar, lift: row.lift });
  }
  return file.slots.flatMap((s) => (bySlot.has(s.id) ? [bySlot.get(s.id)!] : [])).slice(0, file.wear.budget.partsMax);
}

/** What changes from loadout `prev` to `next`: parts to take off (gone or replaced in their slot) and to put on. Same ids in both: nothing. */
export function wearDiff(prev: readonly WornPart[], next: readonly WornPart[]): { remove: WornPart[]; add: WornPart[] } {
  const keep = new Set(next.map((p) => p.id)), had = new Set(prev.map((p) => p.id));
  return { remove: prev.filter((p) => !keep.has(p.id)), add: next.filter((p) => !had.has(p.id)) };
}

/** Whether a donor GLB node name is a piece named `piece` (WornPart.piece: the unit, or the data/parts.json wear row's own name): `piece_<piece>` or `piece_<piece>_*` (the Minotaur's head is two pieces, piece_head_left and piece_head_right). */
export const isPieceOf = (name: string, unit: string, rules: WearRules = PARTS.wear): boolean => name === rules.mesh.piece + unit || name.startsWith(rules.mesh.piece + unit + rules.mesh.join);

/** The slot a unit fills (re-export for the scene work: one import for the wear module). */
export const slotOf = (unit: string, file: PartsFile = PARTS): string | null => slotOfUnit(unit, file);
