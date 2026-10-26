// Hero preview flag (Hero Look, Lead 2026-09-27, route B): `?hero=/herolook/<name>.glb` stands a fitted set in for the player's rig, so Dom
// can see it live before anyone swaps warrior.glb. Only a same-origin file directly under /herolook/ ending in .glb is accepted; anything
// else (a full URL, another path, `..`, an encoded slash) is ignored without a word and the page boots today's hero.
const PREVIEW = /^\/herolook\/[A-Za-z0-9_-]+\.glb$/;
export function heroPreview(search: string): string | undefined {
  const value = new URLSearchParams(search).get('hero');
  return value && PREVIEW.test(value) ? value : undefined;
}
