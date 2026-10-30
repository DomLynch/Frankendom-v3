// Boss spacing report (Dom 2026-10-28 'the bosses are very far away'): reads data/rings.json (or the file given), the zone row and the run speed row, and prints the time-to-boss table
// plus a top-down map of every boss (pit frame: x east, z south, the pit's centre at the middle) as SVG, and as PNG when playwright is installed. No art, no page; rows only.
//   node scripts/boss-spacing.mjs [rings.json] [out prefix e.g. docs/stills/boss-spacing/map-after]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ringOrigin, ringSpawns } from '../src/zone/rings.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const [file = 'data/rings.json', prefix] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(file.startsWith('/') ? file : new URL(`../${file}`, import.meta.url), 'utf8'));
const zone = read('data/zones/zone1.row.json'), RUN = read('src/fight/world-rules-defs.json').rules?.find?.((r) => r.id === 'playerRun')?.value ?? 5.2;
const origin = ringOrigin(zone);
const all = [...zone.spawns.map((s) => ({ id: s.id, kind: s.kind, ring: 'ring-1', s })), ...ringSpawns(origin, rows).map((s) => ({ id: s.id, kind: s.kind, ring: s.id.split('-').slice(0, 2).join('-'), s }))];
const B = all.map((b) => ({ ...b, x: b.s.position.x - origin.x, z: b.s.position.z - origin.z, aggro: b.s.behaviour.aggro, leash: b.s.behaviour.leash }));
const sec = (d, aggro) => Math.max(0, (d - aggro) / RUN);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const f1 = (n) => n.toFixed(1);

console.log(`run speed ${RUN} m/s (src/fight/world-rules-defs.json playerRun); seconds = (distance - aggro) / run; pit frame, centre = pit centre\n`);
console.log('| boss | ring | from pit m | pit s | nearest other boss | gap m | gap s |\n|---|---|---|---|---|---|---|');
let worstNearest = 0;
for (const b of B) {
  const others = B.filter((o) => o !== b), near = others.reduce((m, o) => (d(b, o) < d(b, m) ? o : m));
  worstNearest = Math.max(worstNearest, d(b, near));
  console.log(`| ${b.kind} | ${b.ring} | ${f1(Math.hypot(b.x, b.z))} | ${f1(sec(Math.hypot(b.x, b.z), b.aggro))} | ${near.kind} | ${f1(d(b, near))} | ${f1(sec(d(b, near), near.aggro))} |`);
}
for (const r of ['ring-1', 'ring-2', 'ring-3']) {
  const g = B.filter((b) => b.ring === r);
  if (g.length) console.log(`\n${r}: first boss from the pit ${f1(Math.min(...g.map((b) => sec(Math.hypot(b.x, b.z), b.aggro))))} s, farthest ${f1(Math.max(...g.map((b) => sec(Math.hypot(b.x, b.z), b.aggro))))} s`);
}
// the walk a player takes: from the pit to the nearest standing boss, kill, then the nearest not-yet-killed from that death spot
let at = { x: 0, z: 0 }, left = [...B], hops = [];
while (left.length) { const n = left.reduce((m, o) => (d(at, o) < d(at, m) ? o : m)); hops.push({ to: n.kind, m: d(at, n), s: sec(d(at, n), n.aggro) }); at = n; left = left.filter((o) => o !== n); }
console.log(`\nnearest-unkilled walk from the pit (${hops.length} bosses): ${hops.map((h) => `${h.to} ${f1(h.s)}s`).join(' > ')}`);
console.log(`worst hop ${f1(Math.max(...hops.map((h) => h.s)))} s, mean hop ${f1(hops.reduce((s, h) => s + h.s, 0) / hops.length)} s, total ${f1(hops.reduce((s, h) => s + h.s, 0))} s; worst nearest-neighbour gap ${f1(worstNearest)} m (${f1(sec(worstNearest, 2.5))} s)`);

if (prefix) {
  mkdirSync(dirname(prefix), { recursive: true });
  const S = 420, R = 150, sc = (S / 2 - 24) / R, colour = { 'ring-1': '#4a9d5b', 'ring-2': '#d49a3a', 'ring-3': '#9a6bd1' };
  const px = (v) => S / 2 + v * sc;
  const circles = [60, ...rows.rings.slice(1).flatMap((r) => [r.minDist, r.maxDist])].map((m) => `<circle cx="${S / 2}" cy="${S / 2}" r="${m * sc}" fill="none" stroke="#555" stroke-dasharray="3 4" stroke-width="1"/>`).join('');
  const dots = B.map((b) => `<circle cx="${px(b.x)}" cy="${px(b.z)}" r="${b.leash * sc}" fill="${colour[b.ring]}" fill-opacity="0.12" stroke="${colour[b.ring]}" stroke-opacity="0.5"/><circle cx="${px(b.x)}" cy="${px(b.z)}" r="3.5" fill="${colour[b.ring]}"/><text x="${px(b.x) + 5}" y="${px(b.z) - 5}" font-size="9" fill="#ddd" font-family="sans-serif">${b.kind}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S + 30}" viewBox="0 0 ${S} ${S + 30}"><rect width="${S}" height="${S + 30}" fill="#14181d"/>${circles}<circle cx="${S / 2}" cy="${S / 2}" r="4" fill="#fff"/><text x="8" y="16" font-size="11" fill="#ddd" font-family="sans-serif">${prefix.split('/').pop()}: boss spots, leash circles, pit at the centre, north up, dashed = ring bands</text><text x="8" y="${S + 20}" font-size="11" fill="#ddd" font-family="sans-serif">run ${RUN} m/s; nearest-unkilled walk worst hop ${f1(Math.max(...hops.map((h) => h.s)))} s; scale ${R} m = ${S / 2 - 24} px</text></svg>`;
  writeFileSync(`${prefix}.svg`, svg);
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined }), page = await browser.newPage({ viewport: { width: S, height: S + 30 }, deviceScaleFactor: 2 });
    await page.setContent(`<body style="margin:0">${svg}</body>`); await page.screenshot({ path: `${prefix}.png` }); await browser.close();
  } catch (e) { console.error(`no PNG (${e.message.split('\n')[0]}); ${prefix}.svg written`); }
}
