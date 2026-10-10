// Mob signature moves (Combat, top-10 #5, docs/research/origins-best-in-class.md C2; mob fights proposal docs/specs/origins/mob-fights-proposal.md): a world LAYER on the shared engine, not a second AI.
// The warden's own decide() still chooses WHEN to attack; this layer only chooses WHICH of the moves that already exist, the way sparring.ts takes attacks out of an intent after decide().
// Outside SIM_FILES on purpose: it reads a Duel and returns an Intent, writes nothing back, and never runs in the ladder, so every Pit fight and every ladder record is unchanged by construction. A WORLD-fight record is not: the layer's swaps change what the mob throws, so replaying one needs this same kit (the kit is not yet versioned in the record: Backend's KIT_VERSION check, before ORIGINS_ENCOUNTERS goes on).
// Deterministic: a trigger is a condition on the duel (no dice, no chance), a cooldown is ticks. Nothing here resolves a blow; the swapped move goes through the same legal() and the same stepDuel.
import { legal, movesOf, type Action, type Duel, type Intent, type Side } from './duel.ts';
import type { MoveId, WeaponId } from './moves.ts';
import { rollUnit } from './roll.ts';

export type KitTrigger = 'opener' | 'afterHit' | 'heroGuarding' | 'heroExhausted' | 'selfBelow';
export type KitMove = 'light' | 'heavy' | 'thrust' | 'skill';
// move: the attack thrown in place of the one decide() chose. trigger: the condition. cooldown: ticks before this row may fire again (60 = one second). below: for 'selfBelow', the share of own max health.
export type KitRow = { move: KitMove; trigger: KitTrigger; cooldown: number; below?: number };
// Chains (C4, docs/research/origins-best-in-class.md): authored follow-ups on the engine's own chain window. A row says: after a swing `from` ends, in ticks [startsAfter, endsBefore) of the chain window, throw `to` with probability
// `chance`. The window is the ENGINE's (MoveDef.chain.window, 18 on the cuts): a validator refuses a row that reaches past it, so a chain never fights the engine; stepDuel still decides the chained timing and legality. A hit taken puts the
// fighter in `hurt`, so the plan is wiped by construction (a link needs `ready`). The "chance" is a pure function of the window's opening tick (rollUnit), never a dice call, so a replay of the same duel chains the same way.
export type ChainRow = { from: MoveId; to: KitMove; chance: number; startsAfter: number; endsBefore: number };
export const CHAIN_CAP = 3;   // swings in one chain, the first included (v1). The engine opens a chain window after a plain swing only, so today a chain reaches 2 swings; the cap is the validator's promise, not a second rule
export type KitState = { fired: number[]; attacks: number; lastHit: number; run: number; tried: number };
export const initialKit = (rows: readonly KitRow[]): KitState => ({ fired: rows.map(() => -1e9), attacks: 0, lastHit: -1e9, run: 0, tried: -1 });
// Every row's window must sit inside the engine's chain window for its `from` move on this weapon, and its chance must be a share.
export function validateChains(rows: readonly ChainRow[], weapon: WeaponId): void {
  for (const r of rows) {
    const window = movesOf({ weapon })[r.from]?.chain?.window;
    if (window === undefined) throw new Error(`chain row: ${r.from} has no chain window on this weapon`);
    if (!(r.startsAfter >= 0 && r.startsAfter < r.endsBefore && r.endsBefore <= window)) throw new Error(`chain row ${r.from} -> ${r.to}: [${r.startsAfter}, ${r.endsBefore}) must sit inside the engine's ${window}-tick window`);
    if (!(r.chance >= 0 && r.chance <= 1)) throw new Error(`chain row ${r.from} -> ${r.to}: chance must be 0..1`);
  }
}
export const AFTER_HIT_TICKS = 90;   // 'afterHit' holds for a second and a half after the mob's own blow lands
export const EXHAUSTED_BELOW = 25;   // 'heroExhausted': the hero's stamina at or under this (or the exhausted flag)
const isAttack = (a: Action | null): a is Action => a === 'light' || a === 'light_left' || a === 'light_right' || a === 'heavy' || a === 'thrust';

const holds = (row: KitRow, duel: Duel, me: Side, state: KitState, index: number): boolean => {
  const self = duel.fighters[me], foe = duel.fighters[1 - me];
  switch (row.trigger) {
    case 'opener': return state.attacks === 0;
    case 'afterHit': return duel.tick - state.lastHit <= AFTER_HIT_TICKS && state.fired[index] < state.lastHit;
    case 'heroGuarding': return foe.phase === 'guard';
    case 'heroExhausted': return foe.exhausted || foe.stamina <= EXHAUSTED_BELOW;
    case 'selfBelow': return self.health > 0 && self.health < self.maxHealth * (row.below ?? 0.5);
  }
};

// One tick: `duel` is the state the intent will be stepped on (events: the last step's). Returns the same `intent` object when nothing changes.
export function kitIntent(duel: Duel, me: Side, intent: Intent, kit: readonly KitRow[], state: KitState, chains: readonly ChainRow[] = []): { intent: Intent; state: KitState } {
  const hit = duel.events.some(e => (e.type === 'Hit' || e.type === 'GuardBroken') && e.actor === me);
  const base = hit ? { ...state, lastHit: duel.tick } : state;
  const link = chains.length ? chainLink(duel, me, base, chains) : null;
  if (link) return { intent: { ...intent, action: link.to, lock: true }, state: { ...base, attacks: base.attacks + 1, run: base.run + 1, tried: link.window } };
  if (link === undefined) return { intent, state: { ...base, tried: tried(duel, me) } };
  if (!isAttack(intent.action) || !kit.length) return { intent, state: chains.length && isAttack(intent.action) ? { ...base, run: 1 } : base };
  const next = { ...base, attacks: base.attacks + 1, run: 1 }, self = duel.fighters[me];
  for (let i = 0; i < kit.length; i++) {
    const row = kit[i];
    if (duel.tick - base.fired[i] < row.cooldown || !holds(row, duel, me, base, i)) continue;
    if (row.move === intent.action || !legal(self, row.move)) continue;
    const fired = base.fired.slice(); fired[i] = duel.tick;
    return { intent: { ...intent, action: row.move }, state: { ...next, fired } };
  }
  return { intent, state: next };
}

// The tick the current chain window opened (the swing ended), or -1 outside a window: ready, a window left, and the swing that opened it still named.
const windowOpen = (duel: Duel, me: Side): { at: number; elapsed: number } | null => {
  const self = duel.fighters[me], w = self.lastMove ? movesOf(self)[self.lastMove].chain?.window : undefined;
  if (self.phase !== 'ready' || !self.chain || w === undefined) return null;
  const elapsed = w - self.chain;
  return { at: duel.tick - elapsed, elapsed };
};
const tried = (duel: Duel, me: Side): number => windowOpen(duel, me)?.at ?? -1;
// null: nothing to decide this tick (not in a window, or none of the rows is live yet); undefined: a row was live and its chance said no (the window is spent: one decision per window); a row: the link to throw.
function chainLink(duel: Duel, me: Side, state: KitState, chains: readonly ChainRow[]): { to: KitMove; window: number } | null | undefined {
  const open = windowOpen(duel, me), self = duel.fighters[me];
  if (!open || !self.lastMove || state.run >= CHAIN_CAP || state.tried === open.at) return null;
  for (let i = 0; i < chains.length; i++) {
    const row = chains[i];
    if (row.from !== self.lastMove || open.elapsed < row.startsAfter || open.elapsed >= row.endsBefore) continue;
    if (rollUnit(open.at >>> 0, state.attacks + i) < row.chance && legal(self, row.to)) return { to: row.to, window: open.at };
    return undefined;
  }
  return null;
}
