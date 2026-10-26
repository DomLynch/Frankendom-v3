// The fight starts by itself (Dom 2026-10-26: "remove the start button… The game just starts"; V2 started armed). V1's hero begins
// 'sheathed' and his first press draws (duel.ts: a light/heavy/thrust/skill press while sheathed starts RULES.draw); the opponent's AI
// waits until the draw is done (ai.ts: nothing while the foe is sheathed or drawing). V3 keeps that sim exactly and has the driver make
// the press for him: on the first tick the fight is running (art in, page shown), a sheathed hero with no press of his own gets V1's
// draw press ('light', the press STRIKE sends). The sim sees the same input a tap on Fight produced, so Gate 0's replays are untouched.
// The scene's standoff (standoff.ts) already plays both rigs' draw-in from the moment the art is ready, so the draw is seen once.
// data/fight.json start.auto turns it on; ?start=v1 = V1's Fight press.
export const autoStartOn = (search: string, row: boolean): boolean => row && !/[?&]start=v1\b/.test(search);

type Running = { phase: string; finish: unknown };
// The action the driver steps with this tick: the player's own press always wins; else the draw while sheathed in a fight not yet over.
export const startAction = <A extends string>(on: boolean, practice: Running, action: A | null): A | 'light' | null =>
  on && action === null && practice.phase === 'sheathed' && !practice.finish ? 'light' : action;
