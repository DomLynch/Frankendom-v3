// The presence wire format (lifted unchanged from V1 origins/presence/wire.ts). Binary, little cost: one packet per client per tick, 11 bytes an entity.
// Positions are centimetres inside the frame (u16, so the frame is at most 655 m), heading a byte (0..255 round the compass), `anim` and `flags` a byte each.
// The layout is the protocol itself: the byte positions both sides agree on. An up packet is [type 0, x 1, z 3, heading 5, anim 6, flags 7]; an entity is
// [id 0, x 2, z 4, heading 6, anim 7, flags 8, tick 9] from its start in a down packet.
export const UP = 2;       // client -> server: [type u8, x u16, z u16, heading u8, anim u8, flags u8] = 8 bytes
export const DOWN = 1;     // server -> client: [type u8, tick u16, count u8] then `count` entities
export const UP_BYTES = 8;
export const ENTITY_BYTES = 11;   // id u16, x u16, z u16, heading u8, anim u8, flags u8, entity tick u16
export const HEAD_BYTES = 4;
export const MAX_ENTITIES = 255;   // the packet's count is one byte
const UP_Z = 3;
const ENTITY_X = 2, ENTITY_Z = 4, ENTITY_HEADING = 6, ENTITY_ANIM = 7, ENTITY_FLAGS = 8, ENTITY_TICK = 9;

export type Pose = { x: number; z: number; heading: number; anim: number; flags: number };
export type Entity = Pose & { id: number; tick: number };

export function encodeUp(p: Pose): Uint8Array {
  const b = new Uint8Array(UP_BYTES), v = new DataView(b.buffer);
  b[0] = UP; v.setUint16(1, p.x, true); v.setUint16(UP_Z, p.z, true); b[5] = p.heading; b[6] = p.anim; b[7] = p.flags;
  return b;
}
export function decodeUp(b: Uint8Array): Pose | null {
  if (b.length !== UP_BYTES || b[0] !== UP) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { x: v.getUint16(1, true), z: v.getUint16(UP_Z, true), heading: b[5], anim: b[6], flags: b[7] };
}

export function encodeDown(tick: number, entities: readonly Entity[]): Uint8Array {
  const n = Math.min(entities.length, MAX_ENTITIES), b = new Uint8Array(HEAD_BYTES + n * ENTITY_BYTES), v = new DataView(b.buffer);
  b[0] = DOWN; v.setUint16(1, tick & 0xffff, true); b[3] = n;
  for (let i = 0; i < n; i++) {
    const e = entities[i], at = HEAD_BYTES + i * ENTITY_BYTES;
    v.setUint16(at, e.id, true); v.setUint16(at + ENTITY_X, e.x, true); v.setUint16(at + ENTITY_Z, e.z, true);
    b[at + ENTITY_HEADING] = e.heading; b[at + ENTITY_ANIM] = e.anim; b[at + ENTITY_FLAGS] = e.flags; v.setUint16(at + ENTITY_TICK, e.tick & 0xffff, true);
  }
  return b;
}
export function decodeDown(b: Uint8Array): { tick: number; entities: Entity[] } | null {
  if (b.length < HEAD_BYTES || b[0] !== DOWN) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), n = b[3];
  if (b.length !== HEAD_BYTES + n * ENTITY_BYTES) return null;
  const entities: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const at = HEAD_BYTES + i * ENTITY_BYTES;
    entities.push({ id: v.getUint16(at, true), x: v.getUint16(at + ENTITY_X, true), z: v.getUint16(at + ENTITY_Z, true), heading: b[at + ENTITY_HEADING], anim: b[at + ENTITY_ANIM], flags: b[at + ENTITY_FLAGS], tick: v.getUint16(at + ENTITY_TICK, true) });
  }
  return { tick: v.getUint16(1, true), entities };
}
