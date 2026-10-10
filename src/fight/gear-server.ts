// When a signed-in character opens the engine's gear screen it shows the SERVER's ledger (origins/inventory through gear_open), and every wear / stow goes to the server (gear_equip /
// gear_unequip); a guest, a failed sign-in or a writer that does not answer keeps the local ledger exactly as before. No DOM here: the page hands in storage, the clock and two callbacks.
import { emptyLoot, type Loot } from './loot.ts';
import { lootOfView, type GearOp, type GearView } from './gear-ledger.ts';
import { isOffline as offlineGear, openGear, runOp } from './gear-net.ts';
import { storedToken, writerBase } from '../writer-call.ts';
import { openCharacter } from './open.ts';

type Deps = { storage: { getItem(key: string): string | null } | null; search: string; now: () => number; fetch?: typeof fetch; getLoot: () => Loot | undefined; show: (loot: Loot) => void; refused?: () => void };
export function createServerGear(d: Deps) {
  let character: string | null = null, view: GearView | null = null, busy = false, loading = false, shadow: { loot: Loot } | null = null;
  // 8 s, not the 4 s default: the sheet opens while the page is busy drawing the mannequin, and a late answer is better than the device's ledger shown in its place (one browser run missed 4 s under load).
  const opts = () => ({ base: writerBase(d.search), timeoutMs: 8000, ...(d.fetch ? { fetch: d.fetch } : {}) });
  // The server owns owned / worn / pack / tiers; the move, declines and skull wall stay the local profile's.
  // The server's view is SHOWN from a shadow of the profile, never written into it: the Pit's other persist paths (a decline, a take) keep saving the device's own ledger untouched.
  const apply = (v: GearView) => { view = v; const s = lootOfView(v), loot = { ...(d.getLoot() ?? emptyLoot()), owned: s.owned, equipped: s.equipped, pack: s.pack, taken: s.taken }; shadow = { loot }; d.show(loot); };
  async function who(): Promise<string | null> {
    if (character) return character;
    const token = storedToken(d.storage, d.now()); if (!token) return null;
    return (character = await openCharacter({ storage: d.storage, search: d.search, now: d.now, ...(d.fetch ? { fetch: d.fetch } : {}) }));   // the page's one `open` (src/fight/open.ts), shared with the Pit's own load
  }
  return {
    // Called whenever the sheet opens: read the ledger; nothing changes on any failure (the local ledger stays on screen).
    async refresh(): Promise<boolean> {
      if (!storedToken(d.storage, d.now())) return false;
      loading = true;
      try {
        const id = await who(), token = storedToken(d.storage, d.now()); if (!id || !token) return false;
        const got = await openGear(token, id, opts()); if (offlineGear(got)) return false;
        apply(got); return true;
      } finally { loading = false; }
    },
    // What the sheet reads and writes: the server's shadow once it has answered, else the device profile itself.
    profileFor<T extends { loot?: Loot }>(real: T): { loot?: Loot } { return shadow ?? real; },
    // The sheet's one decision point: handled (true) once the server's view is known, so the local ledger never decides for a signed-in character.
    act(op: GearOp): boolean {
      const token = storedToken(d.storage, d.now()); if (!token) return false;   // a guest: the device's ledger
      if (!view || !character) return loading;   // signed in and the answer is still on its way: the tap waits (is swallowed) instead of changing the device's ledger behind the server's; a writer that never answered falls back
      if (busy) return true;   // one op at a time: the next tap after the answer
      busy = true; const v = view, id = character;
      void runOp(token, id, v, op, opts()).then((out) => { if (!offlineGear(out.view)) apply(out.view); if (out.refused) d.refused?.(); }).finally(() => { busy = false; });
      return true;
    },
  };
}
