// The sound's numbers as data (World & Audio, Dom's data-layer day 2026-10-14): the mix levels, the bell, the gate cut, the sprite length, the breath ducking, the pitch spread and the feedback
// voice and seed numbers, one row each (id, value, unit), plus the creature throats and the power-word casters as two tables, through the shared loader (src/core/registry.ts). Every default
// equals the literal it replaced (tests/audio-rules.test.ts pins them). No sim file reads these, so this table is NOT part of the world digest. Pure; the page and the asset builder both read it.
import { loadRegistry, tableFromFile, type Manifest } from '../../core/registry.ts';
import DEFS from './audio-rules-defs.json' with { type: 'json' };
import MANIFEST from './audio-rules-defs.manifest.json' with { type: 'json' };

export type AudioRule = { readonly id: string; readonly value: number; readonly unit: string };
export type Throat = { f0: number; formants: [number, number]; rasp: number };   // f0 Hz at rest; two vowel formants; the noise share 0..1
export type Caster = { f0: number; breath: number; syllable: number };
export type GroundLootRow = { readonly id: string; readonly cue: string; readonly gain: number; readonly room: number; readonly rate: number };   // a ground-loot cue: which sprite cue, at what level and pitch (ground-loot.ts reads it once)
type Raw = { rules?: readonly unknown[]; throats?: readonly unknown[]; casters?: readonly unknown[]; groundLoot?: readonly unknown[] };
const NAMED = ['arenaLevel', 'bellSeconds', 'bellRate', 'bellDrive', 'bloomAbove', 'bloomSeconds', 'wardenHealth', 'gateCut', 'spriteSeconds', 'maxLayers', 'outputGain', 'breathAhead', 'breathDuck', 'breathDuckBack', 'breathRelease', 'pitchSpread', 'whipRaise', 'whipRateBase', 'whipGuardCap', 'whipGuardStep', 'baseSeed', 'mix', 'rise', 'riseFloor', 'cut', 'voices', 'powerWordLookGain'] as const;
/** The one loader: the three tables go through the registry (a duplicate id or a missing or mistyped field is refused), every rule the sound reads by name must exist, with a positive value. */
export function loadAudioRules(raw: Raw): { rules: readonly AudioRule[]; throats: Readonly<Record<string, Throat>>; casters: Readonly<Record<string, Caster>>; groundLoot: readonly GroundLootRow[] } {
  loadRegistry(MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, raw, 'audio-rules-defs.json')));
  const rows = (raw.rules ?? []) as readonly AudioRule[];
  for (const r of rows) if (!(Number.isFinite(r.value) && r.value > 0)) throw Error(`audio-rules "${r.id}": value is a number > 0`);
  for (const must of NAMED) if (!rows.some((r) => r.id === must)) throw Error(`audio-rules: the sound reads the "${must}" rule by name, so it needs a row`);
  const throats: Record<string, Throat> = {}, casters: Record<string, Caster> = {};
  for (const t of (raw.throats ?? []) as { id: string; f0: number; f1: number; f2: number; rasp: number }[]) throats[t.id] = { f0: t.f0, formants: [t.f1, t.f2], rasp: t.rasp };
  for (const c of (raw.casters ?? []) as { id: string; f0: number; breath: number; syllable: number }[]) casters[c.id] = { f0: c.f0, breath: c.breath, syllable: c.syllable };
  return { rules: rows, throats, casters, groundLoot: (raw.groundLoot ?? []) as readonly GroundLootRow[] };
}
const LOADED = loadAudioRules(DEFS);
export const AUDIO_RULES: readonly AudioRule[] = LOADED.rules;
export const THROAT_ROWS: Readonly<Record<string, Throat>> = LOADED.throats;
export const CASTER_ROWS: Readonly<Record<string, Caster>> = LOADED.casters;
export const GROUND_LOOT_ROWS: readonly GroundLootRow[] = LOADED.groundLoot;
export const audioRule = (id: (typeof NAMED)[number]): number => AUDIO_RULES.find((r) => r.id === id)!.value;
export const bloomRules = () => ({ above: audioRule('bloomAbove'), seconds: audioRule('bloomSeconds') });
