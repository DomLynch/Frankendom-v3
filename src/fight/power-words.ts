// Power words (Strategy brief #1507 item 3; Dom "especially loved" it): a short invented word the Witch and the Plague Doctor speak as their special winds up, an audio
// telegraph. The words are original (no scripture, no real-language prayer): 2-3 syllables each, made from sounds, picked per cast. MUTED like the other voices (Dom
// 2026-10-06: he will choose the voices by hand near beta): POWER_WORD_GAIN is 0, no voice file exists, and main.ts only announces the word on a `frankendom:powerword`
// event (detail: { word, actor, tick, gain }), so a later voice pick is a one-file swap. Presentation only: never read by the sim, never recorded.
export const POWER_WORD_GAIN = 0;
export const POWER_WORDS = {
  witch: ['Ashvael', 'Ixoreth', 'Melusaar'],
  plaguedoctor: ['Vuskarn', 'Orzhul', 'Thaniveck'],
} as const satisfies Record<string, readonly string[]>;
export type PowerWordCaster = keyof typeof POWER_WORDS;
// The word for this cast: the caster's list indexed by the cast tick, so a replay or a second cast of the same tick says the same word.
export const powerWordFor = (opponent: string, castTick: number): string | undefined => {
  const words = (POWER_WORDS as Record<string, readonly string[]>)[opponent];
  return words ? words[Math.abs(Math.trunc(castTick)) % words.length] : undefined;
};
// ?look=powerwords (audio/power-word.ts): the whispered-chant look test Dom is to hear; absent = muted as above.
export const powerWordsLook = (search: string): boolean => /[?&]look=powerwords(?=&|$)/i.test(search);
// Announce the word of this cast (main.ts, at the wind-up): a window event, nothing audible while POWER_WORD_GAIN is 0.
export const announcePowerWord = (opponent: string, tick: number, target: Pick<EventTarget, 'dispatchEvent'> | undefined = typeof window === 'undefined' ? undefined : window): void => {
  const word = powerWordFor(opponent, tick);
  if (word && target) target.dispatchEvent(new CustomEvent('frankendom:powerword', { detail: { word, actor: 1, tick, gain: POWER_WORD_GAIN, opponent } }));
};
