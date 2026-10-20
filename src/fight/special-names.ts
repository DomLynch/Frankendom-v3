// The name a picked special shows while a BOW is wielded (Lead 2026-10-19, as the combat sandbox showed them): the picker skill `cleave` reads "Power Shot", `reaping` "Fan Volley", `stomp` "Pinning Shot", `lunge`
// "Quick Shot", from the label of its bowSpecial row (sandbox-rules-defs.json). Presentation only: the sim still resolves the skill id (duel.ts bowSpecialOf), nothing here is read by a fight, and any other weapon, or a
// skill with no bow row, keeps the skill's own name. The row lookup is bowSpecialOf itself (no distance and no ammo limit), so the weapon's own missile row decides what counts as a bow.
import { bowSpecialOf, specialPickRows } from './sandbox-rules.ts';

// 2026-10-20 (Dom's beta specials ruling): a melee special shows its sandbox name (specialPick label: Skull Crack, Whirlwind, Ground Slam, Lunge) instead of the old skill row's ("Butcher's Cleave", "Reaping Blow").
export const specialName = (weapon: string | undefined, skill: string | null | undefined, fallback: string): string =>
  (weapon ? bowSpecialOf(weapon, skill, Infinity, undefined)?.label : undefined) ?? (skill ? specialPickRows().find((r) => r.id === skill)?.label : undefined) ?? fallback;
