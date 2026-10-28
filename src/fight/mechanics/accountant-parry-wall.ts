// THE ACCOUNTANT'S PARRY WALL (Dom 2026-10-28: each boss gets its own fighting identity; Strategy's brief). The one signature move of `the-boss` (data/rings.json mechanic "accountant-parry-wall").
// He plants his feet, a ledger wall rises in front of him (the TELL), and for a short window every ORDINARY weapon blow from the front is parried for ZERO damage: a spark, the attacker staggers a
// moment, the boss gets a riposte window. A golden weapon (#265) is an ordinary weapon here: the wall reads the MOVE, never the blade. Counters: a KICK breaks the wall, a hero SPECIAL breaks it
// (and still lands), a blow from BEHIND lands in full, a blow in the TELL lands in full and cancels the wall, or wait it out. He never attacks while it stands (fair: nothing here can kill).
// Pure sim rules over the Fighter's flat fields (mech, mS state, mC cooldown, mN parries); every number is a row of data/mechanics.json. The duel (src/fight/duel.ts) calls these through
// registry.ts; the look is accountant-parry-wall-fx.ts. A dying boss (health 0) drops the wall the same tick (the corpse cut, #252, reads a plain corpse).
// The row is INJECTED (configure, called by registry.ts configureMechanics from the driver, src/client/main.ts): the sim imports no data/ json, because the Gate 0 copy of the tree is `src/` alone. Until it is
// configured the mechanic is inert (a fighter starts with none of its fields), so a headless fight is byte for byte what it was.
import type { Fighter } from '../duel.ts';
import type { Mechanic } from './registry.ts';

export const ID = 'accountant-parry-wall';
export type AccountantRow = {
  boss: string; firstTicks: number; triggerRangeM: number; tellTicks: number; wallTicks: number; cooldownTicks: number; cancelCooldownTicks: number; arcDeg: number;
  parryStunTicks: number; riposteTicks: number; parriesToDrop: number; kickBreakStunTicks: number; specialBreakStunTicks: number; caption: string;
  fx: { colour: string; edgeColour: string; ringRadiusM: number; wallHeightM: number; wallWidthM: number; wallDistanceM: number; tellOpacity: number; wallOpacity: number; sparkCount: number; sparkSpeedMps: number; sparkLifeS: number; sparkSizeM: number; sparkGravityMps2: number; ringPulseHz: number };
};
/** The row, filled in place by configure (a live view: every reader sees the configured numbers). */
export const ROW = {} as AccountantRow;
let HALF_ARC = 0, RANGE_SQ = 0, ON = false;   // radians each side of his heading that the wall covers; the trigger range squared; configured
/** Lay the data/mechanics.json row (already validated by src/sim/validate-mechanics.js) into the module. */
export function configure(row: AccountantRow): void {
  Object.assign(ROW, row); ON = true;
  HALF_ARC = (ROW.arcDeg * Math.PI) / 360; RANGE_SQ = ROW.triggerRangeM * ROW.triggerRangeM;
}

/** The three looks of the state, read by the fx: nothing, the tell (feet planted, wall rising) and the wall standing. */
export type WallStage = 'none' | 'tell' | 'up';
export const stageOf = (f: Pick<Fighter, 'mech' | 'mS'>): WallStage => (f.mech !== ID || !f.mS ? 'none' : f.mS > ROW.tellTicks ? 'up' : 'tell');
/** 0..1 through the tell (the wall rising), 1 once it stands. */
export const riseOf = (f: Pick<Fighter, 'mS'>): number => Math.min(1, (f.mS ?? 0) / ROW.tellTicks);

const near = (a: Fighter, b: Fighter): boolean => { const dx = b.body.x - a.body.x, dz = b.body.z - a.body.z; return dx * dx + dz * dz <= RANGE_SQ; };   // squares, no sqrt: the sim takes no transcendental
const end = (f: Fighter, cooldown: number): void => { delete f.mS; delete f.mN; f.mC = cooldown; };

/** The fields a fresh fight with this boss starts with: the mechanic id and the first cooldown. */
const init = (): Partial<Fighter> => (ON ? { mech: ID, mC: ROW.firstTicks } : {});

/** One tick, on the NEW tick's copy of the boss (`f`), reading the hero (`foe`). Starts the wall when it is ready and the hero is close; runs the tell and the window; drops it when he is hurt, dying or it ran out. */
function clock(f: Fighter, foe: Fighter): void {
  if (!f.health) { delete f.mS; delete f.mN; delete f.mC; return; }   // the corpse cut: a dying boss drops the wall the same tick
  if (f.mS) {
    if (f.phase !== 'ready') { end(f, f.mS > ROW.tellTicks ? ROW.cooldownTicks : ROW.cancelCooldownTicks); return; }   // hurt, attacking or anything else but standing planted: the wall is gone
    if (++f.mS > ROW.tellTicks + ROW.wallTicks) end(f, ROW.cooldownTicks);
    return;
  }
  if (f.mC) { if (!--f.mC) delete f.mC; return; }
  if (f.phase === 'ready' && !f.special && !f.stun && foe.health > 0 && near(f, foe)) { f.mS = 1; f.mN = 0; }
}

/** Planted: through the tell and the window he takes no step and throws no blow (the duel gives him the idle intent). */
const locked = (f: Fighter): boolean => !!f.mS;

/**
 * A weapon blow is about to land on `D` (the NEW copy of the defender; `d` is its state at the start of the tick) from `angle` radians off his heading (0 = dead ahead). In the tell it lands in full and CANCELS the wall
 * (the only state change here); from the front in the window it is parried (a kick breaks it instead); from behind it lands.
 */
function intercept(D: Fighter, d: Fighter, move: string | null, angle: number): 'parry' | 'break' | null {
  if (!d.mS || !D.health) return null;
  if (d.mS <= ROW.tellTicks) { end(D, ROW.cancelCooldownTicks); return null; }
  if (angle > HALF_ARC) return null;
  return move === 'kick' ? 'break' : 'parry';
}

/** The wall took a parry: the attacker's stagger and his riposte window; after the last parry the wall drops. */
function parried(D: Fighter): { stun: number; riposte: number } {
  D.mN = (D.mN ?? 0) + 1;
  if (D.mN >= ROW.parriesToDrop) end(D, ROW.cooldownTicks);
  return { stun: ROW.parryStunTicks, riposte: ROW.riposteTicks };
}

/** A kick or a hero special broke the wall: it is gone, the cooldown runs, and he staggers (a longer one for a special). Returns the stun he took. */
function broken(D: Fighter, source: 'kick' | 'special'): number {
  const stun = source === 'kick' ? ROW.kickBreakStunTicks : ROW.specialBreakStunTicks;
  end(D, ROW.cooldownTicks);
  if (D.health) { D.phase = 'hurt'; D.age = 0; D.stun = Math.max(D.stun, stun); D.buffer = null; D.counterWindow = 0; D.charge = 0; D.charged = false; }
  return stun;
}

/** The commentator event id to say on the first tick of the tell (data/mechanics.json caption), or null. */
const caption = (f: Fighter): string | null => (f.mech === ID && f.mS === 1 ? ROW.caption : null);

export const mechanic: Mechanic = { configure, init, clock, locked, intercept, parried, broken, caption };
