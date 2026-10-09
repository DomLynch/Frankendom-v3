// createFight: the one entry a client uses to run a fight (K2). A thin facade over the existing sim (duel.ts stepDuel, ai.ts decide): it owns the Duel and the brains, nothing else, and adds no rule.
// A slot is steered by an Intent the client gives it, or by a creature brain (profile) the fight runs itself. The Pit's page and Zone 1 both build on this; their own flow (match, aggro, leash) stays outside.
import { decide, initialAi, type AiState } from '../ai.ts';
import { idleIntent, stepDuel, type CombatEvent, type Duel, type Fighter, type Intent } from '../duel.ts';
import { RULES, type AiProfile } from '../moves.ts';

export type FightSlot = { fighter: Fighter; profile?: AiProfile; seed?: number };
export type FightOptions = { fighters: readonly [FightSlot, FightSlot]; wall?: number; rules?: typeof RULES; onEvent?: (e: CombatEvent) => void };
export type Fight = {
  readonly duel: Duel;
  /** One 60 Hz tick. `intents[i]` steers slot i; a slot with a profile ignores it and thinks for itself. Returns the tick's events. */
  step(intents?: readonly [Intent?, Intent?]): readonly CombatEvent[];
};

export function createFight({ fighters, wall, rules = RULES, onEvent }: FightOptions): Fight {
  let duel: Duel = { tick: 0, fighters: [fighters[0].fighter, fighters[1].fighter], finish: null, events: [], ...(wall !== undefined ? { radius: wall } : {}) };
  const brains: (AiState | null)[] = fighters.map((s) => (s.profile ? initialAi(s.seed ?? 0) : null));
  return {
    get duel() { return duel; },
    step(intents = []) {
      const pick = (i: 0 | 1): Intent => {
        const profile = fighters[i].profile, ai = brains[i];
        if (!profile || !ai) return intents[i] ?? idleIntent();
        const brain = decide(duel, i, ai, profile);
        brains[i] = brain.ai;
        return brain.intent;
      };
      const next = stepDuel(duel, [pick(0), pick(1)], rules);
      duel = { ...next, events: [] };
      if (onEvent) for (const e of next.events) onEvent(e);
      return next.events;
    },
  };
}
