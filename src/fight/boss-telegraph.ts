import * as THREE from 'three';
import { RULES } from './moves.ts';
import type { Fighter } from './duel.ts';
import { BRICKS, isSpellId } from './spell-cast.ts';
import { SCHOOLS } from './schools.ts';
import SPELL_INDEX from './spell-index.json' with { type: 'json' };
import { sceneNum } from './scene-rows.ts';

// Ground telegraph for a rank 8-10 boss special (brief #1507 item 2; a ?telegraph=1 look-test, renderer only). While the boss winds up, a ring fills on the floor
// under the hero: where the blow will land, so a roll is the answer without any text. Read off the sim's own windup ticks (specialStage's source), never written back.
export const telegraphFlag = (search: string): boolean => /[?&]telegraph=(1|on|ring)\b/i.test(search);
// CASTER TELL (Combat #7a, Lead 2026-10-13: spells are live, so a cast must be readable coming): the same ring, for ANY fighter mid-cast of a spell (either side), always on, tinted with the spell's school (school-defs.json). Boss specials keep the orange ring behind the flag.
const SPELLS = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;
export const spellColor = (id: string): number | undefined => { const root = SPELLS[id]?.[0], hex = root ? SCHOOLS[BRICKS[root]?.school ?? ''] : undefined; return hex ? parseInt(hex.slice(1), 16) : undefined; };
// ?spell=<id>[&spellskill=N] (look test for the stills, Lead 2026-10-13): a SPARRING fight casts that spell through the skill slot (Match's lookSpell port: sparring sends no record and pays nothing; a paying fight ignores it) until the client wire (the equipped grimoire) lands. The id is only ever
// read from the address and resolved through spell-cast.ts's rows (isSpellId); no spell, number or colour lives here. Absent flag or an id that is no row = undefined, so the game is today's.
export const spellLook = (search: string): { id: string; skill: number } | undefined => {
  const q = new URLSearchParams(search), id = q.get('spell') ?? '', skill = Number(q.get('spellskill') ?? 0);
  return isSpellId(id) ? { id, skill: Number.isFinite(skill) && skill > 0 ? skill : 0 } : undefined;
};
const ROLL_TICKS = sceneNum('boss-telegraph.roll-ticks');   // the last stretch of the windup, when the ring flashes: the roll window
export const telegraphLook = (caster: Pick<Fighter, 'specialShare' | 'special' | 'health'> & { spell?: { id: string } }, bosses = true): { fill: number; flash: boolean; color?: number } | null => {
  if (!caster.special || !caster.health) return null;
  const color = caster.spell ? spellColor(caster.spell.id) : undefined;
  if (!caster.spell && !(bosses && caster.specialShare === RULES.special.bossDamage)) return null;
  return { fill: 1 - caster.special / RULES.special.windup, flash: caster.special <= ROLL_TICKS, ...(color !== undefined ? { color } : {}) };
};

export function createBossTelegraph(scene: THREE.Scene) {
  const group = new THREE.Group(); group.visible = false; group.renderOrder = 5;
  const make = (geometry: THREE.BufferGeometry, color: number) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material); mesh.renderOrder = 5; group.add(mesh); return mesh;
  };
  const ring = make(new THREE.RingGeometry(0.92, 1, 48), 0xff5a1f), fill = make(new THREE.CircleGeometry(1, 48), 0xd83a10);
  scene.add(group);
  return {
    update(boss: Fighter, at: THREE.Vector3 | null, tick: number, bosses = true) {
      const look = telegraphLook(boss, bosses);
      group.visible = !!look && !!at;
      if (!look || !at) return;
      const radius = RULES.special.reach * 0.4;   // 1.2 m: about a body and a half, readable at 375 wide on the fight camera
      group.position.set(at.x, at.y + 0.03, at.z); group.scale.setScalar(radius);
      const tint = look.color;
      ring.material.color.setHex(tint ?? 0xff5a1f); fill.material.color.setHex(tint ?? 0xd83a10);
      const pulse = look.flash ? 0.65 + 0.35 * Math.sin(tick * 0.9) : 1;
      ring.material.opacity = (0.3 + 0.5 * look.fill) * pulse;
      fill.scale.setScalar(Math.max(0.02, look.fill)); fill.material.opacity = (0.12 + 0.3 * look.fill * look.fill) * pulse;
    },
    dispose() { group.removeFromParent(); for (const m of group.children as THREE.Mesh[]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } },
  };
}
