// The engine body file of a catalogue row, as a URL a page can fetch (K7 row 7, K11: a zone asks the engine for a body by roster id instead of importing
// src/assets/<id>.glb by name). The map holds the roster bodies the open world draws (goblin, knight, pitborn, witch: the same four files mobs-view bundled
// before, so no build ships a new file); every other fighter reaches a page through src/fight/scene.ts. The glob lives inside the call so node (tests) can load
// this module: Vite expands it at build time.
import { catalogueRow } from './catalogue-rows.ts';

/** URL of row `id`'s engine body (`row.engine.asset`), or undefined for an id with no row or a body this map does not ship. */
export function catalogueBodyUrl(id: string): string | undefined {
  const bodies = import.meta.glob<string>(['../assets/goblin.glb', '../assets/knight.glb', '../assets/pitborn.glb', '../assets/witch.glb'], { eager: true, query: '?url', import: 'default' });
  const asset = catalogueRow(id)?.engine.asset;
  return asset ? bodies[asset.replace(/^src\//, '../')] : undefined;
}

export function heroBodyUrl(): string {
  const bodies = import.meta.glob<string>('../assets/warrior.glb', { eager: true, query: '?url', import: 'default' });   // the hero's own body (K2 row 6): not a catalogue row
  return bodies['../assets/warrior.glb'];
}
