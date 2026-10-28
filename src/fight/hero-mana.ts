// V3 (Dom 2026-10-28: "remove mana for now"): the HERO has no mana. No MANA bar on the HUD (mana-bar.ts mounts nothing) and no mana cost or gate on anything he casts or
// shoots (a spell slot, a heal, the staff's bolt): they are free, held back only by their own cooldown and the SPECIAL buttons' ready ring (data/fight.json specialTerms
// already gives every special its ~9 s cooldown and no stamina). Opponents are untouched: the foes' missile / spell / mana rules in duel.ts run exactly as before (Dom:
// keep the opponent spells), so a foe still carries and spends its own pool.
//
// A leaf of the simulation (no imports), an ERA flag like special-terms.ts: OFF unless a driver sets it, so a headless run (Gate 0, replays, the sandbox suites) steps
// today's numbers byte for byte. src/client/main.ts sets it from data/fight.json `heroMana`; `?mana=v1` leaves it off = the MANA bar and the mana cost, as before.
export type HeroManaRow = { readonly mana: boolean };
export let HERO_NO_MANA = false;
export function setHeroNoMana(on: boolean): void { HERO_NO_MANA = on; }

/** True when the page plays without hero mana: the data row says `mana: false` and the link is not `?mana=v1`. */
export function heroNoManaFor(row: HeroManaRow | undefined, search = ''): boolean {
  if (new URLSearchParams(search).get('mana') === 'v1' || !row) return false;
  if (typeof row.mana !== 'boolean') throw new Error(`heroMana mana ${String(row.mana)} is not a boolean`);
  return !row.mana;
}

type Pool = { mana?: number; maxMana?: number; manaRest?: number };
/** The hero as the Pit builds him: without the third pool while the flag is on (a fighter with no pool is mana-free in duel.ts), unchanged otherwise. */
export function heroPool<F extends Pool>(f: F): F {
  if (!HERO_NO_MANA) return f;
  const { mana: _m, maxMana: _x, manaRest: _r, ...rest } = f;
  return rest as F;
}
/** True when `f`'s mana cost and gate are lifted: the flag is on and he carries no pool (only the hero is built without one). */
export const manaFree = (f: Pool): boolean => HERO_NO_MANA && f.maxMana === undefined;
