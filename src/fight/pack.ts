// Packs and the threat list (Combat, docs/specs/combat/threat-list.md and docs/specs/origins/mob-fights-proposal.md (b); Dom: "nothing less, nothing more", ONE engine).
// Two pure pieces, both OUTSIDE SIM_FILES like src/fight/mobkit.ts and src/fight/twist.ts: they read a Duel and build the next one from existing exports, they write nothing back into the sim, so no RECORD_VERSION.
//  1. A camp is a SEQUENCE of ordinary Pit bouts against the same player (`startPack`, `nextBout`): the player's fighter (health, stamina, posture, wound, cooldowns) carries over untouched, the next member walks in
//     from the play circle's far edge, the leader enters last. Waiting members are presentation only, not in the sim.
//  2. The creature's THREAT LIST (`ThreatList`): who the creature turns on when several players hit it. Donor: AzerothCore ThreatManager (damage adds threat; the current victim changes only when another beats it
//     by 110 %, casters 130 %; a list cap of 7; suppressed targets are used only when no online one is left). Deterministic: a pure function of the join order and the damage stream, ties go to the earlier joiner.
import type { Practice } from './combat.ts';
import { idleIntent, opponentFighter, stepDuel, type Duel, type Intent } from './duel.ts';
import { M } from './detmath.ts';
import type { Opponent } from './moves.ts';
import type { RecordGroup } from './record.ts';
import { RADIUS, type State } from './sim.ts';

export const THREAT_MAX = 7;
export const SWITCH_MELEE = 1.1, SWITCH_CASTER = 1.3;

export type ThreatState = 'online' | 'suppressed' | 'offline';
export type ThreatRef = { id: string; join: number; threat: number; state: ThreatState };
export type ThreatList = { refs: readonly ThreatRef[]; victim: string | null; joins: number };
export const emptyThreat = (): ThreatList => ({ refs: [], victim: null, joins: 0 });

const rank = (r: ThreatRef): number => (r.state === 'online' ? 2 : r.state === 'suppressed' ? 1 : 0);
// The best candidate: the most available state first, then the most threat, then the earlier joiner.
const best = (refs: readonly ThreatRef[]): ThreatRef | null => refs.reduce<ThreatRef | null>((b, r) => (r.state === 'offline' ? b : !b || rank(r) > rank(b) || (rank(r) === rank(b) && (r.threat > b.threat || (r.threat === b.threat && r.join < b.join))) ? r : b), null);
// ReselectVictim: keep the current victim while it is available and nobody beats it by the margin; otherwise the best candidate.
const reselect = (list: ThreatList, caster: boolean): ThreatList => {
  const top = best(list.refs), cur = list.refs.find((r) => r.id === list.victim);
  if (!top) return { ...list, victim: null };
  if (!cur || cur.state === 'offline' || rank(top) > rank(cur)) return { ...list, victim: top.id };
  return top.id !== cur.id && top.threat > cur.threat * (caster ? SWITCH_CASTER : SWITCH_MELEE) ? { ...list, victim: top.id } : list;
};

// Join the list (aggro, or the player's engage tap). A repeat join changes nothing; the 8th is ignored until a slot frees. The first joiner is the victim until someone beats it.
export const joinThreat = (list: ThreatList, id: string, caster = false): ThreatList => {
  if (list.refs.some((r) => r.id === id) || list.refs.length >= THREAT_MAX) return list;
  return reselect({ ...list, refs: [...list.refs, { id, join: list.joins, threat: 0, state: 'online' }], joins: list.joins + 1 }, caster);
};
// Damage dealt adds threat (a hit by a non-member joins first, so a hit from a player who never tapped still counts).
export const addThreat = (list: ThreatList, id: string, amount: number, caster = false): ThreatList => {
  const joined = joinThreat(list, id, caster);
  if (!joined.refs.some((r) => r.id === id) || !(amount > 0)) return joined;
  return reselect({ ...joined, refs: joined.refs.map((r) => (r.id === id ? { ...r, threat: r.threat + amount } : r)) }, caster);
};
export const setThreatState = (list: ThreatList, id: string, state: ThreatState, caster = false): ThreatList =>
  reselect({ ...list, refs: list.refs.map((r) => (r.id === id ? { ...r, state } : r)) }, caster);
// Death, leaving the leash/aggro, the creature evading: the entry goes, its join slot is not reused (the join order of the others is what anti-gank reads).
export const dropThreat = (list: ThreatList, id: string, caster = false): ThreatList => reselect({ ...list, refs: list.refs.filter((r) => r.id !== id) }, caster);

// ---- a pack is a sequence of bouts -------------------------------------------------------------------------------------------------
export type Pack = { members: readonly Opponent[]; index: number };
// Camp order is data; the leader (last in `members`) enters when no follower is left.
export const startPack = (members: readonly Opponent[]): Pack => {
  if (!members.length) throw RangeError('Pack: a camp has at least one member');
  return { members, index: 0 };
};
export const packFoe = (pack: Pack): Opponent => pack.members[pack.index]!;
export const packLeft = (pack: Pack): number => pack.members.length - pack.index - 1;

// Where the next member walks in from: the play circle's far edge from the player (its own approach phase does the rest), facing the player. Deterministic (detmath), no RNG.
export const walkInBody = (duel: Duel, inset = 0.6): State => {
  const hero = duel.fighters[0].body, len = M.hypot(hero.x, hero.z), ux = len > 1e-6 ? -hero.x / len : 0, uz = len > 1e-6 ? -hero.z / len : 1, r = Math.max(RADIUS - inset, 0);
  const x = ux * r, z = uz * r;
  return { x, z, heading: M.atan2(hero.x - x, hero.z - z), distance: 0 };
};

// The next bout, or null while the engaged member is still standing / the player fell / nobody is left. `fled`: the member ran (twist FoeFled) and does not need to die. The player's fighter is carried over as is.
export function nextBout(pack: Pack, duel: Duel, fled = false): { pack: Pack; duel: Duel } | null {
  const memberDown = fled || (duel.finish !== null && !duel.finish.draw && duel.finish.victim === 1);
  if (!memberDown || packLeft(pack) <= 0) return null;
  const next = pack.members[pack.index + 1]!;
  return { pack: { ...pack, index: pack.index + 1 }, duel: { ...duel, fighters: [duel.fighters[0], opponentFighter(next, walkInBody(duel))], finish: null } };
}

// ---- N attackers on one creature: parallel ordinary duels, ONE shared health pool (RV39; docs/specs/combat/threat-list.md "Decision") -------------------------------------------------------------------
// Each attacker fights their own Pit duel against their own copy of the creature; a copy attacks only its own attacker. The pool is shared by the one sim hook there is: Duel.incoming, the damage the OTHER streams dealt
// last tick, which lands on this copy after its own blows (one tick of latency, identical live and on replay). Per-copy state that is not health (posture, poise, stagger, stance mood, a boss special) is per stream on
// purpose: each attacker fights the creature they see, and a special fires once per stream. Every stream's record carries what it was fed (the incoming list) and when it was held idle, so each verifies ALONE.
export const TOKENS = 3;   // attack tokens: at most this many copies attack at once (Dom: 3-4 active); the rest are HELD, idle in the sim, and the hold is recorded
export type StreamLog = { incoming: [number, number][]; held: [number, number][]; dealt: [number, number][] };   // dealt: (tick, damage this attacker put on the creature), the ledger groupKill reads; it is not in the record (the replay re-derives it)
export type StreamGroup = { duels: readonly Duel[]; carry: readonly number[]; tokens: number; logs: readonly StreamLog[] };
export const startStreams = (duels: readonly Duel[], tokens = TOKENS): StreamGroup => {
  if (duels.length < 2 || duels.length > THREAT_MAX) throw RangeError(`Streams: a shared-health group is 2..${THREAT_MAX} duels (a lone stream is the ordinary fight)`);
  return { duels, carry: duels.map(() => 0), tokens, logs: duels.map(() => ({ incoming: [], held: [], dealt: [] })) };
};
// Damage this tick's blows put on the creature (side 1) by its attacker: blows and landed specials. SharedHit is the pool's own delivery and never counts, or the streams would feed each other forever.
export const dealtOn = (d: Duel): number => d.events.reduce((sum, e) => (e.tick === d.tick && e.target === 1 && e.actor === 0 && (e.type === 'Hit' || e.type === 'SpecialLanded') ? sum + (e.damage ?? 0) : sum), 0);
// One tick for every stream. `foe[i]` is stream i's creature-copy intent from its AI; a copy outside the first `tokens` unfinished streams (join order) is held idle. A stream whose player has dropped passes an idle
// intent and KEEPS stepping (Dom: no escape by disconnecting): it is never removed, which would change the others' incoming.
export function stepStreams(group: StreamGroup, player: readonly Intent[], foe: readonly Intent[]): StreamGroup {
  const n = group.duels.length;
  if (player.length !== n || foe.length !== n) throw RangeError('Streams: one player and one creature intent per stream');
  let granted = 0;
  const held = group.duels.map((d) => (d.finish ? false : granted++ >= group.tokens));
  const stepped = group.duels.map((d, i) => (d.finish ? d : stepDuel(group.carry[i] ? { ...d, incoming: group.carry[i] } : d, [player[i]!, held[i] ? idleIntent() : foe[i]!])));
  const dealt = stepped.map((d, i) => (d === group.duels[i] ? 0 : dealtOn(d)));
  const total = dealt.reduce((a, b) => a + b, 0);
  const logs = group.logs.map((log, i): StreamLog => {
    const tick = stepped[i]!.tick, spans = log.held;
    const last = spans[spans.length - 1];
    return {
      dealt: dealt[i] ? [...log.dealt, [tick, dealt[i]!]] : log.dealt,
      incoming: group.carry[i] && stepped[i] !== group.duels[i] ? [...log.incoming, [tick, group.carry[i]!]] : log.incoming,
      held: !held[i] ? spans : last && last[1] === tick ? [...spans.slice(0, -1), [last[0], tick + 1]] : [...spans, [tick, tick + 1]],
    };
  });
  return { ...group, duels: stepped, carry: dealt.map((own) => total - own), logs };
}
// What stream i's record carries in its header.
export const streamRecordGroup = (group: StreamGroup, index: number): RecordGroup => ({ n: group.duels.length, index, incoming: group.logs[index]!.incoming, held: group.logs[index]!.held });

// ONE kill and one payout per creature (Auditor, hole 2). The pool is the creature's bar minus EVERYONE's damage; the kill is the hit that takes the running total to zero, hits of one tick taken in join order (lowest
// index first). That stream is the killer even when every copy fell to SharedHit damage a tick later (two simultaneous hits that leave each copy above zero). Null while the pool stands.
export function groupKill(group: StreamGroup): number | null {
  const bar = group.duels[0]!.fighters[1].maxHealth;
  const hits = group.logs.flatMap((log, index) => log.dealt.map(([tick, damage]) => ({ tick, index, damage }))).sort((a, b) => a.tick - b.tick || a.index - b.index);
  let total = 0;
  for (const h of hits) { total += h.damage; if (total >= bar) return h.index; }
  return null;
}

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
