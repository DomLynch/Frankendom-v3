// BATCH in-hand weapon stills: every row of data/boss-weapons.json in ONE browser session (one run per release, not one still pass per weapon PR). Stills only, no game change.
//   node scripts/boss-weapon-hand-stills-all.mjs <built dist: a directory path or an http(s) url> [out dir = docs/stills/boss-weapons] [query = opener=off]
//   node scripts/boss-weapon-hand-stills-all.mjs dist                    a directory is served in-process (gzip twins as nginx), so production-hashed asset names just work
//   node scripts/boss-weapon-hand-stills-all.mjs http://localhost:8733   a url is used as it is (npm run serve)
//   node scripts/boss-weapon-hand-stills-all.mjs --help
// Per row of data/boss-weapons.json (an archetype row, or a profile row keyed by `profile`) the boss spawn is found in the built game's zone (a ring spawn of that profile's kind, or the zone spawn of the
// archetype's boss: executioner = Gargantua, shieldmaiden = Arachne). A row with no spawn is reported "skipped: no spawn", never a failure. For each boss, as scripts/boss-weapon-hand-stills.mjs does:
//   <out>/<tag>-375-ready.png  fight camera, 375 wide, ready pose      <out>/<tag>-hand.png  close-up on the right hand      <out>/<tag>-weapon.png  the whole weapon
// and <out>/ALL-contact.png, a labelled grid of the ready stills. env: ONLY=ryo,gargantua (tags to run), DIST=2.2, HAND_SIDE=1|-1, HAND_DIST=1.4, HAND_RISE=0.25, HAND_LOOK=0.25, CHROME=<path>
import { mkdirSync, readFileSync } from 'node:fs';
import { launchBrowser, phoneOptions, serveDist, waitPlayable } from './lib/browser.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || !args.length) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(args.length ? 0 : 2); }
const [target, out = 'docs/stills/boss-weapons', query = 'opener=off'] = args;
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const num = (k, d) => Number(process.env[k] ?? d);
let server = null, base = target;
if (!/^https?:\/\//.test(target)) {   // a built dist directory: serve it here (a path with no extension falls back to index.html; a .gz twin goes out gzip-encoded)
  try { server = await serveDist(target); } catch (e) { console.error(e.message); process.exit(2); }
  base = server.url;
}
const rows = JSON.parse(readFileSync(new URL('../data/boss-weapons.json', import.meta.url), 'utf8')).rows;
const ARCHETYPE_TAG = { executioner: 'gargantua', shieldmaiden: 'arachne' }, ARCHETYPE_SPAWN = { executioner: 'yard-pitborn', shieldmaiden: 'pit-pitborn-east' };   // the zone's own boss spawn ids (data/zones/zone1.row.json); other archetypes are reached through a profile row
const only = process.env.ONLY?.split(',');
const browser = await launchBrowser();

const initCam = ([side, dist, rise, look]) => {   // the close-up lens: beside the boss's right hand, only while globalThis.__handCam is on
  const st = { hand: null };
  globalThis.__v3CamShot = (cam) => {
    if (!globalThis.__handCam) return;
    const p = globalThis.__v3Fight, root = globalThis.__v3Scene; if (!p || !root) return;
    const [hero, foe] = p.duel.fighters; let dx = hero.body.x - foe.body.x, dz = hero.body.z - foe.body.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const w = cam.position.clone();
    if (!st.hand) { let bd = 1e9; root.traverse((o) => { if (o.name !== 'mixamorigRightHand' || !o.getObjectByName('Grip106')) return; o.getWorldPosition(w); const d = Math.hypot(w.x - foe.body.x, w.z - foe.body.z); if (d < bd) { bd = d; st.hand = o; } }); }
    if (!st.hand) return;
    st.hand.getWorldPosition(w);
    if (st.k === undefined) { let top = st.hand; while (top.parent && top.parent !== root) top = top.parent; let lo = 1e9, hi = -1e9; top.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); lo = Math.min(lo, b.min.y); hi = Math.max(hi, b.max.y); } }); const h = Math.max(0, hi - lo); st.k = Math.min(3, Math.max(1, h / 1.8)); console.log(`bodyScale ${st.k.toFixed(2)} (height ${h.toFixed(2)})`); }   // a giant's hand sits deep inside his own arm at 0.9 m: stand back by his size (1 for a 1.8 m body)
    let ax = w.x, ay = w.y + look * st.k, az = w.z, d = dist * st.k;
    if (globalThis.__handCam === 'weapon') {   // the whole grafted part in frame, stand back by its size
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; const v = w.clone();
      st.hand.getObjectByName('Grip106').traverse((o) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v.set(x, y, z).applyMatrix4(o.matrixWorld); lo = [Math.min(lo[0], v.x), Math.min(lo[1], v.y), Math.min(lo[2], v.z)]; hi = [Math.max(hi[0], v.x), Math.max(hi[1], v.y), Math.max(hi[2], v.z)]; } });
      ax = (lo[0] + hi[0]) / 2; ay = (lo[1] + hi[1]) / 2; az = (lo[2] + hi[2]) / 2; d = Math.max(1.6 * st.k, 1.3 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
    }
    const px = -dz * side, pz = dx * side;
    cam.position.set(ax + (px * 0.7 + dx * 0.7) * d, ay + rise * st.k, az + (pz * 0.7 + dz * 0.7) * d); cam.lookAt(ax, ay, az); cam.updateMatrixWorld();
  };
};

async function shoot(tag, pickSpawn) {   // one boss on a fresh page of the same browser; returns { spawnId, weapon } or { skipped }
  const page = await browser.newPage(phoneOptions(2));
  try {
    page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
    page.on('console', (m) => { if (/^bodyScale/.test(m.text()) && !globalThis.__scaleSeen?.has(tag + m.text())) console.log(`${tag}: ${m.text()}`); });
    await page.addInitScript(initCam, [num('HAND_SIDE', 1), num('HAND_DIST', 1.4), num('HAND_RISE', 0.25), num('HAND_LOOK', 0.25)]);
    await page.goto(`${base}/?${query}`);
    await waitPlayable(page, { timeout: 180000, zone: true });
    await page.waitForTimeout(1500);
    const all = await page.evaluate(() => globalThis.__v3Zone.spawns.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z })));
    const spawn = pickSpawn(all);
    if (!spawn) return { skipped: 'no spawn' };
    await page.evaluate(([s, d]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + d; f.z = s.z; }, [spawn, num('DIST', 2.2)]);
    const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
    const heroAt = () => page.evaluate(() => { const f = globalThis.__v3Fight.fighter; return [f.x, f.z]; });
    const basis = async (code) => { const a = await heroAt(); await key(code, 'keydown'); await page.waitForTimeout(500); await key(code, 'keyup'); await page.waitForTimeout(300); const b = await heroAt(), d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; };
    const fw = await basis('KeyW'), rt = await basis('KeyD');
    await page.evaluate(([s, d]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + d; f.z = s.z; }, [spawn, num('DIST', 5)]);
    await page.waitForTimeout(500);
    for (let i = 0; i < 300 && !(await page.evaluate(() => globalThis.__v3Zone.engaged)); i++) {
      const h = await heroAt(), dx = spawn.x - h[0], dz = spawn.z - h[1], n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
      for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
      if (i > 40 && n < 4) await page.evaluate(([s, ux, uz]) => { const q = globalThis.__v3Fight.fighter; q.x = s.x - ux * 2; q.z = s.z - uz * 2; }, [spawn, dx / n, dz / n]);
      await page.waitForTimeout(100);
    }
    for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA']) await key(c, 'keyup');
    if (!(await page.evaluate(() => globalThis.__v3Zone.engaged))) return { skipped: `boss did not engage (${spawn.id})` };
    const state = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; return { hero: h.phase, foe: f.phase, weapon: f.weapon }; });   // stills only: the hero lives
    await page.waitForTimeout(2000);
    for (let i = 0; i < 400; i++) { const s = await state(); if (s.foe === 'ready' && s.hero !== 'sheathed') break; await page.waitForTimeout(50); }
    await page.screenshot({ path: `${out}/${tag}-375-ready.png` });
    const ready = await state(); console.log(`${tag}: ${spawn.id} ready`, JSON.stringify(ready));
    for (const mode of ['hand', 'weapon']) {
      await page.evaluate((m) => { globalThis.__handCam = m; }, mode);
      await page.waitForTimeout(700);
      for (let i = 0; i < 200 && /attack|stagger|hit/.test((await state()).foe); i++) await page.waitForTimeout(50);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/${tag}-${mode}.png` });
    }
    return { spawnId: spawn.id, weapon: ready.weapon };
  } finally { await page.close(); }
}

const done = [], skipped = [];
for (const row of rows) {
  const tag = row.profile ?? ARCHETYPE_TAG[row.opponent] ?? row.opponent, label = row.profile ? `${row.profile} (${row.opponent})` : `${tag} (${row.opponent} archetype)`;
  if (only && !only.includes(tag)) continue;
  const pick = row.profile ? (all) => all.find((s) => new RegExp(`^ring-\\d+-${row.profile}-\\d+$`).test(s.id)) : (all) => all.find((s) => s.id === ARCHETYPE_SPAWN[row.opponent]);
  let r; try { r = await shoot(tag, pick); } catch (e) { r = { skipped: `error: ${String(e.message).split('\n')[0]}` }; }
  if (r.skipped) { skipped.push([tag, r.skipped]); console.log(`${tag}: skipped: ${r.skipped}`); } else done.push({ tag, label, ...r });
}

if (done.length) {   // the contact sheet: a labelled grid of the ready stills, rendered in the same browser
  const cell = (d) => `<figure><img src="data:image/png;base64,${readFileSync(`${out}/${d.tag}-375-ready.png`).toString('base64')}"><figcaption><b>${d.label}</b><br>${d.spawnId} &middot; ${d.weapon ?? ''}</figcaption></figure>`;
  const page = await browser.newPage({ viewport: { width: Math.min(done.length, 4) * 380 + 20, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:10px;background:#111;color:#eee;font:14px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:8px">${done.map(cell).join('')}</div><style>figure{margin:0;width:372px}img{width:372px;display:block}figcaption{padding:6px 2px;text-align:center}</style></body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/ALL-contact.png`, fullPage: true });
  await page.close();
}
await browser.close(); server?.close();
console.log(`rendered: ${done.map((d) => d.tag).join(', ') || 'none'}`);
for (const [t, why] of skipped) console.log(`skipped: ${why} -> ${t}`);
console.log(`runtime ${((Date.now() - t0) / 1000).toFixed(0)} s`);
