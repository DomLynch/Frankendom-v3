// V3 (Dom 2026-10-26): the opponent keeps the Minotaur's look but fights as V1's Pitborn (data/fight.json `opponent`): the Pitborn's moves,
// cleaver, stats, AI profile and class special (Earth Fold at 18), no shield and no shield-bearer block. `?pitborn=v1` is the fight before
// that call exactly (data/fight.json `opponentV1`: the Centurion, drawn as the same 106 Minotaur with the Cleaver drawn over his gladius,
// foe-weapon.ts). A behaviour toggle only: it never loads another body. (`?foe=v1`, V1's 65 Centurion body, was removed with the 65 bodies:
// 106 only, Dom 2026-10-26; ?pitborn=v1 is the Centurion's fight.) The one place the page reads the opponent id (src/client/main.ts).
export type OpponentV1Row = { opponent: string };
export type FightPick = { opponent: string; opponentV1: OpponentV1Row };

/** Whether this page plays the fight before the Pitborn call (?pitborn=v1). */
export const pitbornV1 = (search: string): boolean => new URLSearchParams(search).get('pitborn') === 'v1';
/** The opponent id this page fights: `opponent`, or `opponentV1.opponent` under ?pitborn=v1. */
export const fightOpponent = (fight: FightPick, search: string): string => (pitbornV1(search) ? fight.opponentV1.opponent : fight.opponent);
