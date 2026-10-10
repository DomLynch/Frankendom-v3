import * as THREE from 'three';
import { createTitheLighting, type TitheLight } from './special-lighting.ts';
import type { CombatEvent, Fighter, Side } from './duel.ts';
import { classSpecialFor, type ClassSpecialId } from './class-special-identity.ts';
import type { OpponentId } from '../roster.ts';
import { bossSpecialId, type BossSpecialId } from './special-identity.ts';
import { SPECIAL_TESTS, type SpecialTest } from './special-look.ts';
import { SCHOOL_OF, schoolTinter, schoolsFlag, schoolsStrength } from './spell-school.ts';
import { SPECIAL_MODES, type Pose, type SpecialFx, type SpecialMode } from './special-modes.ts';

type Pair<T> = readonly [T, T];
type Warriors = Parameters<NonNullable<SpecialMode['extra']>>[0];
export const casterPair = <T>(pair: Pair<T>, actor: Side): Pair<T> => actor === 1 ? pair : [pair[1], pair[0]];
export const casterEvent = (event: CombatEvent, actor: Side): CombatEvent => actor === 1 ? event : { ...event, actor: (1 - event.actor) as Side, ...(event.target === undefined ? {} : { target: (1 - event.target) as Side }) };
type SpecialId = BossSpecialId | ClassSpecialId;
export type SpecialFightIdentity = Readonly<{ opponent: OpponentId; level: number; presets?: readonly [SpecialTest | null, SpecialTest | null] }>;
const modes: Partial<Record<SpecialId, SpecialMode>> = SPECIAL_MODES;
const previews: Partial<Record<SpecialId, { opponent: OpponentId }>> = SPECIAL_TESTS;
type Slot = { id: SpecialId; opponent: OpponentId; generation: number; group: THREE.Scene; fx?: SpecialFx; events: CombatEvent[]; start: number; ended: boolean };
type Loader = (id: SpecialId, group: THREE.Scene, opponent: OpponentId, lighting: TitheLight) => Promise<SpecialFx>;

export function disposeSpecialGroup(group: THREE.Scene) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Points || object instanceof THREE.Line)) return;
      if (!(object instanceof THREE.Sprite) && object.userData.specialOwnGeometry !== false) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        if (material.userData.specialOwnTextures !== false) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); for (const texture of textures) texture.dispose();
    group.clear(); group.removeFromParent();
}

// Each effect retains its existing actor-1 contract; only presentation inputs are reordered.
// Epoch/rewind invalidate pending loads. No callback can start a cast or mutate the simulation.
export function createSpecialPresentation(scene: THREE.Scene, exposure: number, camera: THREE.Camera, loader: Loader = (id, group, opponent, lighting) => {
  const mode = modes[id];
  return mode ? mode.load(group, opponent, exposure, camera, lighting) : import('./special-fx.ts').then(({ createSpecialFx }) => createSpecialFx(group, opponent));
}) {
  const lighting = createTitheLighting(scene);
  const background = scene.background instanceof THREE.Color ? scene.background.clone() : null;
  const slots: [Slot | undefined, Slot | undefined] = [undefined, undefined];
  let epoch: number | undefined, lastTick = -1, generation = 0;
  const discard = (slot: Slot) => {
    slot.generation = ++generation; slot.fx?.clear(); disposeSpecialGroup(slot.group);
  };
  const clear = () => { for (const slot of slots) if (slot) discard(slot); slots[0] = slots[1] = undefined; lastTick = -1; lighting.clear(); };
  const load = (slot: Slot) => {
    const token = slot.generation;
    void loader(slot.id, slot.group, slot.opponent, lighting.forGroup(slot.group)).then((fx) => {
      if (slot.generation !== token) { fx.clear(); disposeSpecialGroup(slot.group); return; }
      const school = schoolsFlag(globalThis.location?.search ?? '') ? SCHOOL_OF[slot.id] : undefined;   // ?look=schools: the spell-school colour test (spell-school.ts)
      if (school) { const tint = schoolTinter(slot.group, school, schoolsStrength(globalThis.location?.search ?? '')), draw = fx.render.bind(fx); fx.render = (...a: Parameters<typeof draw>) => { draw(...a); tint(); }; }   // in place: a getter such as `exposure` stays live
      slot.fx = fx;
    }).catch(() => { if (slot.generation === token) { discard(slot); slot.ended = true; } });
  };
  const select = (side: Side, id: SpecialId, opponent: OpponentId) => {
    if (slots[side]) discard(slots[side]!);
    const group = new THREE.Scene(); group.background = background?.clone() ?? null; group.name = `special actor ${side}`; scene.add(group);
    const slot: Slot = { id, opponent, generation: ++generation, group, events: [], start: -1, ended: false };
    slots[side] = slot; load(slot); return slot;
  };
  return {
    prepare(nextEpoch: number, events: readonly CombatEvent[], fighters: Pair<Fighter>, tick: number, yielding: boolean, fight?: SpecialFightIdentity) {
      if (epoch !== nextEpoch || tick < lastTick) clear(); epoch = nextEpoch; lastTick = tick;
      for (const side of [0, 1] as const) {
        const fighter = fighters[side], id = fighter.specialShare === undefined ? null : fight?.presets ? fight.presets[side] : bossSpecialId(fighter.specialName ?? null) ?? (side === 1 && fight ? classSpecialFor(fight.opponent, fight.level) : null);
        const opponent = id ? previews[id]?.opponent ?? fight?.opponent : undefined;
        if (!id || !opponent || (id !== 'hades' && !modes[id])) { if (slots[side]) discard(slots[side]!); slots[side] = undefined; continue; }
        if (!slots[side] || slots[side]!.id !== id) select(side, id, opponent);
      }
      for (const event of events) {
        const side = event.actor;
        let slot = slots[side];
        if (!slot) continue;
        if (event.type === 'SpecialStarted') {
          if (yielding || event.tick <= slot.start) continue;
          const id = fight?.presets ? fight.presets[side] : bossSpecialId(event.name ?? null) ?? (side === 1 && fight ? classSpecialFor(fight.opponent, fight.level) : null);
          if (!id) continue;
          // The same effect again (a repeat cast): its textures, meshes and materials are built once per fight and kept; only its cast state is reset. A different
          // special is a different effect and is built (select). Re-creating a landed effect cost 200-700 ms at 4x CPU throttle on the cast's first frame.
          if (slot.id !== id || (slot.ended && !slot.fx)) slot = select(side, id, previews[id]?.opponent ?? slot.opponent);   // (a load that failed or never landed is tried again)
          else if (slot.ended) slot.fx!.clear();
          slot.start = event.tick; slot.ended = false; slot.events = [casterEvent(event, side)];
        } else if ((event.type === 'SpecialLanded' || event.type === 'SpecialFizzled' || event.type === 'SpecialInterrupted') && event.tick >= slot.start && !slot.ended) {
          slot.ended = true;
          if (event.type !== 'SpecialLanded' && !slot.fx) { discard(slot); slot.events = []; }
          else slot.events.push(casterEvent(event.type === 'SpecialInterrupted' ? { ...event, type: 'SpecialFizzled' } : event, side));   // a cut cast ends like a fizzled one: charge FX dropped, no payoff
        }
      }
    },
    mode(side: Side) { const id = slots[side]?.id; return id ? modes[id] : undefined; },
    held(pose: Pose, side: Side, fighters: Pair<Fighter>) {
      let held: ReturnType<NonNullable<SpecialMode['held']>> | undefined;
      for (const caster of [(1 - side) as Side, side]) {
        const next = this.mode(caster)?.held?.(held?.pose ?? pose, caster === side ? 1 : 0, casterPair(fighters, caster));
        if (next) held = next;
      }
      return held;
    },
    gait<P extends string>(side: Side, fighters: Pair<Fighter>, travel: number, pose: P) {
      for (const caster of [side, (1 - side) as Side]) {
        const speed = this.mode(caster)?.travel?.(caster === side ? 1 : 0, casterPair(fighters, caster));
        if (speed !== undefined) return { travel: speed, pose: 'ready' as const };
      }
      return { travel, pose };
    },
    render(dt: number, fighters: Pair<Fighter>, tick: number, feet: Pair<THREE.Vector3 | null>, heads: Pair<THREE.Vector3 | null>, warriors: Warriors, yielding: boolean) {
      lighting.beginFrame();
      for (const side of [0, 1] as const) {
        const slot = slots[side]; if (!slot?.fx) continue;
        const mode = modes[slot.id], normalized = side === 0 && warriors ? { player: warriors.opponent, opponent: warriors.player } : warriors;
        slot.fx.render(dt, slot.events, casterPair(fighters, side), tick, casterPair(mode?.at === 'feet' ? feet : heads, side), yielding, ...(mode?.extra?.(normalized) ?? []));
        slot.events = [];
      }
      lighting.apply(this.exposure);
    },
    get exposure() { return Math.max(0, Math.min(1, ...slots.map(slot => slot?.fx?.exposure ?? 1))); },
    clear,
  };
}
