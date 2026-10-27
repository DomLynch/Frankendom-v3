// Art that waits for the first frame (V3 fast load, 2026-10-26, after #13's late kit): the blood textures (14 PNGs, 0.41 MB) were
// fetched at ~1.2 s, beside the bodies, and gated nothing they were needed for. Now the drip and wound textures (8, 0.21 MB) start
// once the scene has drawn its first frame. The floor's six (gore.ts, finisher-blood.ts) went back to the early fetch: late, slow 4G
// left the canvas star on the sand for seconds of the fight (PR #40's post-merge stills). Until they land every blood effect draws as it always has before its photo arrives (the canvas splat, untextured runs),
// and when they land the scene compiles the new map variants off the frame they first draw on.
// ?load=v1 (V1's order, as #13) or ?blood=v1: fetched while the scene is built, as before.
const search = typeof location === 'undefined' ? '' : location.search;
export const lateBlood = !/[?&](load|blood)=v1\b/.test(search);
let open: () => void = () => {}, compile: () => void = () => {};
const gate = new Promise<void>((resolve) => { open = resolve; });
// The loaders wait on this: the first frame under the default, nothing under ?load=v1 / ?blood=v1.
export function afterFirstFrame(): Promise<void> { return lateBlood ? gate : Promise.resolve(); }
// The scene calls this once its first frame is drawn (or the load gave up), with how to compile what arrives later.
export function firstFrameDrawn(recompile: () => void): void { compile = recompile; open(); }
// Late art that is not a texture (the ragdoll's hidden cut meshes, once built) asks for its programs the same way, without the blood mark.
export function compileLateArt(): void { compile(); }
// A late texture set went on its materials: compile their new programs now, not at the first blow that draws them.
export function lateArtLanded(): void { if (typeof performance !== 'undefined') performance.mark('blood-on'); if (lateBlood) compile(); }   // the load trace reads first-frame-* -> blood-on
