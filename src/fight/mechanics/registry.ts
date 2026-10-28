// The boss signature mechanics (data/mechanics.json: id -> row; data/rings.json bosses[].mechanic names the id). One module per mechanic in this folder; the registry below is ONE LINE PER MECHANIC.
// A mechanic is a world layer on the shared engine (like mobkit.ts): `layer` rewrites the boss's intent after decide(), `after` writes what the tick changed into the boss's fighter (sticky tags in `phases`, so a
// new fight starts clean), `tell` says what the page shows when something happens (caption, freeze), `view` draws it on a body. A boss with no mechanic costs one lookup and the fight is stepPractice untouched.
import RINGS from '../../../data/rings.json' with { type: 'json' };
import { stepPractice, type AiProfile, type Intent, type Practice } from '../combat.ts';
import { mechanic as reginaldLimbLoss } from './reginald-limb-loss.ts';
import type { Mechanic } from './types.ts';
export type { BodyNode, Mechanic, Tell } from './types.ts';

export const MECHANICS: Readonly<Record<string, Mechanic>> = {
  'reginald-limb-loss': reginaldLimbLoss,   // Sir Reginald (castle-guard): his armour fails limb by limb
};

const BY_KIND = new Map<string, Mechanic>();
for (const b of RINGS.bosses as { kind: string; mechanic: string | null }[]) {
  if (b.mechanic === null) continue;
  const m = MECHANICS[b.mechanic];
  if (!m) throw new Error(`data/rings.json bosses.${b.kind}.mechanic: "${b.mechanic}" is not in src/fight/mechanics/registry.ts`);
  BY_KIND.set(b.kind, m);
}
/** The mechanic of the boss whose profile id is `kind` (a ring boss's `kind`), or null. */
export const mechanicFor = (kind: string | undefined): Mechanic | null => (kind === undefined ? null : BY_KIND.get(kind) ?? null);
/** The registry's ids (data/rings.json validation: a boss may name one of these or null). */
export const mechanicIds = (): string[] => Object.keys(MECHANICS);

/** stepPractice with the boss's mechanic laid over it. With none, exactly stepPractice. */
export function stepMechanic(prior: Practice, intent: Intent, profile: AiProfile, m: Mechanic | null): Practice {
  return m ? m.after(stepPractice(prior, intent, profile, m.layer)) : stepPractice(prior, intent, profile);
}
