// The ONE crowd-control ladder per target (Proof 3, many-on-one). Stuns, knockdowns and roots from ANY source step the same
// diminishing-returns ladder on the victim: full -> half -> quarter -> immune, and the ladder forgets after a quiet window.
// Donor: cmangos-mangos-classic (Unit::GetDiminishing / IncrDiminishing / ApplyDiminishingToDuration), SHAPE ONLY (GPL), written clean-room:
// a per-target list of {group, count, last}, a level multiplier per count, a reset once the window has passed since the last landing.
// Families, sources, steps and the window are DATA rows (CC_LADDER), never constants in the logic. Integer percent math, so a replay is exact.
// Pure leaf: nothing here steps a duel. Wiring it into duel.ts is a sim change (record version bump, Lead's number).

export type CcFamily = 'stun' | 'knockdown' | 'root';
// Where each engine state lands. Ordinary hit stagger (duel.ts stagger()) is a hit reaction, not crowd control: it is deliberately in no family.
export type CcSource = 'postureBreak' | 'parryStun' | 'gambitFail' | 'exhaustedHeavy' | 'wallSlam' | 'legWound';

export const CC_LADDER = {
  window: 900,                       // ticks of quiet before the ladder resets (cmangos: 15 s)
  windowFrom: 'land' as 'land' | 'end',   // where that quiet counts from: the last landing (shipped), or the END of the last CC (the donors' rule, item 8)
  steps: [100, 50, 25, 0] as readonly number[],  // percent of the duration at the 1st, 2nd, 3rd landing and after (0 = immune)
  immunity: { stun: 0, knockdown: 0, root: 0 } as Record<CcFamily, number>,   // ticks a target is immune to a family once a CC of it ENDS (0 = none, shipped)
  // A creature row's `immuneTier` (catalogue field): the families it never takes. `resist`: the percent of every CC's ticks it KEEPS, per family (after the ladder).
  // No catalogue row names one yet (Lead rules the creatures at READY), so every shipped fight steps as before.
  tiers: { unstoppable: { immune: ['stun', 'knockdown', 'root'] }, steadfast: { immune: ['knockdown'] } } as Record<string, { readonly immune: readonly CcFamily[] }>,
  resists: { stubborn: { stun: 75, knockdown: 75, root: 75 }, iron: { stun: 50, knockdown: 50, root: 50 } } as Record<string, Partial<Record<CcFamily, number>>>,
  families: {
    stun: ['postureBreak', 'parryStun', 'gambitFail', 'exhaustedHeavy'],
    knockdown: ['wallSlam'],
    root: ['legWound'],
  } as Record<CcFamily, readonly CcSource[]>,
};

export const familyOf = (source: CcSource, rows = CC_LADDER): CcFamily => {
  for (const f of Object.keys(rows.families) as CcFamily[]) if (rows.families[f].includes(source)) return f;
  throw new Error(`cc-ladder: ${source} is in no family`);
};

export type CcMark = { readonly family: CcFamily; readonly count: number; readonly last: number; readonly end?: number };   // end: the tick the last CC ends (kept only when a row reads it)
export type CcGuard = { readonly immuneTier?: string; readonly resist?: string };   // a target's own rows (catalogue fields immuneTier / resist); absent = none
export type CcLadder = readonly CcMark[];   // one per family the target has been hit by; absent = never
export const emptyLadder: CcLadder = [];

const markOf = (ladder: CcLadder, family: CcFamily, tick: number, rows: typeof CC_LADDER): CcMark | undefined => {
  const m = ladder.find((x) => x.family === family);
  return m && tick - (rows.windowFrom === 'end' ? m.end ?? m.last : m.last) <= rows.window ? m : undefined;   // a mark older than the window no longer counts
};

// The level (0-based landing count, capped at the immune step) the NEXT landing of this family would meet.
export const ccLevel = (ladder: CcLadder, family: CcFamily, tick: number, rows = CC_LADDER): number =>
  Math.min(markOf(ladder, family, tick, rows)?.count ?? 0, rows.steps.length - 1);

// Land `ticks` of crowd control from `source` at `tick`: returns the diminished duration and the new ladder.
// An immune landing lasts 0 and does NOT refresh the window (spamming cannot hold the target immune forever): the immune step, the target's
// immuneTier, and the post-CC immunity after the family's last CC ended. A resist row keeps its percent of what the ladder leaves.
export function ccApply(ladder: CcLadder, source: CcSource, tick: number, ticks: number, rows = CC_LADDER, guard?: CcGuard): { ticks: number; level: number; ladder: CcLadder } {
  const family = familyOf(source, rows), level = ccLevel(ladder, family, tick, rows), pct = rows.steps[level]!, mark = markOf(ladder, family, tick, rows);
  const immune = guard?.immuneTier !== undefined && tierOf(guard.immuneTier, rows).immune.includes(family);
  const after = rows.immunity[family], held = after > 0 && mark?.end !== undefined && tick < mark.end + after;
  if (pct === 0 || immune || held) return { ticks: 0, level, ladder };
  const keep = guard?.resist !== undefined ? resistOf(guard.resist, rows)[family] : undefined;
  const lasts = keep === undefined ? Math.round(ticks * pct / 100) : Math.round(ticks * pct * keep / 10000), count = (mark?.count ?? 0) + 1;
  const ends = rows.windowFrom === 'end' || after > 0 ? { end: tick + lasts } : {};
  return { ticks: lasts, level, ladder: [...ladder.filter((x) => x.family !== family), { family, count, last: tick, ...ends }] };
}
const tierOf = (id: string, rows: typeof CC_LADDER) => { const t = rows.tiers[id]; if (!t) throw new Error(`cc-ladder: no immuneTier row ${id}`); return t; };
const resistOf = (id: string, rows: typeof CC_LADDER) => { const r = rows.resists[id]; if (!r) throw new Error(`cc-ladder: no resist row ${id}`); return r; };
