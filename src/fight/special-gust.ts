// The wind a special blows through the arena (Pitborn's Wind Wall, special-fx-pitborn.ts), 0..1: the effect writes it, arena.ts reads it to snap the banner cloths.
// A shared cell rather than a call from scene.ts, which names no special (special-modes.ts is the registry). Presentation only; 0 leaves the banners exactly as before.
export const specialGust = { k: 0 };
