// The ONE crowd-control ladder per target (Proof 3, many-on-one). Stuns, knockdowns and roots from ANY source step the same
// diminishing-returns ladder on the victim: full -> half -> quarter -> immune, and the ladder forgets after a quiet window.
// Donor: cmangos-mangos-classic (Unit::GetDiminishing / IncrDiminishing / ApplyDiminishingToDuration) and AzerothCore (DiminishingReturns,
// creature_template.mechanic_immune_mask), SHAPE ONLY (GPL), written clean-room: a per-target list of {kind, count, last}, a level multiplier
// per count, a reset once the window has passed. Every number is a ROW of cc-defs.json through the shared loader (src/core/registry.ts):
// a CC kind (its sources, DR steps, window and post-CC immunity), an immunity tier (the kinds a target never takes), a resist (the percent
// of each CC a target keeps). A new kind, tier or resist is one row; no kind is named in the logic. Integer percent math, so a replay is exact.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import CC_DEFS from './cc-defs.json' with { type: 'json' };
import CC_MANIFEST from './cc-defs.manifest.json' with { type: 'json' };

export type CcFamily = string;   // a cc-defs.json kind id (stun, knockdown, root as shipped); ids stay strings, checked against the loaded rows
// Where each engine state lands (the duel's call sites; a kind row lists the sources it owns). Ordinary hit stagger (duel.ts stagger()) is a hit
// reaction, not crowd control: it is deliberately in no kind.
export type CcSource = 'postureBreak' | 'parryStun' | 'gambitFail' | 'exhaustedHeavy' | 'wallSlam' | 'legWound';
export type CcKind = {
  readonly id: CcFamily;
  readonly sources: readonly CcSource[];
  readonly steps: readonly number[];   // percent of the duration at the 1st, 2nd, 3rd landing and after (0 = immune)
  readonly window: number;   // ticks of quiet before the ladder resets (cmangos / AzerothCore: 15 s)
  readonly windowFrom: 'land' | 'end';   // where that quiet counts from: the last landing (shipped), or the END of the last CC (the donors' rule)
  readonly immunity: number;   // ticks the target is immune to this kind once a CC of it ENDS (0 = none, shipped)
};
export type CcRows = {
  readonly kinds: Readonly<Record<CcFamily, CcKind>>;
  readonly tiers: Readonly<Record<string, { readonly immune: readonly CcFamily[] }>>;   // a creature row's `immuneTier` (catalogue field)
  readonly resists: Readonly<Record<string, { readonly keep: number }>>;   // a creature row's `resist`: percent of each CC's ticks kept, after the ladder
};

const tables = (CC_MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, CC_DEFS, 'cc-defs.json'));
loadRegistry(tables);   // ids, types and refs (a tier names real kinds); throws on any problem, never last-wins
const rowsOf = <T>(name: string) => tables.find((t) => t.manifest.table === name)!.rows as unknown as (T & { id: string })[];
export function ccRows(kinds: readonly CcKind[], tiers: readonly { id: string; immune: readonly CcFamily[] }[], resists: readonly { id: string; keep: number }[]): CcRows {
  const owner = new Map<string, string>();
  for (const k of kinds) {
    if (!k.steps.length || k.steps.some((s, i) => s < 0 || s > 100 || (i > 0 && s > k.steps[i - 1]!))) throw Error(`cc-defs kind "${k.id}": steps are percents 0-100, never rising`);
    if (k.window < 0 || k.immunity < 0 || (k.windowFrom !== 'land' && k.windowFrom !== 'end')) throw Error(`cc-defs kind "${k.id}": window and immunity are ticks from 0, windowFrom is land or end`);
    for (const s of k.sources) { if (owner.has(s)) throw Error(`cc-defs: source ${s} is in kinds ${owner.get(s)} and ${k.id}`); owner.set(s, k.id); }
  }
  for (const r of resists) if (r.keep < 0 || r.keep > 100) throw Error(`cc-defs resist "${r.id}": keep is a percent 0-100`);
  const by = <T extends { id: string }>(xs: readonly T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;
  return { kinds: by(kinds), tiers: by(tiers), resists: by(resists) };
}
export const CC_LADDER: CcRows = ccRows(rowsOf<CcKind>('cckind'), rowsOf<{ immune: CcFamily[] }>('cctier'), rowsOf<{ keep: number }>('ccresist'));

export const familyOf = (source: CcSource, rows = CC_LADDER): CcFamily => {
  for (const k of Object.values(rows.kinds)) if (k.sources.includes(source)) return k.id;
  throw new Error(`cc-ladder: ${source} is in no kind`);
};

export type CcMark = { readonly family: CcFamily; readonly count: number; readonly last: number; readonly end?: number };   // end: the tick the last CC ends (kept only when the kind's row reads it)
export type CcGuard = { readonly immuneTier?: string; readonly resist?: string };   // a target's own rows (catalogue fields immuneTier / resist); absent = none
export type CcLadder = readonly CcMark[];   // one per kind the target has been hit by; absent = never
export const emptyLadder: CcLadder = [];

const markOf = (ladder: CcLadder, k: CcKind, tick: number): CcMark | undefined => {
  const m = ladder.find((x) => x.family === k.id);
  return m && tick - (k.windowFrom === 'end' ? m.end ?? m.last : m.last) <= k.window ? m : undefined;   // a mark older than the window no longer counts
};

// The level (0-based landing count, capped at the immune step) the NEXT landing of this kind would meet.
export const ccLevel = (ladder: CcLadder, family: CcFamily, tick: number, rows = CC_LADDER): number => {
  const k = rows.kinds[family]; if (!k) throw new Error(`cc-ladder: no kind row ${family}`);
  return Math.min(markOf(ladder, k, tick)?.count ?? 0, k.steps.length - 1);
};

// Land `ticks` of crowd control from `source` at `tick`: returns the diminished duration and the new ladder.
// An immune landing lasts 0 and does NOT refresh the window (spamming cannot hold the target immune forever): the immune step, the target's
// immuneTier, and the post-CC immunity after the kind's last CC ended. A resist row keeps its percent of what the ladder leaves.
export function ccApply(ladder: CcLadder, source: CcSource, tick: number, ticks: number, rows = CC_LADDER, guard?: CcGuard): { ticks: number; level: number; ladder: CcLadder } {
  const family = familyOf(source, rows), k = rows.kinds[family]!, level = ccLevel(ladder, family, tick, rows), pct = k.steps[level]!, mark = markOf(ladder, k, tick);
  const immune = guard?.immuneTier !== undefined && tierOf(guard.immuneTier, rows).immune.includes(family);
  const held = k.immunity > 0 && mark?.end !== undefined && tick < mark.end + k.immunity;
  if (pct === 0 || immune || held) return { ticks: 0, level, ladder };
  const keep = guard?.resist !== undefined ? resistOf(guard.resist, rows).keep : undefined;
  const lasts = keep === undefined ? Math.round(ticks * pct / 100) : Math.round(ticks * pct * keep / 10000), count = (mark?.count ?? 0) + 1;
  const ends = k.windowFrom === 'end' || k.immunity > 0 ? { end: tick + lasts } : {};
  return { ticks: lasts, level, ladder: [...ladder.filter((x) => x.family !== family), { family, count, last: tick, ...ends }] };
}
const tierOf = (id: string, rows: CcRows) => { const t = rows.tiers[id]; if (!t) throw new Error(`cc-ladder: no immuneTier row ${id}`); return t; };
const resistOf = (id: string, rows: CcRows) => { const r = rows.resists[id]; if (!r) throw new Error(`cc-ladder: no resist row ${id}`); return r; };
