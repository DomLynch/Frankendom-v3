// V3 (Dom 2026-10-26 on his phone: the opponent's attacks hurt him from too far away). The Pitborn fights with V1's hero/cleaver sweeps
// (blade-paths.ts), baked in V1 from another body's clips; the Minotaur he is drawn as plays the Centurion's clips, whose drawn cleaver falls
// short of them. By default the sim sweeps the cleaver where the Minotaur draws it (src/fight/blade-minotaur.ts, scripts/foe-body/bake-blades.mjs),
// laid over V1's table for that (rig, weapon) only (blade.ts setSweepOverride, with the hero's own table: src/hero-clips.ts). data/fight.json
// `foeReach`: only for its `opponent` drawn in its `body` (not under ?pitborn=v1, whose Centurion fights with the gladius; ?foe=v1, V1's 65
// bodies, is gone), and `?<query>=<v1>` (?reach=v1) = V1's cleaver sweeps exactly. No rendering imports: tests ask the same function the page does.
import { BLADE_MINOTAUR } from './blade-minotaur.ts';
import { foeBodyFile } from './foe-body.ts';

export type SweepTable = Record<string, Record<string, Record<string, number[][]>>>;
export type FoeReachRow = { opponent: string; body: string; rig: string; weapon: string; query: string; v1: string };
const BAKES: Readonly<Record<string, Record<string, number[][]>>> = { minotaur: BLADE_MINOTAUR };

/** Whether the page asks for V1's cleaver sweeps (?reach=v1). */
export const foeReachV1 = (row: FoeReachRow, search: string): boolean => new URLSearchParams(search).get(row.query) === row.v1;
/** The table to lay over V1's for the fight's opponent `opponentId`, or null for V1's sweeps: the row's opponent, drawn in its body, without ?reach=v1. */
export function foeSweepsFor(row: FoeReachRow, search: string, opponentId: string): SweepTable | null {
  const bake = BAKES[row.body];
  if (!bake) throw new Error(`foeReach: no bake for the ${row.body} body`);
  if (opponentId !== row.opponent || foeReachV1(row, search) || foeBodyFile(opponentId, row.body, true) !== row.body) return null;   // the bake is fitted to the row's body (BOSS-BODIES.md): another boss body sweeps V1's cleaver table
  return { [row.rig]: { [row.weapon]: bake } };
}
/** Two override tables as one (each names its own (rig, weapon) pairs; a pair in both is an error, never a silent pick). */
export function mergeSweeps(a: SweepTable | null, b: SweepTable | null): SweepTable | null {
  if (!a || !b) return a ?? b;
  const out: SweepTable = { ...a };
  for (const [rig, weapons] of Object.entries(b)) for (const [weapon, paths] of Object.entries(weapons)) {
    if (out[rig]?.[weapon]) throw new Error(`two sweep overrides for ${rig}/${weapon}`);
    out[rig] = { ...out[rig], [weapon]: paths };
  }
  return out;
}
