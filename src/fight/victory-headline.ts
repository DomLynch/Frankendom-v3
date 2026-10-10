// LOOK TEST behind `?look=headline` (default OFF; Strategy research #49, owner queue item 1): one earned line on the win, read from the fight's own event log.
// Presentation only: no sim, record or reward change, no badge, no rank, no damage bonus. Pure: no DOM. The player is side 0; a Hit/GuardBroken names its attacker
// as `actor`, a Blocked/Parried names the defender as `actor`, a PostureBroken names the broken fighter as `target` (src/fight/duel.ts).
// Numbers over adjectives; nothing earned means nothing said (the autopsy's rule, src/autopsy.ts). The first that holds wins:
import type { CombatEvent } from './duel.ts';

export const headlineFlag = (search: string) => (new URLSearchParams(search).get('look') ?? '').split(',').includes('headline');

const count = (log: CombatEvent[], pick: (e: CombatEvent) => boolean) => log.reduce((n, e) => n + (pick(e) ? 1 : 0), 0);

export function victoryHeadline(log: CombatEvent[], playerHealth: number): string | null {
  if (!count(log, e => (e.type === 'Hit' || e.type === 'GuardBroken') && e.target === 0)) return 'You never took a hit.';
  const parries = count(log, e => e.type === 'Parried' && e.actor === 0);
  if (parries >= 2) return `Won on ${parries} parries.`;
  const perfect = count(log, e => e.type === 'Blocked' && e.actor === 0 && !!e.perfect);
  if (perfect >= 2) return `Won on ${perfect} perfect blocks.`;
  const broke = count(log, e => e.type === 'PostureBroken' && e.target === 1);
  if (broke >= 2) return `You broke their posture ${broke} times.`;
  if (playerHealth > 0 && playerHealth <= 20) return `Won with ${Math.round(playerHealth)} HP left.`;
  return null;
}
