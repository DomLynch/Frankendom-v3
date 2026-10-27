// SIM knockdown and finish window (data/feel-sim.json, behind ?feel=kick). V3 Dev, 2026-10-27, on Strategy's ruling: the sim owns the outcome, from its own phase, masses and rows, never from a
// value out of Jolt (the ragdoll is only the picture). A leaf of the simulation, an ERA flag like special-terms.ts: OFF (null) unless a driver sets it, so a headless run (Gate 0) steps today's
// numbers byte for byte. It imports NO json (the Gate 0 copy of the tree is `src/` alone): the driver (src/client/main.ts) passes data/feel-sim.json in, knockSimFor() turns it into whole ticks and
// per-mille integers once, and the step reads only those. Integers and IEEE basic maths only: no pow, sqrt or transcendental in the sim.
// REAL TIME, per fighter: the timers are ticks on the fighter that owns them (Fighter.down; the attacker's Fighter.critical for the window), counted once per tick of his own duel, so one boss
// going down never slows, locks or dilates anyone else's fight (Dom: a live MMO, others can attack at any time).
import { type FeelDefaultRows, feelsOn } from './feel-defaults.ts';
import { STEP } from './sim.ts';
export type KnockStance = 'open' | 'guarding' | 'midSwing' | 'recovering';
export type KnockRows = {
  flag: { query: string; value: string }; tickHz: number;
  knockdown: { seconds: number }; getUp: { seconds: number }; finishWindow: { seconds: number };
  targets: readonly ('hero' | 'foe')[]; knockdownAtPerMille: number;
  massKg: Readonly<Record<string, number>> & { default: number };
  massBands: readonly { minRatioPct: number; perMille: number }[];
  stance: Readonly<Record<KnockStance, number>>;
  moves: Readonly<Record<string, { perMille: number }>>;
};
/** The rows as the step reads them: ticks and per-mille integers. */
export type KnockSim = {
  readonly down: number; readonly getUp: number; readonly window: number; readonly at: number;
  readonly foe: boolean; readonly hero: boolean;
  readonly kg: Readonly<Record<string, number>>; readonly bands: readonly { minRatioPct: number; perMille: number }[];
  readonly stance: Readonly<Record<KnockStance, number>>; readonly moves: Readonly<Record<string, number>>;
};
export let KNOCK_SIM: KnockSim | null = null;
export function setKnockSim(rows: KnockSim | null): void { KNOCK_SIM = rows; }

/** The sim's tick rate (src/fight/sim.ts STEP = 1/60), which the rows' tickHz must equal. */
export const KNOCK_TICK_HZ = Math.round(1 / STEP);

/** Rows -> the step's integers, or null when the page did not ask (`?feel=kick` among the comma separated ?feel= values). A bad row throws: a silent default would change a fight's outcome. */
export function knockSimFor(rows: KnockRows | undefined, search = '', defaults?: FeelDefaultRows): KnockSim | null {
  if (!rows) return null;
  // `defaults` (data/feel-defaults.json, passed by src/client/main.ts only): the same answer the presentation registry gets, so ?kick=v1 / ?feel=v1 turn the sim knockdown off with the kick. Absent = the old opt-in grammar.
  const asked = defaults ? rows.flag.query === defaults.query && feelsOn(defaults, search).includes(rows.flag.value) : (new URLSearchParams(search).get(rows.flag.query) ?? '').split(',').map((s) => s.trim()).includes(rows.flag.value);
  if (!asked) return null;
  if (rows.tickHz !== KNOCK_TICK_HZ) throw new Error(`feel-sim tickHz ${rows.tickHz} is not the sim's ${KNOCK_TICK_HZ} (sim.ts STEP)`);
  const ticks = (name: string, s: number): number => { const t = Math.round(s * rows.tickHz); if (!(Number.isFinite(s) && t >= 1)) throw new Error(`feel-sim ${name} ${s} s is under one tick`); return t; };
  const down = ticks('knockdown.seconds', rows.knockdown.seconds), getUp = ticks('getUp.seconds', rows.getUp.seconds), window = ticks('finishWindow.seconds', rows.finishWindow.seconds);
  if (window > down) throw new Error('feel-sim finishWindow.seconds is longer than knockdown.seconds (the window must close before he rises)');
  if (!rows.massBands.length || rows.massBands[0]!.minRatioPct !== 0) throw new Error('feel-sim massBands must start at minRatioPct 0');
  return { down, getUp, window, at: rows.knockdownAtPerMille, foe: rows.targets.includes('foe'), hero: rows.targets.includes('hero'), kg: rows.massKg, bands: rows.massBands, stance: rows.stance, moves: Object.fromEntries(Object.entries(rows.moves).map(([k, v]) => [k, v.perMille])) };
}

/** The target's stance from the sim's own phase when the blow landed (`raised`: his guard was up and faced the blow). Guard up = guarding; mid-attack = midSwing; hurt, rolling, backstepping = recovering; else open. */
export function knockStance(phase: string, raised: boolean): KnockStance {
  if (raised) return 'guarding';
  return phase === 'attack' ? 'midSwing' : phase === 'hurt' || phase === 'roll' || phase === 'backstep' ? 'recovering' : 'open';
}

/** The mass band's per-mille for an attacker of `attackerKg` on a target of `targetKg` (whole percent, floor; the last band whose minRatioPct is not over the ratio). */
export function bandOf(bands: KnockSim['bands'], attackerKg: number, targetKg: number): number {
  const pct = Math.floor((attackerKg * 100) / targetKg);
  let out = bands[0]!.perMille;
  for (const b of bands) if (pct >= b.minRatioPct) out = b.perMille;
  return out;
}

/** The force of one blow in per-mille (floor of band x stance x move / 1e6), or 0 for a move that is not an entry. */
export function knockForce(k: KnockSim, input: { move: string | null; attackerId: string; targetId: string; stance: KnockStance }): number {
  const mv = input.move ? k.moves[input.move] : undefined;
  if (mv === undefined) return 0;
  const kg = (id: string): number => (Object.hasOwn(k.kg, id) ? k.kg[id]! : k.kg.default!);
  return Math.floor((bandOf(k.bands, kg(input.attackerId), kg(input.targetId)) * k.stance[input.stance] * mv) / 1000000);
}

/** Does this blow knock him down? Ticks to lie (down + getUp, one stun) and the attacker's finish window, or null for the ordinary stagger. `rising`: he is already down or getting up (no second knockdown). */
export function knockdownOf(k: KnockSim, input: { move: string | null; attackerId: string; targetId: string; stance: KnockStance; targetIsHero: boolean; rising: boolean }): { force: number; ticks: number; window: number } | null {
  if (input.rising || (input.targetIsHero ? !k.hero : !k.foe)) return null;
  const force = knockForce(k, input);
  return force >= k.at && force > 0 ? { force, ticks: k.down + k.getUp, window: k.window } : null;
}
