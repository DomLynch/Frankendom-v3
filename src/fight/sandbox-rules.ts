import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './sandbox-rules-defs.json' with { type: 'json' };
import MANIFEST from './sandbox-rules-defs.manifest.json' with { type: 'json' };

// The combat sandbox's rule rows, ported to trunk in slices (Lead's plan, 2026-10-18; Donor: the combat sandbox, sandbox/page @678a31f0d, read-only). Slice (c) declared the melee-special families; slice (e) (RV77) turns the
// windup / react rules on in duel.ts, so this is a sim file: no clock, no Math.random. Each family is a table through the registry (sandbox-rules-defs.manifest.json), one number per row.
const SANDBOX_TABLES = MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, DEFS, 'sandbox-rules-defs.json'));
loadRegistry(SANDBOX_TABLES);
const sandboxRows = (table: string): readonly Record<string, unknown>[] => SANDBOX_TABLES.find((t) => t.manifest.table === table)?.rows ?? [];
const sandboxRule = (id: string): number => (sandboxRows('sandboxRule').find((r) => r.id === id)?.value as number | undefined) ?? 0;

//   specialMeleeWindup (Dom 2026-10-17: "it takes like two seconds, it is not a long-distance spell, same speed as the stab, slash or heavy"): ticks a MELEE special (no spell) is committed before it lands; 0 = the special's own windup rule.
export const SPECIAL_MELEE_WINDUP = sandboxRule('specialMeleeWindup');
//   specialReact (Strategy 2026-10-17: the victim's stagger is a sim reaction from the move's row, not a canned animation): 1 = a landed melee special applies its move row's stagger, knockback and posture to the victim like a landed blow; 0 = damage only.
export const SPECIAL_REACT = sandboxRule('specialReact');
//   specialReactStagger / specialReactKnock / specialReactPosture (percent of the move row's own stagger, knockback and posture; 100 = as the row says): how hard a landed melee special hits the victim.
export const SPECIAL_REACT_STAGGER = sandboxRule('specialReactStagger'), SPECIAL_REACT_KNOCK = sandboxRule('specialReactKnock'), SPECIAL_REACT_POSTURE = sandboxRule('specialReactPosture');
//   specialReactFloor (Dom 2026-10-18: Lunge showed no reaction, its move row has stagger 0 so a percent of it is 0): rows { id (skill id), stagger (ticks) }, the least stagger a landed melee special of that skill gives, whatever its move row says. No row = the percent alone.
export const specialReactFloorOf = (skill: string): number => (sandboxRows('specialReactFloor').find((r) => r.id === skill)?.stagger as number | undefined) ?? 0;

//   specialPick (the SPECIAL 1/2 picker): rows { id (skill id), role, label?, slot2Default?, slot2Alt? }: which melee skills the picker offers and what SPECIAL 2 starts as. No rows = no picker.
export type SpecialPickRow = { id: string; role: string; label?: string; slot2Default?: number; slot2Alt?: number };
export const specialPickRows = (): readonly SpecialPickRow[] => sandboxRows('specialPick') as unknown as SpecialPickRow[];

//   specialLook (the beta specials must read as different moves on a phone): one row { id (skill id), flash, sparks, spread, lift, size } per skill, percent of the shared skill-impact kit (100 = as it is). Presentation only, no sim. No row = the kit as it is.
export type SpecialLookRow = { id: string; flash: number; sparks: number; spread: number; lift: number; size: number };
export const specialLookOf = (skill: string): SpecialLookRow | undefined => sandboxRows('specialLook').find((r) => r.id === skill) as SpecialLookRow | undefined;
//   specialTrail ("weapon trails"): one row { id (skill id), samples, opacity, color, lead, tail } per melee special: a longer, firmer trail from `lead` ticks before the release until `tail` ticks after. No row = the game's own trail.
export type SpecialTrailRow = { id: string; samples: number; opacity: number; color: string; lead: number; tail: number };
export const specialTrailOf = (skill: string): SpecialTrailRow | undefined => sandboxRows('specialTrail').find((r) => r.id === skill) as SpecialTrailRow | undefined;
//   specialShards (solid impact fragments): rows { id (row id), skill, kind stone|metal, count (<= 8 a burst on a phone), tint, per-mille power, forward, lift, size, life, gravity, bounce, slide, shrink }. No rows = nothing is built or drawn.
export type ShardRow = { id: string; skill: string; kind: string; count: number; tint: string; power: number; forward: number; lift: number; size: number; life: number; gravity: number; bounce: number; slide: number; shrink: number };
export const specialShardsOf = (skill: string): ShardRow[] => (sandboxRows('specialShards') as unknown as ShardRow[]).filter((r) => r.skill === skill);
export const shardRows = (): number => sandboxRows('specialShards').length;
//   specialSound (the hit must sound like bone and weight): rows { id (row id), skill, cue (a CueName), gain, room, delay, on? } played in order when that melee special lands; `on`: 'start' plays at the commit, 'land' (default) on the foe. No rows = no sound added.
export type SpecialSoundRow = { id: string; skill: string; cue: string; gain: number; room: number; delay: number; on?: 'start' | 'land' };
export const specialSoundOf = (skill: string): SpecialSoundRow[] => (sandboxRows('specialSound') as unknown as SpecialSoundRow[]).filter((r) => r.skill === skill);
