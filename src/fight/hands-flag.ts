// Hands and feet are severable (Dom 2026-10-30, six parts: head, body, arms, legs, feet, hands) but player-visible, so they ship behind a flag row:
// data/physics.json `cut.hands` ({ on, query, value } like data/market.json; ?hands=1). Off, every list the corpse tap, the strike, the cue buttons and the hint read is
// today's six units, the SAME objects (nothing is copied, so the off path is byte for byte what it was). On, `cut.hands.order` replaces the tap order and the cue's units.
import PHYSICS from '../../data/physics.json' with { type: 'json' };

type CutLike = { tap: { order: readonly string[] }; cue?: { units: readonly string[]; labels: Readonly<Record<string, string>> }; hands?: HandsRow };
export type HandsRow = { on: boolean; query: string; value: string; units: readonly string[]; order: readonly string[]; labels: Readonly<Record<string, string>> };
export const HANDS = PHYSICS.cut.hands as HandsRow;

/** Hands and feet are cuttable: the row says so, or the link carries ?hands=1. */
export const handsOn = (search: string, row: HandsRow | undefined = HANDS): boolean => !!row && (row.on || new URLSearchParams(search).get(row.query) === row.value);

/** The cut rows as this page plays them: `cut` itself when the flag is off (or the row has no `hands`), else a copy whose tap order and cue units are the ten units. */
export function cutRowsFor<T extends CutLike>(cut: T, search: string): T {
  const h = cut.hands;
  if (!h || !handsOn(search, h)) return cut;
  return { ...cut, tap: { ...cut.tap, order: h.order }, ...(cut.cue ? { cue: { ...cut.cue, units: h.order, labels: { ...cut.cue.labels, ...h.labels } } } : {}) } as T;
}

/** The unit list the cut hint counts (data/pickup.json `units`) as this page plays it: the same array when the flag is off. */
export function hintUnitsFor(units: readonly string[], search: string, row: HandsRow | undefined = HANDS): readonly string[] {
  return row && handsOn(search, row) ? row.order : units;
}
