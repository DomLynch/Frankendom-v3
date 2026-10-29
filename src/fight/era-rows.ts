// The rows a replay turns the era flags ON from: the page's own defaults (no query), the same calls src/client/main.ts makes with an empty search. Kept apart from era-flags.ts
// (a leaf) because it reads the game's data files, which the Gate 0 copy of the tree (`src/` alone) does not carry.
import FIGHT from '../../data/fight.json' with { type: 'json' };
import FEEL_SIM from '../../data/feel-sim.json' with { type: 'json' };
import FEEL_DEFAULTS from '../../data/feel-defaults.json' with { type: 'json' };
import { knockSimFor, type KnockRows } from './knock-sim.ts';
import { specialPaceFor } from './special-pace.ts';
import { specialTermsFor } from './special-terms.ts';
import { heroNoManaFor } from './hero-mana.ts';
import { knockRoundFor } from './knock-round.ts';
import type { EraSource } from './era-flags.ts';

export const PAGE_ERA: EraSource = {
  knockSim: () => knockSimFor(FEEL_SIM as KnockRows, '', FEEL_DEFAULTS),
  specialPace: () => specialPaceFor(FIGHT.specialPace, ''),
  specialTerms: () => specialTermsFor(FIGHT.specialTerms, ''),
  heroNoMana: () => heroNoManaFor(FIGHT.heroMana, ''),
  knockRound: () => knockRoundFor(FIGHT.knockRound, ''),
};
