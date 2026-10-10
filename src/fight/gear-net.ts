// The engine's gear screen over the ONE item ledger: the page's client for Backend's gear_open / gear_equip / gear_unequip (origins/server/gear.ts, #1982). `call` is the same
// POST helper the fight and spawn clients use (encounter-net.ts): no DOM, storage or clock here, and every failure (no session, a 422 refusal, a timeout, the network, a reply that is not the
// documented shape) is an answer ({ offline }), never a throw, so the sheet keeps what it was showing. The pure half (the reply as the sheet's Loot, an op as the calls that make it) is src/fight/gear-ledger.ts.
import { stepsFor, viewOf, type GearOp, type GearView } from './gear-ledger.ts';
import { call, type Offline } from '../writer-call.ts';

type Opts = { base?: string; fetch?: typeof fetch; timeoutMs?: number };
export const isOffline = (r: GearView | Offline): r is Offline => 'offline' in r;
export const openGear = (token: string | null, character: string, opts: Opts = {}) => call('gear_open', { character }, token, viewOf, opts);
// One op: its steps in order, each answered with the whole view. A refusal stops the op and the view is re-read. A swap is two commits (the occupant comes off, then the piece goes on), so if a
// step AFTER the first is refused (the rank check can refuse the equip), the occupant is put back before the re-read: the slot is never left empty by a refused wear.
export async function runOp(token: string | null, character: string, view: GearView, op: GearOp, opts: Opts = {}): Promise<{ view: GearView | Offline; refused: boolean }> {
  const steps = stepsFor(view, op); let now = view;
  for (const [i, step] of steps.entries()) {
    const next = await call(step.op, { character, id: step.id }, token, viewOf, opts);
    if (isOffline(next)) {
      const first = steps[0];
      if (i > 0 && first?.op === 'gear_unequip') await call('gear_equip', { character, id: first.id }, token, viewOf, opts);   // put the occupant back
      return { view: await openGear(token, character, opts), refused: true };
    }
    now = next;
  }
  return { view: now, refused: false };
}
