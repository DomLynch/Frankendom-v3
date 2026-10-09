// Cues for the boss specials (scripts/build-special-audio.mjs). Centurion: the charge's hooves, the quake's sand thud, the tithe's crowd swell.
// Nightborn: Set's red wind, Hades' shadow, Nyx's nightfall. Goblin: fistful, gone, liars. Pitborn: cracking, ashfall, windwall; they start with the cast and their payoff sits on the strike (1.983 s).
// Executioner: baying, longshadow, harvest. Dwarf: theword, threeblows, rimshake. Shieldmaiden: baredface, thering, aegis. Witch: avalon, foretold, theprice.
// Plague Doctor: plagueflies, poisonstain, lastbreath. Knight: thesling, wrath, storm. Same clock: cast at 0, payoff on the strike.
// Each is its own small file because the sprite and the arena bank have no headroom. They play through the gate's player: same fade-out on a skipped beat.
import { fetchAsset, loadFirst, pageUnloading, spriteFormats, type Format } from '../../audio/sprite.ts';
import { playGate } from '../../audio/gate.ts';
export const SPECIAL_CUES = ['charge', 'quake', 'tithe', 'redwind', 'hades', 'nyx', 'fistful', 'gone', 'liars', 'cracking', 'ashfall', 'windwall', 'baying', 'longshadow', 'harvest', 'theword', 'threeblows', 'rimshake', 'baredface', 'thering', 'aegis', 'avalon', 'foretold', 'theprice', 'plagueflies', 'poisonstain', 'lastbreath', 'thesling', 'wrath', 'storm', 'cuts', 'wake', 'stirring', 'tempo', 'pulse', 'drag', 'swing'] as const;
export type SpecialCue = typeof SPECIAL_CUES[number];
// The cue each `?special=<id>` preview plays (special-look.ts SPECIAL_TESTS / special-modes.ts SPECIAL_MODES): one line per move, so a lane's registry entry is not touched. A fight is never told.
export const SPECIAL_CUE_OF: Readonly<Record<string, SpecialCue>> = {
  shield: 'quake', centurion: 'charge', tithe: 'tithe',
  set: 'redwind', hades: 'hades', nyx: 'nyx',
  reynard: 'fistful', hermes: 'gone', loki: 'liars',
  antaeus: 'cracking', surtr: 'ashfall', typhon: 'windwall',
  arawn: 'baying', thanatos: 'longshadow', reaper: 'harvest',
  dwarf8: 'theword', dwarf9: 'threeblows', dwarf10: 'rimshake',
  shield8: 'baredface', shield9: 'thering', shield10: 'aegis',
  mist: 'avalon', echo: 'foretold', price: 'theprice',
  flies: 'plagueflies', stain: 'poisonstain', breath: 'lastbreath',
  sling: 'thesling', haze: 'wrath', storm: 'storm',
  cuts: 'cuts', wake: 'wake', stirring: 'stirring', tempo: 'tempo', pulse: 'pulse', drag: 'drag', swing: 'swing',
};
// One file pair per cue, named for it (src/assets/special-audio/<cue>.ogg|.m4a): built from SPECIAL_CUES as duel.ts builds its map (Vite resolves the static-prefix template).
const URLS = Object.fromEntries(SPECIAL_CUES.map((cue) => [cue, { opus: new URL(`../assets/special-audio/${cue}.ogg`, import.meta.url).href, aac: new URL(`../assets/special-audio/${cue}.m4a`, import.meta.url).href }])) as Record<SpecialCue, Record<Format, string>>;
// Fetch and decode the first format that works; null when none does (or the page is leaving), and the special plays in silence.
export async function loadSpecial(cue: SpecialCue, context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  return loadFirst(URLS[cue], context, formats, fetcher, leaving);
}
// playSpecial(context, buffer, destination, gain = 1, delay = 0) → { duration, stop() }; the buffer's own length is the beat.
export const playSpecial = playGate;
