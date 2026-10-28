// BOSS ORDER (Dom 2026-10-28): the first opponent is the Gargantua, the second the Arachne, the third the Minotaur. The order is DATA: the zone row's spawn kinds
// (data/zones/zone1.row.json), data/fight.json `opponent` / `profile` (the single fight and the page's first foe) and data/profiles.json `default`. This file only reads
// the revert row, data/fight.json `order`: ?order=v1 (and ?pitborn=v1, the Centurion's fight, which keeps the Minotaur's body) plays the order before, Minotaur first.
import type { ZoneRow } from '../zone/zone-rows.ts';

export type OrderRow = { query: string; v1: string; opponent: string; profile: string; kinds: Readonly<Record<string, string>> };

/** Whether this page plays the order before (?order=v1, or ?pitborn=v1). */
export const orderV1 = (row: Pick<OrderRow, 'query' | 'v1'>, search: string): boolean => {
  const q = new URLSearchParams(search);
  return q.get(row.query) === row.v1 || q.get('pitborn') === 'v1';
};
/** The zone row this page plays: the row as it is, or (order v1) each named spawn with the kind it had before the reorder (a new row; the shipped one is never mutated). */
export const orderedZone = (zone: ZoneRow, row: OrderRow, search: string): ZoneRow =>
  orderV1(row, search) ? { ...zone, spawns: zone.spawns.map((s) => (row.kinds[s.id] === undefined ? s : { ...s, kind: row.kinds[s.id]! })) } : zone;
/** The profile id of the single fight (no zone) and the opener's kind in a zone-less page: data/fight.json `profile`, or the row's before order v1. */
export const orderProfile = (profile: string, row: OrderRow, search: string): string => (orderV1(row, search) ? row.profile : profile);
