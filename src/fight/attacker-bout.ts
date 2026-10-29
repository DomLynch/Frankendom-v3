// Real-time zone aggro, the sim side (Dom 2026-10-27: "you should be attacked within range ... regardless of whether you are already fighting another boss").
// OPTION CHOSEN: (a) one more ordinary duel per extra attacker, every duel stepped by the sim's own stepPractice/stepDuel, the hero's health the ONE pool. This is how V1's world does it (open-fight.ts
// `joined` bouts: each creature its own duel against the player, the world writes the hero's resources into each bout every tick); nothing under the sim changes, so Gate 0 and every single-boss fight are byte for byte.
// A tick: the primary duel steps as it always did. Then each live attacker's duel steps from the hero as he stood BEFORE that tick (his whole fighter, health included) with the SAME intent, so his
// swings land on the attacker, not on the first boss, and the attacker's blows land on him. What the attackers did to him is merged back into the primary hero: their damage is subtracted from the one
// health pool, a flinch (hurt, guard broken, posture) is taken from the attacker's copy when the first boss did not already strike him this tick, and a lethal sum kills him through the sim's own
// finish (a double knockout is the sim's `draw`). The attackers' blows on the hero are appended to the tick's events (HUD numbers, sound, blood); the hero's blows on an attacker stay in its own duel.
// Pure and deterministic: the same intents give the same fight. Outside SIM_FILES (like pack.ts and open-fight.ts).
import type { MechanicRuntime } from './mechanics/runtime.ts';
import { project, stepPractice, type AiProfile, type CombatEvent, type Duel, type Fighter, type Intent, type Practice } from './combat.ts';
import { RULES } from './moves.ts';

/** One extra boss on the hero: its spawn (index into the zone's spawns), its own whole fight, and whether it has been killed (its corpse then stays in this record until its timer stands it again). */
export type Attacker = { index: number; practice: Practice; dead: boolean; profile?: AiProfile; mechanic?: MechanicRuntime | null };   // mechanic: this boss's signature mechanic (src/fight/mechanics), laid over its duel as over the first boss's   // profile: this attacker's own AI profile (its kind's brain, src/fight/spawn-kind.ts); absent = the profile stepAttackers is given

/** Events that say the hero was struck, defended or missed by the attacker (not the hero's own blows, not the attacker's special casts: those are drawn by the first boss's machinery only). */
const struck = (e: CombatEvent): boolean =>
  (e.target === 0 && (e.type === 'Hit' || e.type === 'GuardBroken' || e.type === 'PostureBroken' || e.type === 'Killed'))
  || (e.actor === 0 && (e.type === 'Blocked' || e.type === 'Parried' || e.type === 'Dodged' || e.type === 'Staggered'))
  || (e.actor === 1 && e.type === 'AttackMissed');
const reacts = (e: CombatEvent): boolean => struck(e) && e.type !== 'AttackMissed';

/** stepPractice with a stateless boss mechanic (`pure`: Sir Reginald's limb loss) laid over it, as the page does for the held boss: its layer on the intent, its settle on the stepped duel. With none, exactly stepPractice. */
export function stepShaped(prior: Practice, intent: Intent, profile: AiProfile, m: MechanicRuntime | null): Practice {
  const out = stepPractice(prior, intent, profile, m?.layer);
  if (!m?.settle) return out;
  const moved = m.settle(prior.duel, out.duel);
  return moved === out.duel ? out : { ...out, duel: moved, fighter: moved.fighters[0].body, enemy: moved.fighters[1].body };
}

/** A new attacker from a whole fight the page built for it (its own boss at its spot, the hero where he stands). */
export const joinAttacker = (index: number, practice: Practice, profile?: AiProfile, mechanic?: MechanicRuntime | null): Attacker => ({ index, practice, dead: false, ...(profile ? { profile } : {}), ...(mechanic ? { mechanic } : {}) });

/** The fight `a` carries on as the first boss (the hero's other boss died): its own duel with the hero as he stands now. */
export function adopt(a: Attacker, hero: Fighter): Practice {
  const duel: Duel = { ...a.practice.duel, fighters: [hero, a.practice.duel.fighters[1]], finish: null, events: [] };
  return project(duel, a.practice.ai, a.practice);
}

/**
 * The held boss `index` went past its leash: only that boss resets. The hero (his health, stance, body) and every other attacker's fight carry on untouched. With another live boss on him, that boss's
 * fight becomes the primary one (the leashed boss stands again at its spot, drawn from the zone's spawns); alone, `rebuilt()` gives the same boss fresh at its spot (full health) and the hero
 * carries on against it, not engaged. Nothing is built for the hero: he is never reset.
 */
export function resetHeld(primary: Practice, list: readonly Attacker[], index: number, rebuilt: () => Practice): { practice: Practice; list: Attacker[]; index: number; engaged: boolean } {
  const hero = primary.duel.fighters[0], next = list.find((a) => !a.dead);
  if (next) return { practice: adopt(next, hero), list: list.filter((x) => x !== next), index: next.index, engaged: true };
  return { practice: adopt(joinAttacker(index, rebuilt()), hero), list: list.slice(), index, engaged: false };
}

export type Stepped = { practice: Practice; list: Attacker[]; killer: number | null };

/**
 * One tick of the attackers. `before` is the primary practice as the tick began, `after` the same tick stepped by stepPractice (the first boss), `intent` the hero's intent they both took.
 * Returns the practice with the attackers' damage merged in (the same object when nobody struck him), the attackers stepped, and `killer`: the index of the attacker whose blow made the sum lethal.
 */
export function stepAttackers(before: Practice, after: Practice, intent: Intent, list: readonly Attacker[], profile: AiProfile): Stepped {
  const hero0 = before.duel.fighters[0];
  if (!list.length || hero0.health <= 0) return { practice: after, list: list.slice(), killer: null };
  let damage = 0, first: Fighter | null = null, lethal: number | null = null;
  const events: CombatEvent[] = [];
  const next = list.map((a) => {
    if (a.dead) return a;
    const input: Practice = { ...a.practice, duel: { ...a.practice.duel, fighters: [hero0, a.practice.duel.fighters[1]], finish: null } };
    const out = stepShaped(input, intent, a.profile ?? profile, a.mechanic ?? null);   // with no mechanic exactly stepPractice
    const lost = Math.max(0, hero0.health - out.duel.fighters[0].health);
    damage += lost;
    for (const e of out.duel.events) if (struck(e)) events.push(e);
    if (!first && out.duel.events.some(reacts)) first = out.duel.fighters[0];
    if (lost > 0 && lethal === null) lethal = a.index;
    const foe = out.duel.fighters[1];
    return { ...a, practice: out, dead: foe.health <= 0 };
  });
  if (!damage && !events.length) return { practice: after, list: next, killer: null };
  const was = after.duel.fighters[0];
  const health = Math.max(0, was.health - damage);
  const hit = after.duel.events.some((e) => struck(e) && e.type !== 'AttackMissed');   // the first boss struck him this tick: his reaction stands
  const base: Fighter = first && !hit ? first : was;
  let hero: Fighter = { ...base, health };
  let finish = after.duel.finish;
  const dies = health <= 0 && was.health > 0;
  if (dies) {
    const e = [...events].reverse().find((x) => x.target === 0 && x.type === 'Hit') ?? events[events.length - 1];
    const foe = after.duel.fighters[1];
    hero = { ...hero, phase: 'dead', age: 0, stun: RULES.death, buffer: null };
    finish = finish ? { ...finish, draw: true } : { victim: 0, location: e?.location ?? 'torso', move: e?.move ?? foe.lastMove ?? was.lastMove!, heading: foe.body.heading };
    events.push({ tick: after.duel.tick, type: 'Killed', actor: 1, target: 0, move: finish.move, location: finish.location, heading: finish.heading });
  }
  const duel: Duel = { ...after.duel, fighters: [hero, after.duel.fighters[1]], finish, events: [...after.duel.events, ...events] };
  return { practice: project(duel, after.ai, before, intent), list: next, killer: dies ? lethal : null };
}
