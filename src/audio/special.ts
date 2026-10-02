// Cues for the boss specials (scripts/build-special-audio.mjs). Centurion: the charge's hooves, the quake's sand thud, the tithe's crowd swell.
// Nightborn: Set's red wind, Hades' shadow, Nyx's nightfall. Goblin: fistful, gone, liars. Pitborn: cracking, ashfall, windwall; they start with the cast and their payoff sits on the strike (1.983 s).
// Executioner: baying, longshadow, harvest. Dwarf: theword, threeblows, rimshake. Shieldmaiden: baredface, thering, aegis. Witch: avalon, foretold, theprice.
// Plague Doctor: plagueflies, poisonstain, lastbreath. Knight: thesling, wrath, storm. Same clock: cast at 0, payoff on the strike.
// Each is its own small file because the sprite and the arena bank have no headroom. They play through the gate's player: same fade-out on a skipped beat.
import { fetchAsset, nextTask, pageUnloading, spriteFormats, type Format } from './sprite.ts';
import { playGate } from './gate.ts';
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
const URLS: Record<SpecialCue, Record<Format, string>> = {
  charge: { opus: new URL('../assets/special-audio/charge.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/charge.m4a', import.meta.url).href },
  quake: { opus: new URL('../assets/special-audio/quake.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/quake.m4a', import.meta.url).href },
  tithe: { opus: new URL('../assets/special-audio/tithe.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/tithe.m4a', import.meta.url).href },
  redwind: { opus: new URL('../assets/special-audio/redwind.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/redwind.m4a', import.meta.url).href },
  hades: { opus: new URL('../assets/special-audio/hades.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/hades.m4a', import.meta.url).href },
  nyx: { opus: new URL('../assets/special-audio/nyx.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/nyx.m4a', import.meta.url).href },
  fistful: { opus: new URL('../assets/special-audio/fistful.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/fistful.m4a', import.meta.url).href },
  gone: { opus: new URL('../assets/special-audio/gone.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/gone.m4a', import.meta.url).href },
  liars: { opus: new URL('../assets/special-audio/liars.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/liars.m4a', import.meta.url).href },
  cracking: { opus: new URL('../assets/special-audio/cracking.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/cracking.m4a', import.meta.url).href },
  ashfall: { opus: new URL('../assets/special-audio/ashfall.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/ashfall.m4a', import.meta.url).href },
  windwall: { opus: new URL('../assets/special-audio/windwall.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/windwall.m4a', import.meta.url).href },
  baying: { opus: new URL('../assets/special-audio/baying.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/baying.m4a', import.meta.url).href },
  longshadow: { opus: new URL('../assets/special-audio/longshadow.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/longshadow.m4a', import.meta.url).href },
  harvest: { opus: new URL('../assets/special-audio/harvest.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/harvest.m4a', import.meta.url).href },
  theword: { opus: new URL('../assets/special-audio/theword.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/theword.m4a', import.meta.url).href },
  threeblows: { opus: new URL('../assets/special-audio/threeblows.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/threeblows.m4a', import.meta.url).href },
  rimshake: { opus: new URL('../assets/special-audio/rimshake.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/rimshake.m4a', import.meta.url).href },
  baredface: { opus: new URL('../assets/special-audio/baredface.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/baredface.m4a', import.meta.url).href },
  thering: { opus: new URL('../assets/special-audio/thering.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/thering.m4a', import.meta.url).href },
  aegis: { opus: new URL('../assets/special-audio/aegis.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/aegis.m4a', import.meta.url).href },
  avalon: { opus: new URL('../assets/special-audio/avalon.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/avalon.m4a', import.meta.url).href },
  foretold: { opus: new URL('../assets/special-audio/foretold.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/foretold.m4a', import.meta.url).href },
  theprice: { opus: new URL('../assets/special-audio/theprice.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/theprice.m4a', import.meta.url).href },
  plagueflies: { opus: new URL('../assets/special-audio/plagueflies.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/plagueflies.m4a', import.meta.url).href },
  poisonstain: { opus: new URL('../assets/special-audio/poisonstain.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/poisonstain.m4a', import.meta.url).href },
  lastbreath: { opus: new URL('../assets/special-audio/lastbreath.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/lastbreath.m4a', import.meta.url).href },
  thesling: { opus: new URL('../assets/special-audio/thesling.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/thesling.m4a', import.meta.url).href },
  wrath: { opus: new URL('../assets/special-audio/wrath.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/wrath.m4a', import.meta.url).href },
  storm: { opus: new URL('../assets/special-audio/storm.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/storm.m4a', import.meta.url).href },
  cuts: { opus: new URL('../assets/special-audio/cuts.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/cuts.m4a', import.meta.url).href },
  wake: { opus: new URL('../assets/special-audio/wake.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/wake.m4a', import.meta.url).href },
  stirring: { opus: new URL('../assets/special-audio/stirring.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/stirring.m4a', import.meta.url).href },
  tempo: { opus: new URL('../assets/special-audio/tempo.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/tempo.m4a', import.meta.url).href },
  pulse: { opus: new URL('../assets/special-audio/pulse.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/pulse.m4a', import.meta.url).href },
  drag: { opus: new URL('../assets/special-audio/drag.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/drag.m4a', import.meta.url).href },
  swing: { opus: new URL('../assets/special-audio/swing.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/swing.m4a', import.meta.url).href },
};
// Fetch and decode the first format that works; null when none does (or the page is leaving), and the special plays in silence.
export async function loadSpecial(cue: SpecialCue, context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  for (const [attempt, format] of formats.entries()) {
    if (attempt) await nextTask();
    if (leaving()) break;   // never start the other codec while the page unloads (see sprite.ts)
    try { const response = await fetcher(URLS[cue][format]); if (response.ok) return await context.decodeAudioData(await response.arrayBuffer()); }
    catch { /* try the other codec, then leave the special silent */ }
  }
  return null;
}
// playSpecial(context, buffer, destination, gain = 1, delay = 0) → { duration, stop() }; the buffer's own length is the beat.
export const playSpecial = playGate;
