// Put the hero beside a zone boss in the real zone (Gargantua spawn x 28,z 12; Arachne x -14,z 31), 375 wide, and shoot it ready + mid-attack (+ guard if GUARD=1).
// The hero is set down 3 m short of the boss's spawn (the sim's fighter position; aggro does the rest), no walking.
//   node scripts/boss-walkin-stills.mjs <base url> <out dir> <gargantua|arachne> [query]   env: ATTACK_AGES=8,22  AFTER=<tag>
import { mkdirSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';
const [base, out, who, query = 'opener=off'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SPOT = { gargantua: [28, 12], arachne: [-14, 31] }[who];
const AGES = (process.env.ATTACK_AGES ?? '8,22').split(',').map(Number), tag = process.env.TAG ?? who;
const browser = await launchBrowser({ angle: 'metal', chromeEnv: null });
const page = await browser.newPage(phoneOptions(2));
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || /DBG/.test(m.text())) console.error('console', m.text().slice(0, 200)); });
if (process.env.NET) page.on('request', (r) => { if (/\.js/.test(r.url())) console.log('req', r.url().slice(0, 140)); });
await page.goto(`${base}/?${query}`);
await waitPlayable(page, { timeout: 180000, zone: true });
await page.waitForTimeout(2000);
const WP = process.env.WP?.split(',').map(Number);   // a waypoint to walk to first (to come at the boss from another side)
const state = () => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight; return { zone: z?.current, engaged: z?.engaged, hero: f?.fighter && [+f.fighter.x.toFixed(1), +f.fighter.z.toFixed(1)], foe: f?.enemy && [+f.enemy.x.toFixed(1), +f.enemy.z.toFixed(1)], phase: f?.duel?.fighters?.map((x) => x.phase + ':' + x.age + ':' + x.weapon), hp: z?.foeHealth }; });
console.log('start', JSON.stringify(await state()));
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const pos = async () => { const s = await state(); return s.hero; };
async function basis(code) { const a = await pos(); await key(code, 'keydown'); await page.waitForTimeout(700); await key(code, 'keyup'); await page.waitForTimeout(200); const b = await pos(); const d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; }
const fw = await basis('KeyW'), rt = await basis('KeyD');
console.log('basis W', fw, 'D', rt);
let wpDone = !WP;
for (let i = 0; i < 600; i++) {
  const s = await state(); if (s.engaged) break;
  const T = wpDone ? SPOT : WP, dx = T[0] - s.hero[0], dz = T[1] - s.hero[1], n = Math.hypot(dx, dz);
  if (!wpDone && n < 0.6) { wpDone = true; continue; }
  const f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
  const held = [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]];
  for (const [c, on] of held) await key(c, on ? 'keydown' : 'keyup');
  await page.waitForTimeout(150);
}
for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA']) await key(c, 'keyup');
console.log('moved', JSON.stringify(await state()));
await page.waitForTimeout(3000);
console.log('dbg', await page.evaluate(() => [globalThis.__dbgB, globalThis.__dbgCalls, globalThis.__dbgSpawn, globalThis.__dbgW, globalThis.__v3Yaw, typeof globalThis.__v3Scene]));
console.log('later',JSON.stringify(await state()));
if (process.env.TWEAK) await page.evaluate(process.env.TWEAK);   // debug: JS run in the page once engaged (live knob tuning)
if (process.env.PROBE) console.log('probe', JSON.stringify(await page.evaluate(() => {
  const sc = globalThis.__v3Scene; let sh; sc.traverse((o) => { if (o.name === 'BossShield') sh = o; });
  if (!sh) return 'no shield';
  let root = sh; while (root.parent && root.parent !== sc) root = root.parent;
  const V = sh.position.constructor, q = sh.quaternion.constructor, pos = (n) => { const o = root.getObjectByName(n), p = o.getWorldPosition(new V()); return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; };
  const wp = sh.getWorldPosition(new V()), wq = sh.getWorldQuaternion(new q()), up = new V(0, 1, 0).applyQuaternion(wq);
  const out = { shield: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)], normalY: [+up.x.toFixed(2), +up.y.toFixed(2), +up.z.toFixed(2)], local: [sh.position.toArray(), sh.rotation.toArray().slice(0, 3), sh.scale.x] };
  for (const n of ['mixamorigHead', 'mixamorigSpine2', 'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand', 'mixamorigRightHand', 'mixamorigHips']) out[n] = pos(n);
  const f = root.getObjectByName('mixamorigLeftForeArm'), h = root.getObjectByName('mixamorigLeftHand');
  { let sk; root.traverse((m) => { if (!sk && m.isSkinnedMesh && m.skeleton.bones.includes(f)) sk = m.skeleton; }); const i = sk.bones.indexOf(f), M = sk.boneInverses[i].clone().invert(), e = M.elements; out.bindAxes = { x: e.slice(0, 3).map((v) => +v.toFixed(2)), y: e.slice(4, 7).map((v) => +v.toFixed(2)), z: e.slice(8, 11).map((v) => +v.toFixed(2)) }; const hi = sk.bones.indexOf(h), H = sk.boneInverses[hi].clone().invert().elements; out.bindHand = [+H[12].toFixed(2), +H[13].toFixed(2), +H[14].toFixed(2)]; out.bindFore = [+e[12].toFixed(2), +e[13].toFixed(2), +e[14].toFixed(2)]; }
  out.handLocal = h.position.toArray().map((v) => +v.toFixed(3)); out.forearmScale = f.getWorldScale(new V()).x;
  return out;
})));
if (process.env.DEBUG) console.log(JSON.stringify(await page.evaluate(() => {
  const sc = globalThis.__v3Scene, rows = [];
  sc.traverse((o) => { if (o.name === 'mixamorigHips') { const p = o.getWorldPosition(new o.position.constructor()); let r = o; while (r.parent && r.parent !== sc) r = r.parent; const meshes = []; r.traverse((m) => { if (m.isSkinnedMesh) meshes.push(m.name); }); rows.push(['HIPS', +p.x.toFixed(1), +p.z.toFixed(1), r.name, meshes.join(',')]); } });
  sc.traverse((o) => { if (/Grip106|WeaponDrawn|BossShield$|fk_socket_hand_r|RightHand$|LeftForeArm$|SwordDrawn/.test(o.name)) { const p = o.getWorldPosition(new o.position.constructor()), s = o.getWorldScale(new o.position.constructor()); let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) vis = false; rows.push([o.name, o.type, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), 's' + +s.x.toFixed(3), vis, o.parent?.name, o.children.map((c) => c.name + ':' + c.type).join('|')]); } });
  return rows;
}), null, 0));
await page.screenshot({ path: `${out}/${tag}-ready.png` });
const want = new Set(AGES);
for (let i = 0; i < Number(process.env.ITERS ?? 600) && (want.size || process.env.METRIC); i++) {
  await page.evaluate(() => { const [h] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; });
  const s = (await state()).phase;
  const [hf, ff] = [s[0], s[1]]; const m = /^attack:(\d+)/.exec(ff);
  if (process.env.METRIC) { const c = await page.evaluate(() => {   // shield clearance: distance from the board (a disc: centre, face normal, radius) to the head and chest joints, minus a body radius; negative = clipping
    const sc = globalThis.__v3Scene; let sh; sc.traverse((o) => { if (o.name === 'BossShield') sh = o; }); if (!sh) return null;
    let root = sh; while (root.parent && root.parent !== sc) root = root.parent;
    const V = sh.position.constructor, C = sh.getWorldPosition(new V()), n = new V(0, 1, 0).applyQuaternion(sh.getWorldQuaternion(new sh.quaternion.constructor())), R = sh.getObjectByName('BossShield.face').geometry.parameters.radiusTop * sh.getWorldScale(new V()).x;
    const clear = (name, r) => { const P = root.getObjectByName(name).getWorldPosition(new V()).sub(C), a = P.dot(n), rad = P.clone().addScaledVector(n, -a).length(); return +(Math.hypot(Math.max(0, rad - R), Math.max(0, Math.abs(a) - 0.02)) - r).toFixed(3); };
    const spine = root.getObjectByName('mixamorigSpine2').getWorldPosition(new V()), out = C.clone().sub(spine).dot(n);
    return { head: clear('mixamorigHead', 0.11), neck: clear('mixamorigNeck', 0.06), chest: clear('mixamorigSpine2', 0.15), belly: clear('mixamorigSpine', 0.14), outward: +out.toFixed(2) };
  }); if (c) { globalThis.__min ??= {}; for (const k of ['head', 'neck', 'chest', 'belly']) globalThis.__min[k] = Math.min(globalThis.__min[k] ?? 9, c[k]); globalThis.__n = (globalThis.__n ?? 0) + 1; globalThis.__outSum = (globalThis.__outSum ?? 0) + c.outward; } }
  if (/^guard/.test(ff) && !globalThis.__guardShot) { globalThis.__guardShot = 1; await page.screenshot({ path: `${out}/${tag}-guard.png` }); console.log('shot guard', ff); }
  if (m && want.has(+m[1])) { want.delete(+m[1]); await page.screenshot({ path: `${out}/${tag}-attack-${m[1]}.png` }); console.log('shot attack', m[1]); }
  await page.waitForTimeout(16);
}
if (process.env.METRIC) console.log('clearance min over the fight (m, negative = clipping)', JSON.stringify(globalThis.__min), 'samples', globalThis.__n, 'mean outward', (globalThis.__outSum / globalThis.__n).toFixed(2));
console.log('not reached', [...want].join(','), JSON.stringify(await state()));
await browser.close();
