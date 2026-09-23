import { idleIntent, initialDuel, distance, stepDuel, timing, type CombatEvent, type Duel, type Intent, type Side } from '../duel.ts';
import type { DeathPresentation } from './cues.ts';
import { OPPONENTS, RULES } from '../moves.ts';

// The fixed scripted exchange every audio iteration is judged on: both fighters are driven by hand through the real
// simulation (no AI), so the same beats land on the same ticks and BEFORE/AFTER renders are like-for-like. The warden
// starts wounded so the exchange ends in a death without padding the script with filler hits.
type Beat = { name: string; tick: number; events: string[] };
export type Exchange = { ticks: { tick: number; events: CombatEvent[]; presentation?: DeathPresentation }[]; beats: Beat[]; length: number };
export const EXCHANGE_BEATS = ['walk', 'draw', 'light', 'light', 'heavy', 'guard', 'block', 'parry', 'riposte', 'hit taken', 'kick', 'death'] as const;
const WARDEN_HEALTH = 80;   // 11 + 11 + 18 + 24 + 4 = 68 dealt before the charged heavy (27) kills
export const forward = (): Intent['move'] => ({ x: 0, z: -1, yaw: 0, run: false });

export function scriptExchange(): Exchange {
  let duel: Duel = initialDuel({ ...OPPONENTS.veteran, weapon: 'trident' });   // the ruler stays the trident Veteran it was measured on: the Centurion's gladius (#547) stalls the script at tick 1003
  duel = { ...duel, fighters: [duel.fighters[0], { ...duel.fighters[1], health: WARDEN_HEALTH }] };
  const ticks: Exchange['ticks'] = [], beats: Beat[] = [];
  const intents: [Intent, Intent] = [idleIntent(), idleIntent()];
  const player = () => duel.fighters[0], warden = () => duel.fighters[1];
  const step = () => {
    duel = stepDuel(duel, [{ ...intents[0] }, { ...intents[1] }]);
    intents[0].action = null; intents[1].action = null;   // actions are edge-triggered
    if (duel.events.length) ticks.push({ tick: duel.tick, events: duel.events, ...(duel.finish ? { presentation: { finish: duel.finish, weapons: [duel.fighters[0].weapon, duel.fighters[1].weapon], gore: true } } : {}) });
  };
  const until = (done: () => boolean, limit = 600) => { for (let i = 0; i < limit && !done(); i++) step(); if (!done()) throw new Error(`exchange stalled at tick ${duel.tick} after beats ${beats.map(b => b.name).join(',')}`); };
  const press = (side: Side, action: Intent['action']) => { intents[side].action = action; step(); };
  const seen = (type: CombatEvent['type'], actor?: Side) => duel.events.some(e => e.type === type && (actor === undefined || e.actor === actor));
  const beat = (name: string) => beats.push({ name, tick: duel.tick, events: duel.events.map(e => `${e.type}${e.move ? `(${e.move})` : e.action ? `(${e.action})` : ''}${e.perfect ? ' perfect' : ''}`) });

  // walk: close from the arena mouth to sword reach.
  intents[0].move = forward(); step(); beat('walk');
  until(() => distance(player().body, warden().body) <= 1.5);
  intents[0].move = { x: 0, z: 0, yaw: 0, run: false };
  // draw
  press(0, 'light'); beat('draw');
  until(() => player().phase === 'ready');
  // light, light, heavy: the three-hit chain on an open warden.
  press(0, 'light'); until(() => seen('Hit', 0)); beat('light');
  until(() => player().phase === 'ready');
  press(0, 'light'); until(() => seen('Hit', 0)); beat('light');
  until(() => player().phase === 'ready');
  press(0, 'heavy'); until(() => seen('Hit', 0)); beat('heavy');
  const rest = (stamina: number) => until(() => player().phase === 'ready' && player().stamina >= stamina);   // stand and breathe: the chain, block and kick cost more than one bar
  rest(75);
  // guard, block: the warden answers with a cut into a held guard (held early: an ordinary block, not a perfect one).
  intents[0].guard = true; intents[0].guardDirection = 'low'; step(); beat('guard');   // directional guard: the Veteran's cuts are trident sweeps (direction 'low'), met by the low guard
  for (let i = 0; i < 6; i++) step();
  press(1, 'light'); until(() => seen('Blocked', 0)); beat('block');
  until(() => warden().phase === 'ready');
  intents[0].guard = false; until(() => player().phase === 'ready');
  // parry: the second cut is met with a guard tap six ticks before contact.
  press(1, 'light');
  until(() => warden().age === timing(warden()).windup - 6);
  intents[0].guard = true; intents[0].guardDirection = 'low'; press(0, 'parry');   // his second sweep is parried low as well
  until(() => seen('Parried', 0)); beat('parry');
  intents[0].guard = false; intents[0].guardDirection = undefined; until(() => player().phase === 'ready');
  // riposte: choose Stab in the punish window for the thrust.
  press(0, 'thrust'); until(() => seen('Hit', 0)); beat('riposte');
  until(() => player().phase === 'ready' && warden().phase === 'ready');
  // hit taken: the warden's cut lands on an open player.
  press(1, 'light'); until(() => seen('Hit', 1)); beat('hit taken');
  until(() => player().phase === 'ready' && warden().phase === 'ready');
  // kick: the warden guards; a close kick opens it.
  rest(40); intents[1].guard = true;
  intents[0].move = forward(); until(() => distance(player().body, warden().body) <= 1.0); intents[0].move = { x: 0, z: 0, yaw: 0, run: false };
  press(0, 'kick'); until(() => seen('Hit', 0)); beat('kick');
  intents[1].guard = false;
  rest(40);
  // death: a charged heavy on the staggered, wounded warden.
  intents[0].held = true; press(0, 'heavy');
  until(() => seen('Charged', 0)); intents[0].held = false;
  until(() => seen('Killed', 0)); beat('death');
  for (let i = 0; i < RULES.death; i++) step();   // let the fall play out
  return { ticks, beats, length: duel.tick };
}

// One synthetic event per cue the module could answer, rendered in isolation so each sound gets its own WAV and loudness row.
const at = (type: CombatEvent['type'], extra: Partial<CombatEvent> = {}): CombatEvent => ({ tick: 3, actor: 0, ...extra, type });
export const CUE_PROBES: { name: string; events: CombatEvent[]; presentation?: DeathPresentation }[] = [
  { name: 'draw', events: [at('ActionStarted', { action: 'draw' })] },
  { name: 'swing-light', events: [at('AttackStarted', { move: 'light_right' })] },
  { name: 'swing-heavy', events: [at('AttackStarted', { move: 'heavy_overhead' })] },
  { name: 'swing-kick', events: [at('AttackStarted', { move: 'kick' })] },
  { name: 'swing-thrust', events: [at('AttackStarted', { move: 'thrust' })] },
  { name: 'attack-active', events: [at('AttackActive', { move: 'light_right' })] },
  { name: 'charging', events: [at('Charging', { move: 'heavy_overhead' })] },
  { name: 'charged', events: [at('Charged', { move: 'heavy_overhead' })] },
  { name: 'hit-light', events: [at('Hit', { target: 1, move: 'light_right', damage: 11, location: 'torso' })] },
  { name: 'hit-heavy', events: [at('Hit', { target: 1, move: 'heavy_overhead', damage: 18, location: 'torso' })] },
  { name: 'hit-riposte', events: [at('Hit', { target: 1, move: 'riposte', damage: 24, location: 'torso' })] },
  { name: 'hit-kick', events: [at('Hit', { target: 1, move: 'kick', damage: 4, location: 'torso' })] },
  { name: 'hit-thrust', events: [at('Hit', { target: 1, move: 'thrust', damage: 14, location: 'torso' })] },
  { name: 'blocked', events: [at('Blocked', { target: 1, move: 'light_right', stamina: 25, perfect: false })] },
  { name: 'blocked-perfect', events: [at('Blocked', { target: 1, move: 'light_right', stamina: 12.5, perfect: true })] },
  { name: 'parried', events: [at('Parried', { target: 1, move: 'light_right' })] },
  { name: 'guard-broken', events: [at('GuardBroken', { target: 1, move: 'riposte', damage: 24, location: 'torso' })] },
  // The wall whip (#511): the lash and its tell, so both are on the phone measure. Guard 2 (rate .988, the middle of the six
  // voices); lead 60 is a first lash, so the raise lands .6 s in and ends on the lash tick.
  { name: 'whipped', events: [at('Whipped', { actor: 0, target: 0, damage: 2, guard: 2 })] },
  { name: 'whip-raised', events: [at('WhipRaised', { actor: 0, target: 0, lead: 60, guard: 2 })] },
  { name: 'guard', events: [at('ActionStarted', { action: 'guard' })] },
  { name: 'parry-attempt', events: [at('ActionStarted', { action: 'parry' })] },
  { name: 'feint', events: [at('ActionStarted', { action: 'feint' })] },
  { name: 'roll', events: [at('ActionStarted', { action: 'roll' })] },
  { name: 'backstep', events: [at('ActionStarted', { action: 'backstep' })] },
  { name: 'dodged', events: [at('Dodged', { target: 1, move: 'light_right' })] },
  { name: 'missed', events: [at('AttackMissed', { move: 'light_right' })] },
  { name: 'staggered', events: [at('Staggered', { ticks: 24 })] },
  { name: 'posture-broken', events: [at('PostureBroken', { target: 1 })] },   // silent until the audio lane gives the break a sound (slice Q makes it a regular beat)
  { name: 'exhausted', events: [at('StaminaExhausted')] },
  { name: 'killed', events: [at('Hit', { target: 1, move: 'heavy_overhead', damage: 27, location: 'torso', charged: true }), at('Killed', { target: 1, move: 'heavy_overhead', location: 'torso' })] },
];

for (const override of ['plainDeath', 'splitCrown', 'decapitation', 'runThrough', 'quietOne', 'opened'] as const) {
  for (const gore of [true, false]) CUE_PROBES.push({ name: `finish-${override}${gore ? '' : '-blood-off'}`, events: [at('Hit', { target: 1, move: 'heavy_overhead' }), at('Killed', { target: 1, move: 'heavy_overhead' })], presentation: { finish: { victim: 1, location: 'head', move: 'heavy_overhead', heading: 0 }, weapons: ['longsword', 'trident'], override, gore } });
}
CUE_PROBES.push({ name: 'player-death', events: [at('Hit', { actor: 1, target: 0, move: 'thrust' }), at('Killed', { actor: 1, target: 0, move: 'thrust' })] });
CUE_PROBES.push({ name: 'kick-death', events: [at('Hit', { target: 1, move: 'kick' }), at('Killed', { target: 1, move: 'kick' })] });
CUE_PROBES.push({ name: 'double-death', events: [at('Killed', { target: 1 }), at('Killed', { actor: 1, target: 0 })] });
