// Loot deck with pity as data (top-30 item 16). A deck row says how many cards (deckSize), how many of them drop (hits), when the odds start to climb (softPityFrom misses, +pityStep percentage points
// per miss past it), when a drop is guaranteed (hardPity misses) and which events reset it (resets rows). The state is per account and deck; the roll happens at spawn (rolledAt).
// Donor: AzerothCore's loot template (a chance and a group per entry) and ModernUO's LootPack (a percentage per entry) both draw each kill independently, and neither has bad-luck protection (checked LootMgr.cpp, LootPack.cs):
// the deck (draw without replacement) and the pity counter are ours, so a dry streak is bounded by data, never by luck.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DECK_DATA from './loot-deck.json' with { type: 'json' };
import MANIFEST from './loot-deck.manifest.json' with { type: 'json' };

export type LootDeckRow = { id: string; scope: string; rolledAt: string; deckSize: number; hits: number; softPityFrom: number; pityStep: number; hardPity: number; resets: readonly string[] };
export type LootDeckReset = { id: string; clearsPity: boolean; reshuffles: boolean; note: string };
export type DeckState = { left: number; hitsLeft: number; misses: number };

export const loadLootDecks = (data: unknown = DECK_DATA) => loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, data, 'loot-deck.json')));
loadLootDecks();
export const LOOT_DECKS: readonly LootDeckRow[] = DECK_DATA.decks;
export const LOOT_DECK_RESETS: readonly LootDeckReset[] = DECK_DATA.resets;
export const deckById = (id: string): LootDeckRow | null => LOOT_DECKS.find((d) => d.id === id) ?? null;
export const freshDeck = (deck: LootDeckRow): DeckState => ({ left: deck.deckSize, hitsLeft: deck.hits, misses: 0 });

// The chance the next card drops: the deck's own odds, plus the soft-pity climb, certain at the hard-pity streak.
export function dropChance(deck: LootDeckRow, state: DeckState): number {
  if (state.misses >= deck.hardPity) return 1;
  const base = state.left > 0 ? state.hitsLeft / state.left : 0;
  const climb = state.misses >= deck.softPityFrom ? ((state.misses - deck.softPityFrom + 1) * deck.pityStep) / 100 : 0;
  return Math.min(1, base + climb);
}

// One draw with `roll` in [0, 1): the new state and whether it dropped. The deck reshuffles when empty ('deck-empty'); a hit clears the streak ('drop') when the deck's resets say so.
export function drawCard(deck: LootDeckRow, state: DeckState, roll: number): { state: DeckState; dropped: boolean } {
  const dropped = roll < dropChance(deck, state);
  let next: DeckState = { left: state.left - 1, hitsLeft: dropped ? Math.max(0, state.hitsLeft - 1) : state.hitsLeft, misses: dropped ? state.misses : state.misses + 1 };
  if (dropped) next = applyReset(deck, next, 'drop');
  if (next.left <= 0) next = applyReset(deck, next, 'deck-empty');
  return { state: next, dropped };
}

// An event (a reset row's id) on a deck: it only acts if the deck lists it. Clears the streak and/or reshuffles as the reset row says.
export function applyReset(deck: LootDeckRow, state: DeckState, event: string, resets: readonly LootDeckReset[] = LOOT_DECK_RESETS): DeckState {
  const row = resets.find((r) => r.id === event);
  if (!row || !deck.resets.includes(event)) return state;
  const base = row.reshuffles ? freshDeck(deck) : state;
  return { ...base, misses: row.clearsPity ? 0 : state.misses };
}
