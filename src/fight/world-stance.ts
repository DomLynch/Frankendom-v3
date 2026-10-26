// The stance the open world's duel starts on (Dom 2026-10-19: "world-fight stances applied today"; Lead: the menu pick must reach the world fight). Presentation input only: it fills Match.stancePref,
// which the sim reads through begin() as before, so no record version moves. The pick is the one the stance menu stores for this device's character (stance-panel.ts loadStancePref, keyed by the
// device profile's id, the same id src/main.ts passes); `?stances=<pick>` still overrides it for a look test and `?stances=off` is the kill switch (stanceStart). No profile or storage = Balanced.
import { PICKS, type PickedStance } from './stance.ts';
import { loadStancePref, stanceStart, type StanceStore } from './stance-panel.ts';
import { FIGHTER_KEY } from '../core/profile.ts';

/** The device profile's id as the fighter record keeps it ('' when there is none, the storage is blocked or the value is not a profile). Read only: this never creates a profile. */
const profileId = (storage: StanceStore): string => {
  try { const v = JSON.parse(storage.getItem(FIGHTER_KEY) || 'null') as { id?: unknown } | null; return v && typeof v.id === 'string' ? v.id : ''; } catch { return ''; }
};

export const worldStancePick = (search: string, storage: StanceStore | null): PickedStance | undefined => {
  const id = storage ? profileId(storage) : '';
  return stanceStart(search, storage && id ? loadStancePref(storage, id) : PICKS[0]);
};
