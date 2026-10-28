// The load-time check of data/golden-weapons.json (the values; src/sim/validate.js checks the keys). Lives beside the page wiring, not in src/zone/, because its messages are diagnostics (the as-data gate
// scans src/zone/ for readable strings). Throws on the first bad row: a range, a colour, a weapon id that is no weapon-defs row, a point outside its ring, a duplicate id, a roaming point naming no row.
import type { GoldenRows } from '../zone/golden-drops.ts';

type Range = [number, number];
const HEX = /^#[0-9a-fA-F]{6}$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `ringRows`: data/rings.json rings (id, minDist, maxDist). */
export function validateGolden(r: GoldenRows, isWeapon: (id: string) => boolean, ringRows: readonly { id: string; minDist: number; maxDist: number }[]): void {
  const fail = (m: string): never => { throw new Error(`golden-weapons: ${m}`); };
  const within = (name: string, v: unknown, range: Range) => { if (!(isNum(v) && v >= range[0] && v <= range[1])) fail(`${name} ${String(v)} is not a number in ${range[0]}..${range[1]}`); };
  const colour = (name: string, v: unknown) => { if (!(typeof v === 'string' && HEX.test(v))) fail(`${name} ${String(v)} is not a #rrggbb colour`); };
  const word = (name: string, v: unknown) => { if (!(typeof v === 'string' && v.trim() && v.trim() === v)) fail(`${name} is a non-empty trimmed string`); };
  if (!Number.isInteger(r.version) || r.version < 1) fail('version is a whole number from 1');
  if (!(isNum(r.halfTurnDegrees) && r.halfTurnDegrees > 0)) fail('halfTurnDegrees is above 0');
  word('spend.event', r.spend?.event);
  for (const k of ['actor', 'target'] as const) if (!Number.isInteger(r.spend?.[k])) fail(`spend.${k} is a whole number`);
  const L = r.limits;
  within('pickup.reachMetres', r.pickup?.reachMetres, L.metres); within('pickup.tapReachMetres', r.pickup?.tapReachMetres, L.metres); within('pickup.tapRadiusPx', r.pickup?.tapRadiusPx, L.px);
  if (!Array.isArray(r.weapons) || !r.weapons.length) fail('weapons: at least one row');
  const ids = new Set<string>();
  for (const w of r.weapons) {
    const at = `weapons.${String(w.id)}`;
    word(`${at}.id`, w.id); if (ids.has(w.id)) fail(`${at}: duplicate id`); ids.add(w.id);
    for (const k of ['name', 'power', 'tell'] as const) word(`${at}.${k}`, w[k]);
    if (!isWeapon(w.weapon)) fail(`${at}.weapon "${String(w.weapon)}" is no src/fight/weapon-defs.json row`);
    if (!Number.isInteger(w.charges)) fail(`${at}.charges is a whole number`);
    within(`${at}.charges`, w.charges, L.charges); within(`${at}.damageMul`, w.damageMul, L.damageMul); within(`${at}.tier`, w.tier, L.tier);
    colour(`${at}.tint.colour`, w.tint?.colour); colour(`${at}.tint.emissive`, w.tint?.emissive);
    within(`${at}.tint.emissiveIntensity`, w.tint?.emissiveIntensity, L.intensity);
    within(`${at}.tint.metalness`, w.tint?.metalness, L.alpha); within(`${at}.tint.roughness`, w.tint?.roughness, L.alpha);
  }
  const d = r.drops, b = d?.bossKill;
  if (!Array.isArray(b?.chanceByStar) || !b.chanceByStar.length || b.tierByStar?.length !== b.chanceByStar.length) fail('drops.bossKill: chanceByStar and tierByStar are lists of one length, one entry per star level');
  for (const c of b.chanceByStar) within('drops.bossKill.chanceByStar', c, L.chance);
  for (const t of b.tierByStar) within('drops.bossKill.tierByStar', t, L.tier);
  within('drops.bossKill.scatterMetres', b.scatterMetres, L.metres);
  if (typeof d.packChest?.on !== 'boolean') fail('drops.packChest.on is true or false');
  within('drops.packChest.chance', d.packChest.chance, L.chance); within('drops.packChest.tier', d.packChest.tier, L.tier);
  within('drops.roaming.respawnSeconds', d.roaming?.respawnSeconds, L.seconds); within('drops.maxGround', d.maxGround, L.ground);
  const seen = new Set<string>();
  for (const p of d.roaming?.points ?? []) {
    const at = `drops.roaming.points.${String(p.id)}`, ring = ringRows.find((x) => x.id === p.ring);
    word(`${at}.id`, p.id); if (seen.has(p.id)) fail(`${at}: duplicate id`); seen.add(p.id);
    if (!ids.has(p.weapon)) fail(`${at}.weapon "${String(p.weapon)}" is no weapons row`);
    if (!ring) fail(`${at}.ring "${String(p.ring)}" is no data/rings.json ring`);
    else within(`${at}.distance`, p.distance, [ring.minDist, ring.maxDist]);
    within(`${at}.angleDeg`, p.angleDeg, L.angle);
  }
  for (const k of ['pickup', 'spent', 'lost'] as const) word(`lines.${k}`, r.lines?.[k]);
  within('lines.seconds', r.lines?.seconds, L.seconds);
  colour('marker.colour', r.marker?.colour); colour('marker.glow', r.marker?.glow);
  for (const k of ['ringPx', 'beamPx', 'widthPx'] as const) within(`marker.${k}`, r.marker?.[k], L.px);
  within('marker.alpha', r.marker?.alpha, L.alpha); within('marker.pulseSeconds', r.marker?.pulseSeconds, L.pulse);
  within('marker.showWithinMetres', r.marker?.showWithinMetres, L.metres); within('marker.zIndex', r.marker?.zIndex, [0, L.coord]);
  colour('hud.colour', r.hud?.colour); within('hud.zIndex', r.hud?.zIndex, [0, L.coord]); within('hud.topPct', r.hud?.topPct, [0, L.px[1]]); within('hud.sizePx', r.hud?.sizePx, L.px); word('hud.text', r.hud?.text);
}
