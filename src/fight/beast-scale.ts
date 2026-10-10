// How big the Ash Wolf is DRAWN, as a multiple of its rig (src/assets/wolf.glb is 0.644 m at native scale; Dom 2026-10-07: "very small", then "same size walking and fighting").
// ONE number for both paths: the world's mob look (origins/preview/mob-looks.ts) and the duel's opponent rig (src/characters.ts), so a wolf met walking is the wolf fought (tests/characters.test.ts, "the Ash Wolf is drawn the same size").
// Render only, deliberately outside SIM_FILES: the sim's capsule (OPPONENTS.wolf.scale .8, ~1.4 m of hit body), the bite reach and the baked jaw path are unchanged, no record or fingerprint moves.
// The rig at x2 stands ~1.29 m, which is what that capsule was sized for; at native size the bites reached over a 0.64 m body.
export const WOLF_RENDER_SCALE = 2;
// The other beasts (Characters' proposal, 2026-10-08, from the native heights wolf 0.644 m / boar 0.634 m / bear 0.635 m; a starting point until Dom's eye has seen 375-wide stills at the lock camera, then
// the constants move HERE and nowhere else): the boar low and broad (~1.14 m tall), the bear the biggest beast (~1.40 m), both under the 1.84 m hero. The world body of each (public/world/<id>.glb) is the same rig at
// the same native height, so its mob look must use the same constant (a test pins it per body that has a look).
export const BOAR_RENDER_SCALE = 1.8;
export const BEAR_RENDER_SCALE = 2.2;
// By roster id: what the duel draws a beast at. Absent = not a beast, drawn as built (1).
export const BEAST_RENDER_SCALE: Readonly<Record<string, number>> = { wolf: WOLF_RENDER_SCALE, boar: BOAR_RENDER_SCALE, bear: BEAR_RENDER_SCALE };
export const beastRenderScale = (opponentId: string): number => BEAST_RENDER_SCALE[opponentId] ?? 1;
// The beasts whose duel body is NOT in the src/assets glob (it would ride every player's download and TOTAL) but a file under public/beasts/, fetched on demand by URL (Lead's ruling 2026-10-08, the carrierUrls pattern):
// when the creature is near (World's preload warms the browser cache with this same URL) or the duel starts. The wolf stays in src/assets: it shipped that way. scripts/check-budget.mjs gives the folder its own line.
export const ON_DEMAND_BEASTS: ReadonlySet<string> = new Set(['boar', 'bear']);
// Absolute from the site root (like '/world/<kind>.glb' and '/looks/...'): the main page and the Origins preview (/preview/origins/, publicDir off) both read the game's deployed public/beasts.
export const beastBodyUrl = (opponentId: string): string => `/beasts/${opponentId}.glb`;
