// Special Moves presentation (the Hades pilot, docs/briefs/special-moves-hades-pilot.md; Combat owns the timing seam, Finishers the effects).
// Pure: read from the sim's own state and events, never written back, so a fight steps the same whether or not anything is drawn.
// The seam: SpecialStarted (the windup begins; the strike lands RULES.special.windup ticks later, the cast tick included), SpecialLanded
// (the strike), SpecialFizzled (the caster fell during the windup) or SpecialInterrupted (damage cut it; presented as a fizzle), then SPECIAL_RECOVER ticks of presentation after the strike.
import { RULES } from './moves.ts';
import type { Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';

export const SPECIAL_RECOVER = 45;   // the cloud tears away and the caster returns to stance (Finishers, 2026-09-29: 30 read as a pop at phone size)
export const SPECIAL_STRUCK = 45;   // the target's head-hit stagger after the strike (presentation only: the sim does not stagger him)

// `?special=set` is rank 8's Red Wind (level 36: (8 − 1) × 5 + 1); the same lunge special, its own art (special-fx-wind.ts).
// `?special=hades`: a sparring fight (no record, rewards or writes) against the named warden at his rank's level, with Special Moves on for
// that page only. Rank 9 is level 41 (career.ts: level = 1 + wins, five sub-ranks a title). `first`: on this page the first cast waits 3 s,
// not the rule's 20 s, so the move is seen before a level-41 warden ends the fight; every cast after it keeps the 20 s cooldown.
// `?special=cuts` is the Nightborn's ranks 4-7 Seven Cuts (shown at rank 7, level 31): special-fx-nightborn.ts.
// `?special=set` is the Nightborn's rank-8 Red Wind (special-fx-wind.ts); `?special=tithe` is the Centurion's rank-10 Blood Tithe (Mars, special-tithe.ts); `?special=shield` is the Centurion's rank-8 Shield Quake (Ajax; docs/briefs/specials/centurion-l8-l10-2026-10-01.md): the ground ripple, special-fx-quake.ts; `?special=centurion` is his rank-9 Charge (Alexander): the dust line, charge-fx.ts.
export const SPECIAL_TESTS = {
  setfoot: { opponent: 'veteran', level: 6, first: 180 },
  heelreap: { opponent: 'executioner', level: 6, first: 180 },
  lunge: { opponent: 'nightborn', level: 6, first: 180 },
  knuckledirt: { opponent: 'goblin', level: 6, first: 180 },
  cleaverset: { opponent: 'pitborn', level: 6, first: 180 },
  groundset: { opponent: 'dwarf', level: 6, first: 180 },
  cutmark: { opponent: 'shieldmaiden', level: 6, first: 180 },
 hades: { opponent: 'nightborn', level: 41, first: 180 }, set: { opponent: 'nightborn', level: 36, first: 180 }, cuts: { opponent: 'nightborn', level: 31, first: 180 }, nyx: { opponent: 'nightborn', level: 46, first: 180 }, shield: { opponent: 'veteran', level: 36, first: 180 }, tithe: { opponent: 'veteran', level: 46, first: 180 }, centurion: { opponent: 'veteran', level: 41, first: 180 }, standfast: { opponent: 'veteran', level: 21, first: 180 },
  // The boss grey-boxes (Multi Chars, special-fx-boss.ts), by the legend's own rank (level (rank − 1) × 5 + 1): the Witch's and the Plague Doctor's.
  mist: { opponent: 'witch', level: 36, first: 180 }, echo: { opponent: 'witch', level: 41, first: 180 }, price: { opponent: 'witch', level: 46, first: 180 },
  flies: { opponent: 'plaguedoctor', level: 36, first: 180 }, stain: { opponent: 'plaguedoctor', level: 41, first: 180 }, breath: { opponent: 'plaguedoctor', level: 46, first: 180 },
  // The Goblin's rank 8, 9, 10 bosses (Reynard the Fox, Hermes, Loki: levels 36, 41, 46), grey-box previews (special-fx-goblin.ts; special-modes.ts).
  // Selected Goblin ranks 4-7 presentation; preview at Master I, runtime level selection belongs to Combat.
  ratrun: { opponent: 'goblin', level: 31, first: 180 },
  blackfurrow: { opponent: 'executioner', level: 21, first: 180 },
  earthfold: { opponent: 'pitborn', level: 21, first: 180 }, ironsettle: { opponent: 'dwarf', level: 21, first: 180 }, gatherededge: { opponent: 'shieldmaiden', level: 21, first: 180 },
  reynard: { opponent: 'goblin', level: 36, first: 180 }, hermes: { opponent: 'goblin', level: 41, first: 180 }, loki: { opponent: 'goblin', level: 46, first: 180 }, arawn: { opponent: 'executioner', level: 36, first: 180 }, thanatos: { opponent: 'executioner', level: 41, first: 180 }, reaper: { opponent: 'executioner', level: 46, first: 180 },
  // The Dwarf's and the Shieldmaiden's ranks 8-10 (Character lane, preview only; level 5*(rank-1)+1 = 36, 41, 46), each drawing only its own move (special-fx-dwarf-shield.ts).
  dwarf8: { opponent: 'dwarf', level: 36, first: 180 }, dwarf9: { opponent: 'dwarf', level: 41, first: 180 }, dwarf10: { opponent: 'dwarf', level: 46, first: 180 },
  shield8: { opponent: 'shieldmaiden', level: 36, first: 180 }, shield9: { opponent: 'shieldmaiden', level: 41, first: 180 }, shield10: { opponent: 'shieldmaiden', level: 46, first: 180 },
  // The Knight's three (Hector, Achilles, Thor), special-fx-boss.ts.
  sling: { opponent: 'knight', level: 36, first: 180 }, haze: { opponent: 'knight', level: 41, first: 180 }, storm: { opponent: 'knight', level: 46, first: 180 },
  // The Pitborn's ranks 8-10 (special-fx-pitborn.ts): Cracking Ground, Ash Fall, Wind Wall.
  antaeus: { opponent: 'pitborn', level: 36, first: 180 }, surtr: { opponent: 'pitborn', level: 41, first: 180 }, typhon: { opponent: 'pitborn', level: 46, first: 180 },
  // The Witch's, the Plague Doctor's and the Knight's class specials (Weapons; special-fx-class.ts): slot A is ranks 1-3 (rank 2, level 6), slot B ranks 4-7 (rank 5, level 21).
  wake: { opponent: 'witch', level: 6, first: 180 }, stirring: { opponent: 'witch', level: 21, first: 180 }, tempo: { opponent: 'plaguedoctor', level: 6, first: 180 }, pulse: { opponent: 'plaguedoctor', level: 21, first: 180 },
  drag: { opponent: 'knight', level: 6, first: 180 }, swing: { opponent: 'knight', level: 21, first: 180 },
} as const satisfies Record<string, { opponent: OpponentId; level: number; first: number }>;
export type SpecialTest = keyof typeof SPECIAL_TESTS;
export const specialParam = (search: string): SpecialTest | null => {
  const value = /[?&]special=(\w+)/i.exec(search)?.[1]?.toLowerCase();
  return value && Object.hasOwn(SPECIAL_TESTS, value) ? (value as SpecialTest) : null;
};

// Where a fighter stands in his own special: winding up (progress 0..1 to the strike), or recovering after it (0..1). Null otherwise. The
// recovery is read off the sim's own no-attack recovery (duel.ts specialRecover: RULES.special.recovery on the release tick, one less every
// tick after), so it needs no memory. Not off the cooldown: that re-arms at the release (Dom's final rule, 2026-10-01), not at the cast.
export function specialStage(f: Pick<Fighter, 'specialShare' | 'special' | 'specialRecover' | 'health'>): { stage: 'windup' | 'recover'; progress: number } | null {
  if (f.specialShare === undefined || !f.health) return null;
  if (f.special) return { stage: 'windup', progress: 1 - f.special / RULES.special.windup };
  const since = f.specialRecover ? RULES.special.recovery - f.specialRecover : -1;   // 0 on the strike tick
  return since >= 0 && since < SPECIAL_RECOVER ? { stage: 'recover', progress: since / SPECIAL_RECOVER } : null;
}
