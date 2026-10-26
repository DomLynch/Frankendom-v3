// V3 (Dom 2026-10-26, his pick: V1's plain Cleaver on the Minotaur; Lead: a VISUAL weapon only). The opponent's DRAWN weapon, over the one he
// fights with (data/fight.json `foeWeapon`): the sim, the AI, the digest and Gate 0 still see the gladius (its id, moves, reach, damage and
// timing), and his scutum stays. Only two things the scene draws change: the equip file grafted into his hand (src/assets/weapons/foe/<drawn>.glb,
// the gladius's file with V1's Cleaver part in its WeaponDrawn socket and the gladius's clips: scripts/foe-body/graft-weapon.mjs) and the rank
// shape laid over it (weapon-shapes.ts: <drawn>-plain at his Recruit rung, as gladius-plain is for the gladius).
// Since Dom's later 10-26 call the opponent fights as V1's Pitborn with his own cleaver (foe-pick.ts), so this row (keyed to `veteran`) is a no-op
// by default and draws only under ?pitborn=v1, the fight before that call. Set by the page before the rigs load; null = the gladius as before. ?foeweapon=v1 = the gladius on the Minotaur; ?foe=v1 = the Centurion exactly
// (his body, his kit and his gladius).
export type FoeWeaponRow = { opponent: string; weapon: string; drawn: string };

let row: FoeWeaponRow | null = null;
/** The row in force for this page: null under ?foeweapon=v1 or ?foe=v1. */
export const foeWeaponFor = (data: FoeWeaponRow, search: string): FoeWeaponRow | null => {
  const q = new URLSearchParams(search);
  return q.get('foeweapon') === 'v1' || q.get('foe') === 'v1' ? null : data;
};
export const setFoeWeapon = (next: FoeWeaponRow | null): void => { row = next ? { opponent: next.opponent, weapon: next.weapon, drawn: next.drawn } : null; };
/** The weapon drawn in `opponentId`'s hand when he fights with `weapon` (the row's `drawn`, or `weapon` itself). Presentation only. */
export const foeDrawnWeapon = (opponentId: string, weapon: string): string =>
  row && row.opponent === opponentId && row.weapon === weapon ? row.drawn : weapon;
