// The hero's rig file (src/assets/warrior.glb), as the engine hands it out: a client loads the player's body through loadWarriors(HERO_BODY_URL),
// never by importing the .glb itself (K7: a zone reaches the engine only through src/fight/index.ts).
export { default as HERO_BODY_URL } from '../assets/warrior.glb?url';
