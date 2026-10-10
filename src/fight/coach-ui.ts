// The Coach on the page (TOP10 row 8, Web): the on/off toggle, the take-over on any fight press, the "Coached" tag and marker. Presentation and input routing only:
// the brain, the spans and the build string are src/coach.ts (Combat); no sim file reads anything here. ON by default as a feature; `?coach=off` is the kill switch only (Dom 2026-10-08, "keep everything ON").
// The toggle is saved per DEVICE (localStorage), the same pattern as the camera-lock chip (Lead ruling 2026-10-08); the single bit is "Coach plays", and a take-over turns it off so the chip tells the truth.
import { coachBuild, createCoachDriver, type CoachDriver, type CoachSpan, type CoachStopReason } from '../coach.ts';
import { idleIntent, type Duel, type Intent } from '../duel.ts';
import type { PickedStance } from '../stance.ts';

export const COACH_KEY = 'frankendom.coach';
export const coachKilled = (search: string): boolean => /[?&]coach=off(?:&|$)/.test(search);
export type CoachStore = Pick<Storage, 'getItem' | 'setItem'>;
export const loadCoachPref = (store: CoachStore): boolean => { try { return store.getItem(COACH_KEY) === '1'; } catch { return false; } };
const saveCoachPref = (store: CoachStore, on: boolean): void => { try { store.setItem(COACH_KEY, on ? '1' : '0'); } catch { /* unsaved: the chip still shows the truth for this page */ } };
export type CoachEvent = { type: 'start' | 'stop'; tick: number; stance?: PickedStance; reason?: CoachStopReason };

export type CoachSession = {
  readonly on: boolean;
  readonly pref: boolean;
  readonly spans: readonly CoachSpan[];
  readonly coached: boolean;                                   // the Coach played any tick of this fight (the "Coached" marker)
  begin(seed: number, stance: PickedStance, tick: number, allowed?: boolean): void;   // a new fight: the saved pref arms the Coach from tick 0
  set(on: boolean, tick: number, reason?: CoachStopReason): void;  // the menu toggle, the tag (reason 'tag') and the press hand-over ('tap') all come through here
  end(tick: number): void;                                     // the fight finished: closes an open span with reason 'end'
  pick(duel: Duel, player: () => Intent): Intent;              // ONE input source per tick; the player's thunk is only read when the Coach is off
  build(label: string, kit: string | null): string;
};

export function createCoachSession(store: CoachStore, emit: (e: CoachEvent) => void, killed = false): CoachSession {
  let driver: CoachDriver | null = null, seed = 0, stance: PickedStance = 'neutral', pref = !killed && loadCoachPref(store), spans: readonly CoachSpan[] = [], allowedNow = true;   // allowedNow: this fight may be coached (career or practice, not a replay): the menu chip honours it too
  const startAt = (tick: number): void => {
    driver ??= createCoachDriver(stance, seed);
    if (driver.on) return;
    driver.start(tick); emit({ type: 'start', tick, stance });
  };
  return {
    get on() { return !!driver?.on; }, get pref() { return pref; }, get spans() { return driver?.spans ?? spans; }, get coached() { return (driver?.spans ?? spans).length > 0; },
    begin(s, st, tick, allowed = true) { allowedNow = allowed; seed = s; stance = st; driver = null; spans = []; if (pref && allowed && !killed) startAt(tick); },
    set(on, tick, reason = 'menu') {
      if (killed) return;
      pref = on; saveCoachPref(store, on);
      if (on && allowedNow) startAt(tick);
      else if (driver?.on) { driver.stop(tick); emit({ type: 'stop', tick, reason }); }
    },
    end(tick) { if (driver?.on) { driver.stop(tick); emit({ type: 'stop', tick, reason: 'end' }); } },
    pick(duel, player) { return driver && driver.on ? driver.pick(duel, idleIntent()) : player(); },
    build(label, kit) { return coachBuild(label, stance, driver?.spans ?? spans, kit); },
  };
}
