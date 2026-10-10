// Independent admin test selections; neither changes fighter identity or the saved kit.
import { LEVELS, LEVEL_ANCHORS, PLAYER_WEAPONS, type SkillId, type WeaponId } from './moves.ts';
import { SPECIAL_TESTS, specialParam, type SpecialTest } from './special-look.ts';
import { SPARRING_SKILLS, sparringAsked, sparringParam, type SparringKit, type SparringLevel } from '../sparring.ts';
import { isOpponentId } from '../roster.ts';
import { SUPPORTED_PLAYER_SPECIALS, validateSparringSpecialSelection, type SparringSpecialSelection } from './sparring-special-runtime.ts';

export const SPECIAL_LABELS = {
  setfoot: 'Set Foot', heelreap: 'Heel Reap', lunge: 'Pale Lunge', knuckledirt: 'Knuckle Dirt', cleaverset: 'Cleaver Set', groundset: 'Ground Set', cutmark: 'Cut Mark',
  wake: 'Stone Wake', stirring: 'Stirring', tempo: "Doctor's Tempo", pulse: 'Taking the Pulse', drag: 'Ground Drag', swing: 'Held Swing',
  cuts: 'Seven Cuts', standfast: 'Stand Fast', ratrun: 'Rat Run', blackfurrow: 'Black Furrow',
  earthfold: 'Earth Fold', ironsettle: 'Iron Settle', gatherededge: 'Gathered Edge',
  shield: 'Shield Quake', centurion: 'The Charge', tithe: 'Blood Tithe',
  set: 'Red Wind', hades: "Hades' Shadow", nyx: 'Nyx Nightfall',
  mist: 'Avalon Mist', echo: 'Foretold Step', price: 'The Price', flies: 'Plague Flies', stain: 'Poison Stain', breath: 'Last Breath',
  reynard: 'Dirty Fistful', hermes: 'Gone', loki: 'Three Liars', arawn: 'Baying Circle', thanatos: 'Long Shadow', reaper: 'Harvest Sweep',
  dwarf8: 'The Word', dwarf9: 'Three Blows', dwarf10: 'Rim Shake', shield8: 'Bared Face', shield9: 'The Ring', shield10: 'Aegis Sweep',
  sling: 'The Sling', haze: 'Wrath', storm: 'Storm Follows Him', antaeus: 'Cracking Ground', surtr: 'Ash Fall', typhon: 'Wind Wall',
} as const satisfies Record<SpecialTest, string>;
export const SPECIAL_BANDS = ['L1–3', 'L4–7', 'L8', 'L9', 'L10'] as const;
export function specialBand(level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > LEVELS) return null;
  return level < 16 ? 0 : level < 36 ? 1 : level < 41 ? 2 : level < 46 ? 3 : 4;
}
export function sparringSpecialOptions(opponent: string): { band: string; ids: SpecialTest[]; unavailable: string }[] {
  return SPECIAL_BANDS.map((band, i) => ({ band,
    ids: (Object.keys(SPECIAL_TESTS) as SpecialTest[]).filter(id => SPECIAL_TESTS[id].opponent === opponent && specialBand(SPECIAL_TESTS[id].level) === i),
    unavailable: 'Unavailable · no registered preview',
  }));
}
export function defaultSparringSpecial(opponent: string, difficulty: SparringLevel): SpecialTest | null {
  const level = typeof difficulty === 'number' ? difficulty : difficulty === 'dummy' ? NaN : LEVEL_ANCHORS[difficulty];
  const band = specialBand(level);
  return band === null ? null : sparringSpecialOptions(opponent)[band].ids[0] ?? null;
}
export type PlayerSparringChoice = { skill: SkillId | null; special: SpecialTest | null };
export function playerSparringChoice(value: string): PlayerSparringChoice | null {
  if (value === 'none') return { skill: null, special: null };
  if (SPARRING_SKILLS.includes(value as SkillId)) return { skill: value as SkillId, special: null };
  const id = value.startsWith('special:') ? value.slice(8) : '';
  return SUPPORTED_PLAYER_SPECIALS.includes(id as SpecialTest) ? { skill: null, special: id as SpecialTest } : null;
}
type SparringPreview = { special: SpecialTest | null; kit: SparringKit | null; invalid: boolean; off: boolean; yourSpecial: SpecialTest | null; selection?: SparringSpecialSelection };
// Both entry consumers use this resolver. Omitted new selection preserves every legacy link.
export function resolveSparringPreview(search: string, carried: readonly WeaponId[] = PLAYER_WEAPONS): SparringPreview {
  const params = new URLSearchParams(search);
  const refused: SparringPreview = { special: null, kit: null, invalid: true, off: false, yourSpecial: null };
  if (!sparringAsked(search)) return params.has('yourSpecial') ? refused : { special: specialParam(search), kit: null, invalid: false, off: false, yourSpecial: null };
  const kit = sparringParam(search, carried), raw = params.get('special')?.toLowerCase();
  let special: SpecialTest | null = null, off = false;
  if (params.has('special')) {
    if (params.getAll('special').length !== 1 || !kit || !isOpponentId(params.get('opponent') ?? '')) return refused;
    if (raw === 'none') off = true;
    else if (Object.hasOwn(SPECIAL_TESTS, raw ?? '') && kit.difficulty !== 'dummy' && params.get('opponent') === SPECIAL_TESTS[raw as SpecialTest].opponent) special = raw as SpecialTest;
    else return refused;
  }
  if (!params.has('yourSpecial')) return { special, kit, invalid: false, off, yourSpecial: null };
  if (!kit || !isOpponentId(params.get('opponent') ?? '') || ['spar', 'opponent', 'weapon', 'difficulty', 'skill', 'yourSpecial'].some(key => params.getAll(key).length !== 1)) return refused;
  const yourRaw = params.get('yourSpecial')?.toLowerCase() ?? '';
  const yourSpecial = yourRaw === 'none' ? null : SUPPORTED_PLAYER_SPECIALS.includes(yourRaw as SpecialTest) ? yourRaw as SpecialTest : undefined;
  if (yourSpecial === undefined) return refused;
  const selection: SparringSpecialSelection = { player: yourSpecial, ...(params.has('special') ? { opponent: special } : {}) };
  try { validateSparringSpecialSelection(kit, selection); } catch { return refused; }
  return { special, kit, invalid: false, off, yourSpecial, selection };
}
