// The opponent archetypes' bodies and AI tables as ROWS (Dom, "centralized game engine, no hard coding"; recce #2554, sim batch A). One row per archetype in archetype-defs.json, manifest-loaded through the
// shared registry. A profile tier is `from` a shared tier of PROFILES (the old `...PROFILES.hard` spread) with `set` overrides, plus an optional named `identity` block (the Witch's WITCH_IDENTITY);
// buildArchetypes composes them in moves.ts, handing in PROFILES and RULES.health so nothing circular is imported. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import ARCHETYPE_DEFS from './archetype-defs.json' with { type: 'json' };
import ARCHETYPE_MANIFEST from './archetype-defs.manifest.json' with { type: 'json' };

const ARCHETYPE_IDENTITY_TABLE = tableFromFile(ARCHETYPE_MANIFEST.tables[0] as unknown as Manifest, ARCHETYPE_DEFS, 'archetype-defs.json');
const ARCHETYPE_TABLE = tableFromFile(ARCHETYPE_MANIFEST.tables[1] as unknown as Manifest, ARCHETYPE_DEFS, 'archetype-defs.json');
loadRegistry([ARCHETYPE_IDENTITY_TABLE, ARCHETYPE_TABLE]);
type TierSpec = { from?: string; identity?: string; order?: string[]; set: Record<string, number> };
type ArchetypeRow = { id: string; health: number | 'rules'; profiles: Record<string, TierSpec> } & Record<string, unknown>;
const ARCHETYPE_IDENTITIES = new Map((ARCHETYPE_IDENTITY_TABLE.rows as unknown as { id: string; values: Record<string, number> }[]).map((r) => [r.id, r.values]));
// ARCHETYPES as the code held it before it became rows (comments are the owners' rulings):
// | {
// |   // Hard: pressure .7 and a discipline floor of 30 keep him cutting instead of resting (the shared hard was two wins tighter than normal;
// |   // docs/state/combat.md). His own table so the Executioner (shared PROFILES) is untouched.
// |   veteran: { scale: 1, health: RULES.health, poise: 0, profiles: { ...PROFILES, hard: { ...PROFILES.hard, pressure: .7, discipline: 30 } } },   // the trident since slice V (2026-09-16)
// |   // `scale` is measured off witch.glb (the reconstruction is fitted to the Veteran's 1.80 m rig, so her standing ratio is 1).
// |   // Her own Easy (Dom, 2026-09-24): same trident as the Centurion, a different fight. He plants and throws heavies and thrusts
// |   // (pressure 0); she sweeps lights (pressure .75), hops back out after she lands (disengage), drifts round him (circle), takes her
// |   // evasions as backsteps (step), and blocks less. Same difficulty (RV17): the hero's easy brain beats her 3/24 (him 5/24), its normal
// |   // brain 20/24 (him 24/24), 24 seeds, tests/witch-profile.test.ts.
// |   // Her identity (the sweep and the hop: pressure .75, disengage .5, circle .6, step .7, guard .4) is held at EVERY level (Lead ruling
// |   // 2026-09-27, Dom: "the witch's sweep and hop" stay); only her skill fields change with the level. Before, normal and hard were the plain warden's.
// |   witch: { scale: 1, health: RULES.health, poise: 0, profiles: {
// |     // Skill fields retuned (Combat, 2026-09-27; Lead: skill only, identity held, L18 unchanged, no strategy > 80 % at L ≥ 6): with her hop held at
// |     // every level, a reaction of 26 left thrust-from-range at 46–48 / 48 through L10–16; she now answers it (worst row L6–17: 32 / 48).
// |     easy: { reaction: 15, accuracy: .5, parry: .2, dodge: .2, aggression: .45, ...WITCH_IDENTITY, discipline: 50, lapse: .35, read: .65 },
// |     // Normal skill fields (Combat sweep, Lead ruling (a), 2026-09-28): her hop held at normal put estoc / scythe thrust from range 16 / 20 and
// |     // trident charged heavy only 13 / 24 over the weapon cap (12); reaction 14 -> 12, parry .3 -> .45, read .7 -> .8 bring them to 6 / 11 / 7,
// |     // worst other weapon longsword 10 / 24 (c4; the two-field c3 left trident on the cap, inside seed noise, so Lead took the margin).
// |     normal: { ...PROFILES.normal, reaction: 12, parry: .45, read: .8, ...WITCH_IDENTITY },
// |     hard: { ...PROFILES.hard, discipline: 30, ...WITCH_IDENTITY } } },
// |   // The dwarf (character lane, 2026-09-20): the Veteran's trident game on a short, wide, re-proportioned rig (build-warrior.mjs BUILD.dwarf).
// |   // Measured in the shared Idle he stands 1.361 m to the hero's 1.745 (×0.780; tests/characters.test.ts pins it) — the goblin's height with
// |   // a barrel body; the hit capsule follows the measured height like the goblin's. Sturdier than a man: 170 health and poise 12 — a stab (11)
// |   // never stops him, a plain cut (14) or heavier does. Same AI profiles as the Veteran until the combat lane tunes him.
// |   // His own brain (Combat slice, 2026-09-20): the Veteran's pressure 0 made ~85 % of his openers hammer heavies; a chopper's mix
// |   // (pressure .5), a low parry (the blunt punish is not his game) and a normal reaction. Hero's brain 24 seeds: see the battery.
// |   dwarf: { scale: .78, health: 170, poise: 12, profiles: {
// |     easy: { reaction: 24, accuracy: .5, parry: .05, dodge: .1, aggression: .55, pressure: .4, discipline: 55, lapse: .45, read: .55 },
// |     normal: { reaction: 14, accuracy: .8, parry: .15, dodge: .15, aggression: .85, pressure: .5, discipline: 45, lapse: .3, read: .8 },   // aggression .7 → .85, lapse .25 → .3 (owner: align with the others): 12/24 in 32 s, was 11/24 in 38 s — the longest fights on the ladder
// |     hard: { reaction: 12, accuracy: .85, parry: .25, dodge: .25, aggression: .85, pressure: .55, discipline: 40, lapse: .15, read: .85 },   // accuracy .9 → .85, lapse .1 → .15: 7/24 like the Pitborn's hard, was 4/24
// |   } },
// |   // The pit brute: relentless light chains (aggression, pressure), a low parry rate, slower to notice, a low discipline floor so he
// |   // swings himself hot; poise 16 — a plain cut (14) or stab (11) never stops him, a heavy (18) or any counter does.
// |   // Health 190: with the Veteran's brain driving the hero he took 150 in ~22 s (probe, 24 seeds); the brute is meant to take more killing than a man.
// |   pitborn: { scale: 1.13, health: 190, poise: 16, profiles: {
// |     easy: { reaction: 28, accuracy: .5, parry: .05, dodge: .05, aggression: .6, pressure: .6, discipline: 30, lapse: .45, read: .45 },
// |     // Reaction 14 and lapse .1: he notices the stab in time to block it and answers what he sees, so stop-hitting him as he walks in no
// |     // longer wins on its own; the whiff punisher stays the answer (the probe that set these: docs/state/combat.md).
// |     normal: { reaction: 14, accuracy: .85, parry: .15, dodge: .1, aggression: .8, pressure: .7, discipline: 25, lapse: .1, read: .6 },
// |     hard: { reaction: 12, accuracy: .9, parry: .4, dodge: .3, aggression: .95, pressure: .75, discipline: 24, lapse: .08, read: .75 },   // parry .3 → .4, dodge .2 → .3 (owner, 2026-09-20): hard was 15/24 for the hero's brain; more answers, 17/24 (sweep). discipline 20 → 24 with the cleaver (slice W): its hack costs 42, and at 20 he swung himself empty into the whiff punisher (10/24 at hard, over the cap); 24 keeps him hot-headed (the Veteran holds 40) and the punisher at 7/24
// |   } },
// |   // The Shieldmaiden (shield wall; her own row, RV30, 2026-10-07, Strategy's identity line): the Pitborn's body and stamina game with a
// |   // guard-first brain — a low parry (she blocks), less aggression and the brace against a charging heavy. `guard` stays absent (= 1, the most a guard share can be). AI profile only:
// |   // no move timing changes. (A shield bash through the `kick` knob was dropped, Strategy 2026-10-07: it fires only against a roller or backstepper, and no profile knob opens a raised guard.)
// |   shieldmaiden: { scale: 1, health: 190, poise: 16, profiles: {
// |     easy: { reaction: 28, accuracy: .5, parry: .05, dodge: .05, aggression: .6, pressure: .6, discipline: 30, lapse: .45, read: .45 },
// |     normal: { reaction: 14, accuracy: .85, parry: .1, dodge: .1, aggression: .65, pressure: .7, discipline: 25, lapse: .1, read: .6, braceHeavy: .6 },
// |     hard: { reaction: 12, accuracy: .9, parry: .3, dodge: .3, aggression: .85, pressure: .75, discipline: 24, lapse: .08, read: .75, braceHeavy: .6 },
// |   } },
// |   // The Nightborn (opponent 5, the vampire duelist): the parry is his whole game — the highest parry share on the roster, the fastest
// |   // reaction, thrusts over cuts (pressure), a low dodge share, a man's health and no poise (a duelist is staggered like anyone; his
// |   // defence is the blade, not the hide). His guard is what makes him a fight and not a reskin: a 16-tick parry window (a man's is 10)
// |   // means the AI presses it at contact − 14 — tick 6 of a 20-tick cut, INSIDE the player's feint window (feintUntil 10) — so a feint
// |   // draws the parry; his parry COMMITS (guard.commits): he cannot cut out of it or hold it into a guard the way a man can, and he reads
// |   // the tell (elapsed time, not the blade's clock), so a swing held at its chamber draws it too. One that met nothing leaves him exposed
// |   // 40 ticks (a man's 8) with no swing out of it — the feint's own 10-tick guard, a human's ~200 ms to see the whiff and the punish cut's
// |   // 20-tick tell fit inside. His reaction (6 at normal) is the floor under the press: it must sit inside the feint window with a tick to spare.
// |   // The heavy's tell (34) is past his press, so an honest heavy is parried; a heavy held at its chamber past his press lands on the whiff.
// |   // Kicks open a standing guard. PROVISIONAL; the battery in tests/opponents.test.ts is the gate.
// |   nightborn: { scale: 1.03, health: RULES.health, poise: 0, guard: { window: 16, recovery: 40, commits: true }, profiles: {
// |     // Easy: a human reaction, a quarter parry and more lapses put him with the other rungs' easy (an 8-tick reaction and a .45 parry had
// |     // made easy as hard as hard; docs/state/combat.md); the commit is still there to learn.
// |     easy: { reaction: 16, accuracy: .7, parry: .25, dodge: .1, aggression: .5, pressure: .4, discipline: 55, lapse: .4, read: .7 },
// |     normal: { reaction: 6, accuracy: .85, parry: .7, dodge: .1, aggression: .52, pressure: .45, discipline: 45, lapse: .25, read: .85 },   // lapse .3 -> .25 and aggression .55 -> .52 (RV29, 2026-10-07): the posture/rear rules put 'scythe vs nightborn normal: charged heavy only untouched' at 3/24 (limit 2, the standing rule forbids un-offering the scythe); .25 measures 2/24 (wins 8 -> 5 with the aggression); lapse alone raised his exhausted ticks in the AI-vs-AI row to 290 (bar 240), .52 holds them at 87 (probe 2026-10-07; grid in docs/state/combat.md). The Plague Doctor took .3 -> .2 for the same row at bump 8.   // pressure .45: enough heavies that a roller is charged through (a cut-and-thrust man rolls too easily). aggression .6 → .55 (2026-09-23, the estoc's +0.30 m reach): with the longer blade in reach more often he swung himself into exhaustion (321 ticks over 24 AI fights, bar 240) and a trident charger won 14/24; .55 → 108 ticks and 8/24
// |     hard: { reaction: 5, accuracy: .95, parry: .8, dodge: .15, aggression: .65, pressure: .6, discipline: 35, lapse: .05, read: .95 },   // discipline 40 → 35, pressure .5 → .6 (owner, 2026-09-20): hard was no harder than normal (9/24 both); 18/24 now. Discipline 30 left no honest answer (feint-and-punish 0/24 at hard); 35 keeps it at 4. aggression .75 → .65 (2026-09-23): the estoc's +0.30 m reach took the feint-and-punish to 0/24 again; .65 → 7/24.
// |   } },
// |   // The Plague Doctor: a PLACEHOLDER — the Nightborn's row verbatim (Lead, 2026-09-23), only the scale measured: his body tops out at
// |   // 1.840 m against the player's 1.822 (hero rig, scale 1). Combat owns his real row and battery.
// |   plagueDoctor: { scale: 1, health: RULES.health, poise: 0, guard: { window: 16, recovery: 40, commits: true }, profiles: {
// |     // Easy: a human reaction, a quarter parry and more lapses put him with the other rungs' easy (an 8-tick reaction and a .45 parry had
// |     // made easy as hard as hard; docs/state/combat.md); the commit is still there to learn.
// |     easy: { reaction: 16, accuracy: .7, parry: .25, dodge: .1, aggression: .5, pressure: .4, discipline: 55, lapse: .4, read: .7, tellReaction: 15 },   // tellReaction 15 (bump 20, 2026-09-29; Lead ruling (a), Strategy confirmed): with the estoc, L6 'thrust from range' won 87 % (trunk longsword 71). His own easy anchor only, so the ladder's blend toward ABSENT (99) leaves L7+ on the reaction (identical fights) and L5 unchanged; 15 is the mildest that closes it (any tell under the 16 reaction does: 4 %)
// |     normal: { reaction: 6, accuracy: .85, parry: .7, dodge: .1, aggression: .45, pressure: .45, discipline: 45, lapse: .2, read: .85 },   // RV30: aggression .55 -> .45 (her own row, a poisoner waits; the Nightborn's .52). Combat retune at bump 8 (2026-09-23), the placeholder's one forced change: lapse .3 → .2. With the Nightborn's .3 he failed to touch a charger in 3/24 fights with the trident and the scythe (limit 2); .2 → at most 1, worst wins row 6/24
// |     hard: { reaction: 5, accuracy: .95, parry: .8, dodge: .15, aggression: .55, pressure: .6, discipline: 35, lapse: .05, read: .95 },   // discipline 40 → 35, pressure .5 → .6 (owner, 2026-09-20): hard was no harder than normal (9/24 both); 18/24 now. Discipline 30 left no honest answer (feint-and-punish 0/24 at hard); 35 keeps it at 4. aggression .75 → .65 (2026-09-23): the estoc's +0.30 m reach took the feint-and-punish to 0/24 again; .65 → 7/24.
// |   } },
// |   // The goblin (opponent 4, the pit-runner): small, fast, mean — 0.78× a man (his measured standing height; the rig is re-proportioned, not
// |   // shrunk: build-warrior.mjs BUILD.goblin), 100 health, poise 0 (anything staggers him). Reaction fast, parry 0 (he never parries), the dodge
// |   // share high, a low discipline floor. Slice X (combat review, 2026-09-17) gave him his identity knobs: he feints (a share of every cut and
// |   // heavy, against anyone), never guards (guard 0: he evades or steps back where a man would block), hops back out after landing (disengage),
// |   // drifts sideways while closing (circle) and recovers stamina half again as fast (regen 1.5). He fights with the knife: slash 1.2 / stab 1.45 /
// |   // hack 1.55 m (measured), inside a sword's cutting range — his `fight.close` 1.0.
// |   goblin: { scale: .78, health: 120, poise: 0, regen: 1.5, speed: 1.2, profiles: {   // health 100 → 120 (owner, 2026-09-17): a careless player deleted him in seven cuts; the hero brain beat him as often as the Pitborn, the rung before him
// |     easy: { reaction: 18, accuracy: .55, parry: 0, dodge: .3, aggression: .7, pressure: .5, discipline: 30, lapse: .4, feint: .15, guard: 0, disengage: .4, circle: .5, step: .6, interrupt: .3, kick: .4, dash: .6, read: .35 },
// |     normal: { reaction: 11, accuracy: .7, parry: 0, dodge: .4, aggression: .85, pressure: .6, discipline: 20, lapse: .2, feint: .3, guard: 0, disengage: .6, circle: .8, step: .8, interrupt: .6, kick: .6, dash: 1, read: .5, stab: .6 },
// |     hard: { reaction: 8, accuracy: .92, parry: 0, dodge: .5, aggression: .95, pressure: .65, discipline: 15, lapse: .08, feint: .4, guard: 0, disengage: .7, circle: 1, step: .8, interrupt: .8, kick: .7, dash: 1, read: .65, stab: 1 },
// |   } },
// |   // The Ash Wolf (Combat, 2026-10-07): the Goblin's hit-and-run on four legs. Smaller capsule (.8: at .62 the hero's brain could not hit the low body and won 24 of 24; .8 puts the easy and normal rows on the Goblin's own rates, 7 and 4 of 24), the fastest body in the roster
// |   // (speed 1.45, regen 1.4), little health (90) and no poise: it dies in a few clean cuts and punishes a slow one. Never guards, never kicks, never feints: it lunges (the thrust, with
// |   // `dash` closing the gap), bites (the light), mauls (the heavy, rare), circles and hops out after a landed bite (`disengage`) and evades by backstep, not roll (`step`). The rest is the twist
// |   // layer's flee-at in the world (a beast flees under 30%); in the Pit it fights to the end.
// |   wolf: { scale: .8, health: 90, poise: 0, regen: 1.4, speed: 1.45, profiles: {
// |     easy: { reaction: 18, accuracy: .55, parry: 0, dodge: .3, aggression: .7, pressure: .6, discipline: 25, lapse: .4, feint: 0, guard: 0, disengage: .5, circle: .6, step: .7, interrupt: .3, kick: 0, dash: .6, read: .35 },
// |     normal: { reaction: 11, accuracy: .55, parry: 0, dodge: .4, aggression: .85, pressure: .65, discipline: 20, lapse: .3, feint: 0, guard: 0, disengage: .7, circle: .9, step: .8, interrupt: .6, kick: 0, dash: 1, read: .5, stab: .7 },
// |     hard: { reaction: 8, accuracy: .92, parry: 0, dodge: .5, aggression: .95, pressure: .7, discipline: 15, lapse: .08, feint: 0, guard: 0, disengage: .8, circle: 1, step: .8, interrupt: .8, kick: 0, dash: 1, read: .65, stab: 1 },
// |   } },
// |   // The Tusked Boar (Combat, 2026-10-08, Dom: a boar in Zone 1): the wolf's rig family (the same seven-clip quadruped, the `bite` weapon, the wolf's capsule .8 and jaw bake), but a charger, not a
// |   // hit-and-runner: more health (140) and a little poise, slower than the wolf (speed 1.2), no hop-out after a landed gore (`disengage` 0) and little circling, so it rushes in (`dash` 1) and keeps coming.
// |   // Same moveset as the wolf's to begin with (a charge-and-gore of its own is a later row); profile NUMBERS only, tuned to the Goblin's rates (scripts/wolf-tune.mjs boar).
// |   boar: { scale: .8, health: 140, poise: 4, regen: 1, speed: 1.2, profiles: {
// |     easy: { reaction: 18, accuracy: .55, parry: 0, dodge: .1, aggression: .75, pressure: .65, discipline: 25, lapse: .4, feint: 0, guard: 0, disengage: 0, circle: .15, step: .3, interrupt: .2, kick: 0, dash: .8, read: .3 },
// |     normal: { reaction: 11, accuracy: .55, parry: 0, dodge: .15, aggression: .9, pressure: .7, discipline: 20, lapse: .3, feint: 0, guard: 0, disengage: 0, circle: .2, step: .4, interrupt: .4, kick: 0, dash: 1, read: .4, stab: .5 },
// |     hard: { reaction: 8, accuracy: .92, parry: 0, dodge: .2, aggression: 1, pressure: .75, discipline: 15, lapse: .08, feint: 0, guard: 0, disengage: 0, circle: .25, step: .4, interrupt: .6, kick: 0, dash: 1, read: .55, stab: .8 },
// |   } },
// |   // The Cinder Bear (Combat, 2026-10-08, Dom: bears after the boar): the boar's pattern on Characters' bear export (src/assets/bear.glb, #1781): the same seven-clip quadruped, the `bite` weapon, the wolf's capsule .8
// |   // and jaw bake. The heavy of the beasts: 220 health, poise 10, the slowest body (speed .95), a hard hitter that rushes and keeps coming (no hop-out, almost no circling), reading late (reaction 14 normal).
// |   // Wolf moveset to begin with (a maul of its own is a later row); profile NUMBERS only, tuned to the Goblin's rates (FOE=bear node scripts/wolf-tune.mjs).
// |   bear: { scale: .8, health: 220, poise: 10, regen: .8, speed: .95, profiles: {
// |     easy: { reaction: 22, accuracy: .55, parry: 0, dodge: 0, aggression: .65, pressure: .6, discipline: 28, lapse: .4, feint: 0, guard: 0, disengage: 0, circle: .05, step: .1, interrupt: .1, kick: 0, dash: .6, read: .25 },
// |     normal: { reaction: 14, accuracy: .6, parry: 0, dodge: .05, aggression: .8, pressure: .7, discipline: 22, lapse: .3, feint: 0, guard: 0, disengage: 0, circle: .1, step: .15, interrupt: .25, kick: 0, dash: .9, read: .35, stab: .4 },
// |     hard: { reaction: 10, accuracy: .9, parry: 0, dodge: .1, aggression: .95, pressure: .75, discipline: 16, lapse: .08, feint: 0, guard: 0, disengage: 0, circle: .15, step: .2, interrupt: .45, kick: 0, dash: 1, read: .5, stab: .7 },
// |   } },
// |   // The Executioner (opponent 6): 1.36 — 20 % over the Pitborn's 1.13 (owner, 2026-09-17), a big man's
// |   // health and poise. His arc is the scythe's (reap 1.40–2.10 m, a dead band inside 1.4 m, the shaft guard). He carries the
// |   // Veteran's brain (PROFILES); a profile of his own is the combat lane's call. Normal is his own since 2026-09-23 (Lead's anticipate
// |   // spec): a cut-spammer farmed him (light spam 18/24 with the cleaver, 12 warhammer, 11 trident; cap 12) because his 14-tick reaction
// |   // was clamped to the shared 8 on a read spam and still met the cut late. anticipate 3 + lapse .3 → .2 take those three to 8, 7, 7;
// |   // read .7 → .75 keeps the knife's thrust-from-range row where it was (11/24; .2 lapse alone put it on the cap at 12).
// |   // The value lives here, keyed by (opponent, level), because that is all a fight record carries: src/fight/replay.ts rebuilds the profile
// |   // from OPPONENTS[opponent].profiles[level], so a value merged in from outside the sim would replay a different fight.
// |   executioner: { scale: 1.36, health: 160, poise: 12, profiles: { easy: PROFILES.easy, normal: { ...PROFILES.normal, anticipate: 3, lapse: .2, read: .75 }, hard: PROFILES.hard } },
// |   // The Knight (armoured, methodical; his own row, RV30, 2026-10-07, Strategy's identity line): the Executioner's archetype and cut-spam
// |   // answer (anticipate 3, lapse .2, read .75: the same reasons) with a slower eye on cuts (reaction 16 at normal, tellReaction 10 on a thrust) and a steadier hand (aggression
// |   // .7 / .8), a heavy-first hard tier (pressure .3 against the shared .5). Poise 12 and the iron-rush special are his identity already.
// |   // AI profile only: no move timing changes.
// |   knight: { scale: 1.18, health: 160, poise: 12, profiles: {
// |     easy: PROFILES.easy,
// |     normal: { ...PROFILES.normal, reaction: 16, tellReaction: 10, aggression: .7, anticipate: 3, lapse: .2, read: .75 },   // tellReaction 10: at reaction 16 alone the estoc / gladius 'thrust from range' won 21 / 16 of 24 (cap 12); a slow eye on cuts, a quick one on the point
// |     hard: { ...PROFILES.hard, aggression: .8, pressure: .3, anticipate: 3 },
// |   } },
// | }
// A tier's keys keep the order the literal wrote them in (a record or digest that hashes the JSON must not see a different order).
const ordered = (o: Record<string, number>, order?: string[]): Record<string, number> => (order ? Object.fromEntries(order.map((k) => [k, o[k]!])) : o);
export function buildArchetypes(profiles: Record<string, object>, rulesHealth: number): Record<string, unknown> {
  const tier = (spec: TierSpec): Record<string, number> => ordered({ ...(spec.from ? profiles[spec.from] : {}), ...spec.set, ...(spec.identity ? ARCHETYPE_IDENTITIES.get(spec.identity) : {}) }, spec.order);
  return Object.fromEntries((ARCHETYPE_TABLE.rows as unknown as ArchetypeRow[]).map((row) => [row.id, Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => [k,
    k === 'health' ? (v === 'rules' ? rulesHealth : v) : k === 'profiles' ? Object.fromEntries(Object.entries(row.profiles).map(([t, spec]) => [t, tier(spec)])) : v]))]));
}
