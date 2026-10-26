// One bout's roll seed (World, sheet-in-world PR 3): a pure integer hash of the creature's engage token and the step it joined at. The page derives it at the join, the world record carries it per join,
// the replay re-derives each bout's damage roll from it (open-fight.ts openBout -> duel.ts withRoll), and the server accepts it only when it equals hash32(the kill's own engage token, the join step).
// FNV-1a over the token's UTF-16 units, then the step folded in and a murmur3-style finalizer. Integers only (Math.imul, >>> 0): the same number on every engine. A leaf outside the Pit sim files.
export function hash32(token: string, tick: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= tick | 0; h = Math.imul(h, 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
