// The hero's rig file (src/assets/warrior.glb), as the engine hands it out: a client loads the player's body through loadWarriors(HERO_BODY_URL),
// never by importing the .glb itself (K7: a zone reaches the engine only through src/fight/index.ts). `new URL(.., import.meta.url)` is the form both Vite (a
// hashed asset url) and the node test runner (a file url) resolve; a `?url` import would break every test that loads the fight index.
export const HERO_BODY_URL: string = new URL('../assets/warrior.glb', import.meta.url).href;
