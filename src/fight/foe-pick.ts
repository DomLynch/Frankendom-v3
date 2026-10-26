// V3 (Dom 2026-10-26): the opponent keeps the Minotaur's look but fights as V1's Pitborn (data/fight.json `opponent`): the Pitborn's moves,
// cleaver, stats, AI profile and class special (Earth Fold at 18), no shield and no shield-bearer block. `?pitborn=v1` is the fight before
// that call exactly (data/fight.json `opponentV1`: the Centurion, drawn as the Minotaur with the Cleaver drawn over his gladius, foe-weapon.ts).
// `?foe=v1` (V1's body for whoever the opponent is) picks that fight too: V1's pitborn.glb is not in V3's assets, and ?foe=v1 has always been
// "the Centurion exactly". The one place the page reads the opponent id (src/client/main.ts); everything else takes it from there.
import { foeV1 } from './foe-body.ts';

export type OpponentV1Row = { opponent: string; query: string };
export type FightPick = { opponent: string; opponentV1: OpponentV1Row };

/** Whether this page plays the fight before the Pitborn call (?<opponentV1.query>=v1, ?pitborn=v1; or ?foe=v1 which is the Centurion exactly). */
export const pitbornV1 = (fight: FightPick, search: string): boolean => new URLSearchParams(search).get(fight.opponentV1.query) === 'v1' || foeV1(search);
/** The opponent id this page fights: `opponent`, or `opponentV1.opponent` under ?pitborn=v1 / ?foe=v1. */
export const fightOpponent = (fight: FightPick, search: string): string => (pitbornV1(fight, search) ? fight.opponentV1.opponent : fight.opponent);
