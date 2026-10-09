// The ONE speed table of the open world (Dom via Strategy, 2026-10-08: "the same for every player"): the player's walk and run, a creature's amble and chase, the wolf's exception, the leash
// and give-up numbers, the out-of-combat window and the hero-side disengage. Zone 1 WORLD LAYER only: nothing here is read by src/ (no sim change, no RECORD_VERSION). A fight that is
// engaged runs on the sim's own pace (sim.ts: run 5.2 m/s x Opponent.speed), so the chase numbers below must never exceed what the sim would do for that creature (origins/preview/speeds.test.ts).
export const SPEEDS = {
  player: { walk: 2.3, run: 5.2 },    // m/s: the gait table's walk and Run knot (main.ts took these from the Pit pad); the sim's own run is 5.2 (sim.ts advance)
  creature: { amble: 0.9, chase: 4.5, wolfChase: 6.0 },   // m/s: slower than a running player (so running away works) except the wolf, who is faster and gives up sooner
} as const;
export const LEASH = { default: 30, wolf: 15 } as const;   // m from where the chase STARTED: past it the creature walks home and heals to full, no event
export const GIVE_UP_UNSEEN_S = 10;   // s out of sight before any creature gives up (leaving the zone always ends it too)
export const OUT_OF_COMBAT_S = 6;     // s with no damage taken or dealt before a fighter counts as out of combat (regen starts)
export const DISENGAGE_M = 12, DISENGAGE_S = 3;   // the hero-side disengage: a world fight ends silently when the hero has been farther than 12 m from the foe for 3 s
export const ENGAGE_GAP_MAX_M = 6.5, COMMIT_RANGE_M = 8;   // Strategy's spec numbers the disengage must stay beyond (the max start gap before spawnScale, the commit range)
export const chaseSpeed = (kind: string): number => (kind === 'wolf' ? SPEEDS.creature.wolfChase : SPEEDS.creature.chase);
export const leashOf = (kind: string): number => (kind === 'wolf' ? LEASH.wolf : LEASH.default);
