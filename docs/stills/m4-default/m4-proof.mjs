// Proof harness for PR 158 (m4 default). Same page setup as kick-interrupt-capture.mjs / light-hit-fall.mjs (375x812, paused fake clock, 1 rAF = 1 tick).
//   node m4-proof.mjs <base> <mode> [query]      mode: heavyinj | counter | cuts
// heavyinj: light blows (KeyF) at 1 m until the evaluator's foe torso fraction is under 0.60 (cap 40), then ONE heavy (KeyG); records the heavy's result and the ragdoll/sim trail.
// counter: 12 light swings (KeyF), each pressed while the foe is mid-attack (phase windup/active/attack), the hero's longsword (data/fight.json weapon); counts hits and falls.
// cuts: heavies at the head/limbs are not aimable from the keyboard here; reports cuts recorded by the evaluator (__v3Rules.cuts) across a run of lights+heavies.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, mode, query = ''] = process.argv.slice(2);
const out = process.env.OUT; mkdirSync(out, { recursive: true });
const TICK = 1000 / 60;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 2000);
const run = (t) => page.clock.runFor(Math.round(t * TICK));
await run(120);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 90000 });
const phase = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
for (let i = 0; i < 240 && /sheathed|draw/.test(await phase()); i++) await run(1);
await run(30);
const keep = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = f.maxHealth; f.stamina = f.maxStamina; });
const place = () => page.evaluate((g) => { const [h, f] = globalThis.__v3Fight.duel.fighters; f.body = { ...f.body, x: h.body.x + Math.sin(h.body.heading) * g, z: h.body.z + Math.cos(h.body.heading) * g, heading: h.body.heading + Math.PI }; }, GAPNOW.v);
const GAPNOW = { v: Number(process.env.DIST ?? 1.0) };
const snap = () => page.evaluate(() => {
  const p = globalThis.__v3Fight, f = p.duel.fighters[1], r = globalThis.__ragdoll, R = globalThis.__v3Rules;
  return { st: r.state, down: f.down ?? 0, fphase: f.phase, torso: R?.partFractions?.().torso ?? null, parts: R?.partFractions?.() ?? null,
    ev: (p.events || []).map((e) => ({ k: `${e.tick}|${e.type}|${e.actor}|${e.target}|${e.move}|${e.count}`, t: e.type, a: e.actor, mv: e.move, loc: e.location, inj: e.injured })) };
});
await page.keyboard.down('KeyW');
const press = async (c) => { await page.keyboard.down(c); await page.keyboard.up(c); };
const seen = new Set();
const tot = { heroHits: [], falls: [], ragdollKnockdownTicks: 0, simDownTicks: 0, states: new Set() };
let t = 0, n = 0;
const step = async (shoot) => {
  await keep(); await place(); await run(1); t++;
  const s = await snap();
  for (const e of s.ev) { if (seen.has(e.k)) continue; seen.add(e.k);
    if (e.t === 'Hit' && e.a === 0) tot.heroHits.push(`t${t}:${e.mv}@${e.loc}`);
    if (e.t === 'KnockedDown') tot.falls.push(`t${t}:KnockedDown actor${e.a}:${e.mv}${e.inj ? ':injuredLeg' : ''}`); }
  tot.states.add(s.st); if (s.st === 'knockdown') tot.ragdollKnockdownTicks++; if (s.down) tot.simDownTicks++;
  if (shoot && t % 4 === 0 && process.env.FRAMES) await page.screenshot({ path: `${out}/${mode}-f${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 80 });
  return s;
};
const summary = { mode, query: query || 'default' };
if (mode === 'heavyinj') {
  const lightLog = [];
  let s;
  for (let i = 0; i < 40; i++) {
    s = await snap(); if (s.torso !== null && s.torso < Number(process.env.TH ?? 0.6)) break;
    await press('KeyF'); for (let k = 0; k < 90; k++) s = await step(false);
    lightLog.push(`light${i + 1}: torso=${(s.torso ?? NaN).toFixed(3)} st=${s.st}`);
  }
  s = await snap();
  summary.stagingLights = lightLog.length; summary.torsoBeforeHeavy = s.torso; summary.partsBeforeHeavy = s.parts; summary.stateBeforeHeavy = s.st; summary.lightLog = lightLog;
  summary.fallsDuringStaging = [...tot.falls]; summary.kdTicksStaging = tot.ragdollKnockdownTicks;
  // clean slate for the heavy: clear the foe back to alive before the one heavy (wait out any staggering/knockdown)
  for (let k = 0; k < 400; k++) { s = await snap(); if (s.st === 'alive') break; await step(false); }
  s = await snap(); summary.torsoAtHeavy = s.torso; summary.stateAtHeavy = s.st;
  const base0 = tot.ragdollKnockdownTicks, fallsBefore = tot.falls.length, rulesBefore = await page.evaluate(() => (globalThis.__v3Rules.last ?? []).length);
  const trail = []; const heavyStart = t;
  let attempts = 0; if (process.env.HDIST) GAPNOW.v = Number(process.env.HDIST);   // the heavy's strike point depends on the gap (duel.ts bladeImpact), so the gap for the heavy is a knob
  for (; attempts < 12; attempts++) {   // a heavy that did not connect, or hit a leg, is tried again; only a heavy whose evaluator zone is the torso, with the torso fraction under 0.60, counts
    for (let w = 0; w < 300 && (await phase()) !== 'ready'; w++) await step(false);
    const sb = await snap(); if (sb.torso >= 0.6) break;   // (always under 0.60 here: the staging TH is at most 0.6)
    summary.torsoAtLastHeavyAttempt = sb.torso;
    await press('KeyG');
    for (let k = 0; k < 150; k++) { s = await step(true); if (k % 10 === 0 || trail.at(-1)?.st !== s.st) trail.push({ a: attempts, k, st: s.st, down: s.down }); }
    if ((await page.evaluate((b) => (globalThis.__v3Rules.last ?? []).slice(b).some((e) => e.result.part === 'torso'), rulesBefore))) break;
    if (process.env.V) console.error('heavy attempt', attempts, 'no result; hero phase', await phase());
  }
  summary.heavyAttempts = attempts + 1;
  summary.heavyResult = await page.evaluate((b) => (globalThis.__v3Rules.last ?? []).slice(b).map((e) => `${e.input.swing}@${e.input.handSpeed.toFixed(1)}m/s ${e.input.zone}:${e.result.outcome} dmg${e.result.damage.toFixed(1)} ${e.result.part}->${e.result.partHpAfter?.toFixed?.(1)} act=${e.presentation.action}${e.presentation.deferredKill ? '(deferredKill)' : ''}`), rulesBefore);
  summary.heavyHits = tot.heroHits.filter((x) => Number(x.slice(1, x.indexOf(':'))) > heavyStart);
  summary.heavyFalls = tot.falls.slice(fallsBefore); summary.heavyKnockdownTicks = tot.ragdollKnockdownTicks - base0; summary.heavyTrail = trail;
  summary.heavyFell = summary.heavyFalls.length > 0 || summary.heavyKnockdownTicks > 0;
} else if (mode === 'counter') {
  const log = []; let pressed = 0, waited = 0;
  while (pressed < Number(process.env.MAXP ?? 12) && waited < Number(process.env.MAXWAIT ?? 30000)) {
    const s = await snap();
    if (/windup|active|attack/.test(s.fphase)) { const before = tot.heroHits.length; log.push({ n: pressed + 1, foePhase: s.fphase }); await press('KeyF'); pressed++; for (let k = 0; k < 90; k++) await step(false); log.at(-1).hit = tot.heroHits.length - before; }
    else { await step(false); waited++; }
  }
  for (let k = 0; k < 60; k++) await step(false);
  summary.pressed = pressed; summary.waitedTicks = waited; summary.perPress = log; summary.rulesLast = await page.evaluate(() => (globalThis.__v3Rules.last ?? []).map((e) => `${e.input.swing}@${e.input.handSpeed.toFixed(1)}m/s ${e.input.zone}:${e.result.outcome} ${e.result.part}->${e.result.partHpAfter?.toFixed?.(1)} act=${e.presentation.action}`));
} else if (mode === 'cuts') {
  for (let i = 0; i < 24; i++) { await press(i % 3 === 2 ? 'KeyG' : 'KeyF'); for (let k = 0; k < 90; k++) await step(false); }
  summary.cuts = await page.evaluate(() => ({ cuts: globalThis.__v3Rules.cuts, byOutcome: globalThis.__v3Rules.byOutcome, hits: globalThis.__v3Rules.hits, zones: (globalThis.__v3Rules.last ?? []).map((e) => `${e.input.swing}@${e.input.handSpeed.toFixed(1)} ${e.input.zone}:${e.result.outcome} ${e.result.part}->${e.result.partHpAfter?.toFixed?.(1)} act=${e.presentation.action}${e.presentation.deferredKill ? '(deferredKill)' : ''}`) }));
}
if (process.env.STILL) await page.screenshot({ path: process.env.STILL });
Object.assign(summary, { heroHits: tot.heroHits.length, heroHitList: tot.heroHits, allKnockedDownEvents: tot.falls, ragdollKnockdownTicks: tot.ragdollKnockdownTicks, simDownTicks: tot.simDownTicks, ragdollStates: [...tot.states],
  rules: await page.evaluate(() => { const r = globalThis.__v3Rules; return r && { hits: r.hits, byOutcome: r.byOutcome }; }) });
console.log(JSON.stringify(summary, null, 1));
writeFileSync(`${out}/${mode}.summary.json`, JSON.stringify(summary, null, 1));
await browser.close();
