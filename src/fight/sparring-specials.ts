// Independent admin test selections; neither changes fighter identity or the saved kit.
import LABELS from './special-labels.json' with { type: 'json' };
import { PLAYER_WEAPONS, type WeaponId } from './moves.ts';
import { SPECIAL_TESTS, specialParam, type SpecialTest } from './special-look.ts';
import { sparringAsked, sparringParam, type SparringKit } from '../stubs.ts';   // V3: sparring.ts
import { isOpponentId } from '../roster.ts';
import { SUPPORTED_PLAYER_SPECIALS, validateSparringSpecialSelection, type SparringSpecialSelection } from './sparring-special-runtime.ts';

export const HAND_LABELS: Readonly<Record<string, string>> = Object.fromEntries((LABELS.rows as readonly { id: string; label: string }[]).map((r) => [r.id, r.label]));   // special-labels.json: the names of the specials that are not boss rows
// A boss's name is its bosses.json row's `label`; the rest are still hand-written (not rows yet).
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
