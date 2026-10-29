// Input across a sim hand-over (data/respawn.json input). In the endless world the one duel sim hands from boss to boss as the hero walks past them; that is bookkeeping, not
// something the player did, so a thumb still on the left stick must keep walking. Pure rules; the page (src/client/main.ts) asks `dropsInput` before it clears the controls.
// Clears that stay: the hero's death and respawn, the Respawn button, a page blur / hide, and a fight that starts on a hero who was not free-walking (a hand-over is `handOver`).
// ?input=v1 clears on every hand-over, as before.
import ROWS from '../../data/respawn.json' with { type: 'json' };

type HandOverInputRows = { keepOnHandOver: boolean; query: string; off: string };
export const HAND_OVER_INPUT = ROWS.input as HandOverInputRows;

/** The page keeps the controls across a hand-over: the row says so and the link does not carry the off switch. */
export const keepsInput = (search: string, rows: HandOverInputRows = HAND_OVER_INPUT): boolean => rows.keepOnHandOver && new URLSearchParams(search).get(rows.query) !== rows.off;

/** Whether this reset clears the controls. `handOver`: the hero is free-walking and the sim only changes which boss it holds; every other reset (death, respawn, button) clears. */
export const dropsInput = (keep: boolean, handOver: boolean): boolean => !(keep && handOver);
