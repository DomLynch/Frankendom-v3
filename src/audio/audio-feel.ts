// The arena crowd's, the opening bell's and the gate's numbers as rows (audio-feel-defs.json), through the shared loader (src/core/registry.ts): a duplicate id or a missing or mistyped field is refused at load.
// Every value equals the literal it replaced (test/audio-data-rows.test.mjs pins the behaviour). Presentation only: no sim file reads this, so it is not part of the world digest.
import { loadRegistry, tableFromFile } from '../core/registry.ts';
import { ARENA_MANIFEST, type ArenaCue } from './arena-manifest.ts';
import DEFS from './audio-feel-defs.json' with { type: 'json' };
import MANIFEST from './audio-feel-defs.manifest.json' with { type: 'json' };

export type ArenaCueRow = { readonly id: ArenaCue; readonly fade: number; readonly scaled: boolean; readonly jitter: boolean; readonly fallback: boolean };
export type BellPartial = { readonly id: string; readonly hz: number; readonly gain: number; readonly decay: number; readonly phase: number };
type FeelRow = { readonly id: string; readonly value: number; readonly unit: string };

const NAMED = [
  'wallGain', 'wallReleaseStop', 'wallSwapWindow', 'wallSwapRelease', 'wallRamp', 'stopPad', 'maxVoices', 'rateBase', 'rateSpread', 'matchSeedXor', 'reactionFirstDelay', 'bellGain',
  'accentFirstMin', 'accentFirstSpread', 'bedGain', 'bedOverlap', 'bedRetry', 'gruntGain', 'gruntDelay', 'gruntCooldown', 'reactionGain', 'reactionDelay', 'reactionCooldown',
  'reactionSpread', 'accentAfterReaction', 'jeerQuietAfter', 'jeerGain', 'chantGain', 'accentCooldown', 'accentSpread', 'accentReactionGap',
  'bellVibratoRate', 'bellVibratoDepth', 'bellVibratoFrom', 'bellVibratoUntilExtra', 'bellVibratoFade', 'bellStrikeLift', 'bellStrikeSeconds', 'bellStrikeThud', 'bellStrikeThump', 'bellStrikeDrive',
  'bellTaperLoss', 'bellBloomDepth', 'bellLiftDecay', 'bellDriveDecay', 'bellRingDecayK', 'bellRingDecayScale', 'bellThudSeed', 'bellThudSeconds', 'bellThudLoHz', 'bellThudHiHz', 'bellThudAttack',
  'bellThudDecay', 'bellDecayLn1000', 'bellThumpSeconds', 'bellThumpHz', 'bellThumpSag', 'bellThumpSagTau', 'bellThumpDecay', 'bellFadeIn', 'bellFadeOut', 'bellPeakCap', 'bellRmsCap', 'bellIdleTimeout',
] as const;
export type FeelId = (typeof NAMED)[number];

/** The one loader: the tables go through the registry; every rule the audio reads by name must exist, every arena cue of the manifest needs its row, every pattern must compile. */
export function loadAudioFeel(raw: typeof DEFS) {
  loadRegistry(MANIFEST.tables.map((t) => tableFromFile(t, raw, 'audio-feel-defs.json')));
  const feel = raw.feel as readonly FeelRow[];
  for (const must of NAMED) if (!feel.some((r) => r.id === must)) throw Error(`audio-feel-defs.json: the audio reads the "${must}" row by name, so it needs one`);
  for (const r of feel) if (!NAMED.includes(r.id as FeelId)) throw Error(`audio-feel-defs.json: row "${r.id}" is read by nothing`);
  const cues = {} as Record<ArenaCue, ArenaCueRow>;
  for (const r of raw.arenaCues as readonly ArenaCueRow[]) cues[r.id] = r;
  for (const name of Object.keys(ARENA_MANIFEST)) if (!(name in cues)) throw Error(`audio-feel-defs.json: arena cue "${name}" needs an arenaCues row`);
  const patterns: Record<string, RegExp> = {};
  for (const p of raw.patterns) patterns[p.id] = new RegExp(p.pattern);
  for (const must of ['exciting', 'heavyRoar']) if (!patterns[must]) throw Error(`audio-feel-defs.json: the crowd reads the "${must}" pattern by name, so it needs a row`);
  return { feel, cues, patterns, partials: raw.bellPartials as readonly BellPartial[] };
}
const LOADED = loadAudioFeel(DEFS);
export const feel = (id: FeelId): number => LOADED.feel.find((r) => r.id === id)!.value;
export const ARENA_CUES: Readonly<Record<ArenaCue, ArenaCueRow>> = LOADED.cues;
export const BELL_PARTIALS: readonly BellPartial[] = LOADED.partials;
export const CROWD_PATTERNS: Readonly<Record<string, RegExp>> = LOADED.patterns;
