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
  window: 900,                       // ticks of quiet after the LAST landing before the ladder resets (cmangos: 15 s)
  steps: [100, 50, 25, 0] as readonly number[],  // percent of the duration at the 1st, 2nd, 3rd landing and after (0 = immune)
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

export type CcMark = { readonly family: CcFamily; readonly count: number; readonly last: number };
export type CcLadder = readonly CcMark[];   // one per family the target has been hit by; absent = never
export const emptyLadder: CcLadder = [];

const markOf = (ladder: CcLadder, family: CcFamily, tick: number, rows: typeof CC_LADDER): CcMark | undefined => {
  const m = ladder.find((x) => x.family === family);
  return m && tick - m.last <= rows.window ? m : undefined;   // a mark older than the window no longer counts
};

// The level (0-based landing count, capped at the immune step) the NEXT landing of this family would meet.
export const ccLevel = (ladder: CcLadder, family: CcFamily, tick: number, rows = CC_LADDER): number =>
  Math.min(markOf(ladder, family, tick, rows)?.count ?? 0, rows.steps.length - 1);

// Land `ticks` of crowd control from `source` at `tick`: returns the diminished duration and the new ladder.
// An immune landing lasts 0 and does NOT refresh the window (spamming cannot hold the target immune forever).
export function ccApply(ladder: CcLadder, source: CcSource, tick: number, ticks: number, rows = CC_LADDER): { ticks: number; level: number; ladder: CcLadder } {
  const family = familyOf(source, rows), level = ccLevel(ladder, family, tick, rows), pct = rows.steps[level]!;
  if (pct === 0) return { ticks: 0, level, ladder };
  const count = (markOf(ladder, family, tick, rows)?.count ?? 0) + 1;
  return { ticks: Math.round(ticks * pct / 100), level, ladder: [...ladder.filter((x) => x.family !== family), { family, count, last: tick }] };
}
