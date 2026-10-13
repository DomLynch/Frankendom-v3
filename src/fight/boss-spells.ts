// The spell each boss legend teaches (bosses.json `bricks`: the brick list, programme 2b "kill a boss, take their spell"). Keyed by the LEGEND id (the boss row id). Not in the sim: it moves no fight.
import { BOSSES } from './boss-rows.ts';

export const BOSS_BRICKS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(BOSSES.filter((r) => r.bricks !== undefined && r.bricks.length > 0).map((r) => [r.id, r.bricks as readonly string[]]));
