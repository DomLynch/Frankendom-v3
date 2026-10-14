// The armour weight class of a loot piece, read from the gear rows (gear-defs.json: the piece's opponent owns a set, the set carries the class). Display only: a badge on the gear sheet. The class's own numbers
// (the cast penalty, the wear tier) are rows too and are read where they are used; this answers one question, "heavy, medium or light?". A piece no set owns (weapons, the Frontier gear) has none: null, never a guess.
import type { LootId } from '../core/loot.ts';
import { GEAR } from './gear-rows.ts';

export const weightClassOf = (id: LootId | string): string | null => {
  const set = GEAR.owners[id.split('.')[0]!];
  return (set && GEAR.sets[set]?.weightClass) || null;
};
