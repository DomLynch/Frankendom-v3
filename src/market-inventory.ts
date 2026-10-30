// The Flesh Market's ONE door to the parts inventory (docs/flesh-market.md section 5). Everything the market knows about a player's parts is in this file: swap the file and the market follows. Today it reads the
// fields the Frankendom parts stage keeps in the progression save (src/parts.ts: `parts[id] = {n, star}`, `equipped[slot] = id`, id = `<profile>:<slot>`); if that shape moves, only this file changes.
// Pure: every function takes a save and returns data or a new save, never touches storage, the DOM or the sim.
import { PARTS, splitPart } from './parts.ts';
import type { PartRow } from './parts.ts';

/** The fields of a save this file reads and writes. */
export type InventorySave = { parts?: Record<string, PartRow>; equipped?: Record<string, string> };
/** One owned part as the market sees it: `sellable` copies leave out the last copy of a worn part. */
export type OwnedPart = { id: string; profile: string; slot: string; n: number; star: number; sellable: number };

/** Every part the player owns, in table order (slot, then id), with how many copies he may sell. */
export function listParts(save: InventorySave): OwnedPart[] {
  const out: OwnedPart[] = [];
  for (const [id, row] of Object.entries(save.parts ?? {})) {
    const p = splitPart(id);
    if (!p || !(row.n >= 1)) continue;
    const worn = save.equipped?.[p.slot] === id ? 1 : 0;
    out.push({ id, profile: p.profile, slot: p.slot, n: row.n, star: row.star, sellable: Math.max(0, row.n - worn) });
  }
  const order = new Map(PARTS.slots.map((s, i) => [s.id, i]));
  return out.sort((a, b) => (order.get(a.slot) ?? order.size) - (order.get(b.slot) ?? order.size) || b.star - a.star || a.id.localeCompare(b.id));
}

/** How many of `id` the player owns (0 when none). */
export const countOf = (save: InventorySave, id: string): number => save.parts?.[id]?.n ?? 0;

/** The save with one more copy of part `id` at `star` (the best star is kept, as a cut does). The same save when `id` is no part of the table. */
export function addPart<T extends InventorySave>(save: T, id: string, star: number): T {
  if (!splitPart(id)) return save;
  const old = save.parts?.[id], s = Math.max(0, Math.min(PARTS.rarities.length - 1, Math.floor(star) || 0));
  return { ...save, parts: { ...(save.parts ?? {}), [id]: { n: Math.min(PARTS.maxCount, (old?.n ?? 0) + 1), star: Math.max(old?.star ?? 0, s) } } };
}

/** The save with one copy of `id` gone, or null when none may be sold (not owned, or only the worn copy is left). The row goes when its last copy does. */
export function removePart<T extends InventorySave>(save: T, id: string): T | null {
  const own = listParts(save).find((p) => p.id === id);
  if (!own || own.sellable < 1) return null;
  const parts = { ...(save.parts ?? {}) };
  if (own.n <= 1) delete parts[id]; else parts[id] = { n: own.n - 1, star: own.star };
  const next = { ...save, parts };
  if (!Object.keys(parts).length) delete next.parts;
  return next;
}
