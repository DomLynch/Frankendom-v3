// Packs and the threat list (Combat, docs/specs/combat/threat-list.md and docs/specs/origins/mob-fights-proposal.md (b); Dom: "nothing less, nothing more", ONE engine).
// Two pure pieces, both OUTSIDE SIM_FILES like src/fight/mobkit.ts and src/fight/twist.ts: they read a Duel and build the next one from existing exports, they write nothing back into the sim, so no RECORD_VERSION.
//  1. A camp is a SEQUENCE of ordinary Pit bouts against the same player (`startPack`, `nextBout`): the player's fighter (health, stamina, posture, wound, cooldowns) carries over untouched, the next member walks in
//     from the play circle's far edge, the leader enters last. Waiting members are presentation only, not in the sim.
//  2. The creature's THREAT LIST (`ThreatList`): who the creature turns on when several players hit it. Donor: AzerothCore ThreatManager (damage adds threat; the current victim changes only when another beats it
//     by 110 %, casters 130 %; a list cap of 7; suppressed targets are used only when no online one is left). Deterministic: a pure function of the join order and the damage stream, ties go to the earlier joiner.
import type { Practice } from './combat.ts';
import { idleIntent, type Duel, type Intent } from './duel.ts';
import type { RecordGroup } from './record.ts';
   // the dials are rows (pack-defs.json)
// The best candidate: the most available state first, then the most threat, then the earlier joiner.
// ReselectVictim: keep the current victim while it is available and nobody beats it by the margin; otherwise the best candidate.
// Join the list (aggro, or the player's engage tap). A repeat join changes nothing; the 8th is ignored until a slot frees. The first joiner is the victim until someone beats it.
// Damage dealt adds threat (a hit by a non-member joins first, so a hit from a player who never tapped still counts).
// Death, leaving the leash/aggro, the creature evading: the entry goes, its join slot is not reused (the join order of the others is what anti-gank reads).
// ---- a pack is a sequence of bouts -------------------------------------------------------------------------------------------------
// Camp order is data; the leader (last in `members`) enters when no follower is left.
// Where the next member walks in from: the play circle's far edge from the player (its own approach phase does the rest), facing the player. Deterministic (detmath), no RNG.
// The next bout, or null while the engaged member is still standing / the player fell / nobody is left. `fled`: the member ran (twist FoeFled) and does not need to die. The player's fighter is carried over as is.
// ---- N attackers on one creature: parallel ordinary duels, ONE shared health pool (RV39; docs/specs/combat/threat-list.md "Decision") -------------------------------------------------------------------
// Each attacker fights their own Pit duel against their own copy of the creature; a copy attacks only its own attacker. The pool is shared by the one sim hook there is: Duel.incoming, the damage the OTHER streams dealt
// last tick, which lands on this copy after its own blows (one tick of latency, identical live and on replay). Per-copy state that is not health (posture, poise, stagger, stance mood, a boss special) is per stream on
// purpose: each attacker fights the creature they see, and a special fires once per stream. Every stream's record carries what it was fed (the incoming list) and when it was held idle, so each verifies ALONE.
   // dealt: (tick, damage this attacker put on the creature), the ledger groupKill reads; it is not in the record (the replay re-derives it)
// Damage this tick's blows put on the creature (side 1) by its attacker: blows and landed specials. SharedHit is the pool's own delivery and never counts, or the streams would feed each other forever.
// One tick for every stream. `foe[i]` is stream i's creature-copy intent from its AI; a copy outside the first `tokens` unfinished streams (join order) is held idle. A stream whose player has dropped passes an idle
// intent and KEEPS stepping (Dom: no escape by disconnecting): it is never removed, which would change the others' incoming.
// What stream i's record carries in its header.
// ONE kill and one payout per creature (Auditor, hole 2). The pool is the creature's bar minus EVERYONE's damage; the kill is the hit that takes the running total to zero, hits of one tick taken in join order (lowest
// index first). That stream is the killer even when every copy fell to SharedHit damage a tick later (two simultaneous hits that leave each copy above zero). Null while the pool stands.
// ---- replaying ONE stream from its own record (src/fight/replay.ts) ----------------------------------------------------------------------------
const incomingMaps = new WeakMap<RecordGroup, { incoming: Map<number, number> }>();
const incomingOf = (g: RecordGroup): Map<number, number> => { let m = incomingMaps.get(g); if (!m) incomingMaps.set(g, m = { incoming: new Map(g.incoming) }); return m.incoming; };
export const withIncoming = (practice: Practice, g: RecordGroup, tick: number): Practice => {
  const amount = incomingOf(g).get(tick);
  return amount ? { ...practice, duel: { ...practice.duel, incoming: amount } } : practice;
};
// The recorded hold: the creature copy's intent is forced idle on those ticks, exactly as the live layer did.
export const groupLayer = (g: RecordGroup, tick: number): ((duel: Duel, warden: Intent) => Intent) | undefined =>
  g.held.some(([from, to]) => tick >= from && tick < to) ? () => idleIntent() : undefined;
