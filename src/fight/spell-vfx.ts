import * as THREE from 'three';
import type { Fighter } from './duel.ts';
import { healRows, vfxOf, vfxScaleAt, VFX_GROUND_Y as GROUND_Y } from './sandbox-rules.ts';

// sandbox-mech: the spells' own looks (Dom 2026-10-17: "low res, cheap, tacky": 2026, AAA). Five looks (heal, start dust shock, Ash Fall, Wind Wall, Nyx Nightfall), each built from the same few parts: noise-eroded shader surfaces (a tiling fbm texture made once here),
// view-facing smoke puffs that erode as they age, four-point glints, and one short coloured light that washes the sand and the fighters. Presentation only: tick-driven (a replay draws the same frames), it reads events and positions and never writes the duel.
// Budget (Strategy): every material and the one light are built at scene creation and compiled by warm() (no new shader program at a cast: the engage hitch); nothing is built without `spellHeal` rows (trunk); a hidden object costs nothing to draw.
// Donor shapes (study docs/specs/combat/spell-effects-donors.md): World of Claudecraft's pillar + ring + burst (MIT), Duelyst's rising dots and ash values (CC0); the code is ours.
type Ev = { type: string; actor: number; target?: number; spell?: string; tick: number; heal?: number };
type At = Pick<Fighter, 'body'>;
type Inst = { objs: THREE.Object3D[]; start(x: number, z: number): void; update(age: number): { light: number; color: string } | undefined; ticks: number };

const NOISE = 256, GLINT = 64;   // 256 px grain (was 128: the "low-res" look on a phone)
// Nyx pass 2 (study docs/specs/combat/spell-effects-aaa-study.md): a 1D colour ramp (black-violet edge to white-hot core) sampled by the grain value instead of a flat two-colour mix. Sandbox constant like the other looks' colours; moves to a row at promotion.
const NYX_RAMP: readonly [number, string][] = [[0, '#040308'], [0.4, '#17121f'], [0.65, '#3a2c52'], [0.85, '#8a72b8'], [1, '#e6dff2']];   // ashen, not saturated: gritty gladiator dusk with a cold violet heat at the core
// Ash Fall pass 2: the ember ramp (soot black, dull iron red, orange, pale yellow at the hottest point); a dark ash plume with hot veins at the core, a scorched ragged stain, embers that linger.
const ASH_RAMP: readonly [number, string][] = [[0, '#060403'], [0.35, '#1f120d'], [0.55, '#5c1c0a'], [0.75, '#c2410c'], [0.9, '#f59e3b'], [1, '#fff1c2']];
// Pass 2 ramps for the other three looks (dark body to pale hot edge): sand and dust for the roar, grey-green and pale for the wind, deep green to gold-white for the heal.
const SAND_RAMP: readonly [number, string][] = [[0, '#1a130d'], [0.35, '#5a4733'], [0.6, '#b89a6c'], [0.82, '#e8d5aa'], [1, '#fffaf0']];
const WIND_RAMP: readonly [number, string][] = [[0, '#181d22'], [0.35, '#55646e'], [0.6, '#aebfc9'], [0.82, '#e6eff3'], [1, '#ffffff']];   // cool pale air, not poison green
const HEAL_RAMP: readonly [number, string][] = [[0, '#0a1608'], [0.35, '#2f6a28'], [0.6, '#8cc84a'], [0.82, '#f0e08a'], [1, '#fffbe6']];
const NYX_GATHER_TICKS = 120;   // the default cast windup (2 s); the gather ends early when the cast lands, fizzles or is cut
const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const value = (x: number, y: number, cells: number, s: number) => { const fx = (x / NOISE) * cells, fy = (y / NOISE) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), w = (i: number, j: number) => hash((x0 + i) % cells, (y0 + j) % cells, s); return (w(0, 0) * (1 - sx) + w(1, 0) * sx) * (1 - sy) + (w(0, 1) * (1 - sx) + w(1, 1) * sx) * sy; };   // tiles: lattice indices wrap at `cells`
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rnd = (i: number, s: number) => hash(i, 17, s);   // a stable 0..1 per (part, seed)

type Vfx = { warm(compile: () => void): void; trigger(events: readonly Ev[], fighters: readonly At[]): void; update(tick: number): void };
export function createSpellVfx(scene: THREE.Scene): Vfx {
  const insts: Record<string, Inst[]> = {};
  let light: THREE.PointLight | null = null;
  if (healRows() === 0) return { warm: () => undefined, trigger: () => undefined, update: () => undefined };   // the sandbox switch: no heal rows (trunk) builds nothing

  const px = new Uint8Array(NOISE * NOISE * 4);
  for (let y = 0; y < NOISE; y++) for (let x = 0; x < NOISE; x++) { const v = 0.5 * value(x, y, 4, 1) + 0.3 * value(x, y, 8, 2) + 0.2 * value(x, y, 16, 3); px.set([255 * v, 255 * v, 255 * v, 255], (y * NOISE + x) * 4); }
  const noise = new THREE.DataTexture(px, NOISE, NOISE); noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.magFilter = noise.minFilter = THREE.LinearFilter; noise.needsUpdate = true;
  const gp = new Uint8Array(GLINT * GLINT * 4);   // a bright core with a thin four-point cross
  for (let y = 0; y < GLINT; y++) for (let x = 0; x < GLINT; x++) { const dx = (x - (GLINT - 1) / 2) / ((GLINT - 1) / 2), dy = (y - (GLINT - 1) / 2) / ((GLINT - 1) / 2), r = Math.hypot(dx, dy), v = Math.min(1, Math.exp(-r * 7) + 0.55 * (Math.exp(-Math.abs(dx) * 38 - Math.abs(dy) * 2.6) + Math.exp(-Math.abs(dy) * 38 - Math.abs(dx) * 2.6))); gp.set([255, 255, 255, 255 * v * Math.max(0, 1 - r)], (y * GLINT + x) * 4); }
  const glintTex = new THREE.DataTexture(gp, GLINT, GLINT); glintTex.magFilter = glintTex.minFilter = THREE.LinearFilter; glintTex.needsUpdate = true;

  const makeRamp = (stops: readonly [number, string][]) => {   // a 256 x 1 colour ramp, sampled by a grain value in the shaders
    const rp = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) { const v = i / 255, hi = Math.max(1, stops.findIndex(([s]) => s >= v)), [s0, c0] = stops[hi - 1]!, [s1, c1] = stops[hi]!, col = new THREE.Color(c0).lerp(new THREE.Color(c1), clamp01((v - s0) / (s1 - s0 || 1))); rp.set([col.r * 255, col.g * 255, col.b * 255, 255], i * 4); }
    const t = new THREE.DataTexture(rp, 256, 1); t.magFilter = t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
  };
  const nyxRamp = makeRamp(NYX_RAMP), ashRamp = makeRamp(ASH_RAMP), sandRamp = makeRamp(SAND_RAMP), windRamp = makeRamp(WIND_RAMP), healRamp = makeRamp(HEAL_RAMP);

  const VERT ='varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
  const BILL = 'varying vec2 vUv; uniform float uSize; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); gl_Position = projectionMatrix * (c + vec4(position.xy * uSize * length(modelMatrix[0].xyz), 0.0, 0.0)); }';   // a puff grows with its group's scale
  const HEAD = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform sampler2D uNoise; uniform float uK; uniform float uT; uniform float uSeed; uniform float uHot; uniform float uAlpha; uniform vec3 uA; uniform vec3 uB; uniform sampler2D uRamp; uniform float uUseRamp;';
  const mat = (vertex: string, frag: string, side: THREE.Side = THREE.DoubleSide) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side, vertexShader: vertex, fragmentShader: frag,
    uniforms: { uNoise: { value: noise }, uK: { value: 0 }, uT: { value: 0 }, uSeed: { value: 0 }, uHot: { value: 0 }, uAlpha: { value: 1 }, uSize: { value: 1 }, uRamp: { value: nyxRamp }, uUseRamp: { value: 0 }, uA: { value: new THREE.Color('#fff') }, uB: { value: new THREE.Color('#fff') } } });
  const set = (m: THREE.Mesh, p: Record<string, number | string | THREE.Texture>) => { const u = (m.material as THREE.ShaderMaterial).uniforms; for (const [k, v] of Object.entries(p)) { if (typeof v === 'object') u[k]!.value = v; else if (typeof v === 'string') (u[k]!.value as THREE.Color).set(v); else u[k]!.value = v; } };
  const FRAG = {
    // a column of light: rim-lit, thin in the middle, revealed from the foot, eroded by the grain as it ends
    pillar: `${HEAD} void main(){ float y = vUv.y; vec2 p = vec2(vUv.x * 3.0, y * 1.4 - uT * 0.9); float n = texture2D(uNoise, p).r * 0.6 + texture2D(uNoise, p * 2.3 + 0.37).r * 0.4;
      float h = min(1.0, uK * 3.2), reveal = 1.0 - smoothstep(h - 0.12, h, y), erode = smoothstep(uK * 0.95, uK * 0.95 + 0.2, n), body = pow(1.0 - y, 0.7); float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
      float a = reveal * erode * body * smoothstep(0.0, 0.06, uK) * (0.1 + 0.26 * rim) * uAlpha; gl_FragColor = vec4(mix(uA, uB, n * n + (1.0 - y) * 0.25), a); }`,
    // a view-facing puff of smoke or dust: soft body, grain-eroded edge, lit from above, hot at the core while young
    puff: `${HEAD} void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float mask = 1.0 - smoothstep(0.35, 1.0, r); vec2 p = vUv * 1.6 + vec2(uSeed * 7.31, uSeed * 3.17) + vec2(0.0, -uK * 0.35);
      float n = texture2D(uNoise, p).r * 0.65 + texture2D(uNoise, p * 2.7 + 0.5).r * 0.35; float erode = smoothstep(uK * 0.85, uK * 0.85 + 0.25, n);
      float a = mask * erode * uAlpha * (1.0 - uK * 0.5) * smoothstep(0.0, 0.08, uK); float lit = clamp(n * 1.3 - c.y * 0.9 + 0.2, 0.0, 1.0);
      vec3 col = mix(uA * (0.55 + 0.6 * lit), uB, uHot * (1.0 - r) * n); if (uUseRamp > 0.5) col = texture2D(uRamp, vec2(clamp(n * (0.4 + 0.6 * lit) + uHot * (1.0 - r) * 0.55, 0.0, 1.0), 0.5)).rgb; gl_FragColor = vec4(col, a); }`,
    // a funnel: swirling grain that climbs and turns, wider at the top
    funnel: `${HEAD} void main(){ float y = vUv.y; float ang = vUv.x * 6.2832; vec2 p = vec2(vUv.x * 5.0 + y * 1.6 - uT * 1.4, y * 2.2 - uT * 0.6); float n = texture2D(uNoise, p).r * 0.6 + texture2D(uNoise, p * 2.1 + 0.2).r * 0.4;
      float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.1); float h = min(1.0, uK * 4.0), reveal = 1.0 - smoothstep(h - 0.15, h, y); float erode = smoothstep(uK * 0.9, uK * 0.9 + 0.25, n);
      float a = reveal * erode * (0.2 + 0.65 * rim) * (0.35 + 0.65 * y) * smoothstep(0.0, 0.05, uK) * uAlpha; gl_FragColor = vec4(mix(uA, uB, n), a); }`,
    // a ragged ground stain (Dom 2026-10-17: the ring was "a perfect purple circle, stuck on, not gritty"): the edge wanders with the grain around the angle, the body is dark ash with grit, and thin ridged veins glow from the ramp (uHot = how hot); no hard rim, no flat colour
    stain: `${HEAD} void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0, a = atan(c.y, c.x); vec2 w = vec2(cos(a), sin(a)); float warp = texture2D(uNoise, w * 0.35 + 0.5 + uSeed).r * 0.55 + texture2D(uNoise, w * 0.9 + 0.2 + uT * 0.02).r * 0.3;
      float g = texture2D(uNoise, vUv * 5.0 + uSeed).r, g2 = texture2D(uNoise, vUv * 2.3 + 0.37).r; float edge = 0.5 + 0.4 * warp, body = 1.0 - smoothstep(edge - 0.3, edge, r + (g - 0.5) * 0.3);
      float vein = (1.0 - smoothstep(0.0, 0.09, abs(g2 - 0.5))) * body * (1.0 - smoothstep(0.2, 0.95, r)); float fade = 1.0 - smoothstep(0.7, 1.0, uK);
      vec3 col = uA * (0.5 + 0.9 * g); if (uUseRamp > 0.5) col = mix(col, texture2D(uRamp, vec2(0.5 + 0.4 * g, 0.5)).rgb, vein * uHot);
      gl_FragColor = vec4(col, body * (0.5 + 0.45 * g) * fade * uAlpha); }`,
    // an expanding ragged ring on the ground (a shock or a blown wave of dust): a thick trailing band behind a sharp front that wanders with the grain around the angle, gritty, from the ramp; uK is how far it has travelled
    wave: `${HEAD} void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0, an = atan(c.y, c.x); vec2 w = vec2(cos(an), sin(an)); float warp = texture2D(uNoise, w * 0.4 + 0.5 + uSeed).r, g = texture2D(uNoise, vUv * 6.0 + uT * 0.1).r;
      float front = 0.1 + 0.9 * uK, rr = r + (warp - 0.5) * 0.28, band = smoothstep(front - 0.4, front - 0.04, rr) * (1.0 - smoothstep(front - 0.04, front + 0.03, rr)); float al = band * (0.3 + 0.7 * g) * (1.0 - smoothstep(0.55, 1.0, uK)) * uAlpha;
      vec3 col = uUseRamp > 0.5 ? texture2D(uRamp, vec2(clamp(0.5 + 0.45 * g + 0.2 * band, 0.0, 1.0), 0.5)).rgb : uA; gl_FragColor = vec4(col, min(1.0, al * 1.5)); }`,
    // a curved blade of wind, facing the camera: a thin bright crescent that sweeps across and fades (uSeed turns it, uK is the sweep)
    slash: `${HEAD} void main(){ vec2 p = (vUv - 0.5) * 2.0; float an = uSeed * 6.2832, cs = cos(an), sn = sin(an); p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
      float d = length(p - vec2(0.0, -1.1)), dd = abs(d - 1.55), core = 1.0 - smoothstep(0.0, 0.2, dd), halo = 0.28 * (1.0 - smoothstep(0.0, 0.65, dd)), hot = 1.0 - smoothstep(0.0, 0.08, dd); float sweep = -1.3 + 2.8 * uK, head = 1.0 - smoothstep(sweep - 0.25, sweep, p.x), taper = 1.0 - smoothstep(0.3, 1.05, abs(p.x));
      float g = 0.65 + 0.35 * texture2D(uNoise, vUv * 3.0 + uSeed).r, al = (core + halo) * head * taper * g * (1.0 - smoothstep(0.55, 1.0, uK)) * uAlpha; gl_FragColor = vec4(texture2D(uRamp, vec2(clamp(0.45 + 0.55 * (hot * 0.8 + core * 0.4), 0.0, 1.0), 0.5)).rgb, min(1.0, al * 1.6)); }`,
    // an inside-out dome: deep colour, grain stars, fades in and out
    dome: `${HEAD} void main(){ float n = texture2D(uNoise, vUv * vec2(3.0, 1.5) + uT * 0.02).r; float star = smoothstep(0.80, 0.83, texture2D(uNoise, vUv * vec2(14.0, 7.0)).r); float fade = smoothstep(0.0, 0.18, uK) * (1.0 - smoothstep(0.72, 1.0, uK));
      float a = fade * (0.50 + 0.2 * n) * uAlpha; vec3 col = mix(uA, uB, n * 0.6) + vec3(star * 0.9); if (uUseRamp > 0.5) col = texture2D(uRamp, vec2(0.12 + 0.3 * n, 0.5)).rgb + vec3(star * 0.9);
      float flash = uHot; gl_FragColor = vec4(col + vec3(0.55, 0.35, 0.95) * flash, min(1.0, a + fade * star * 0.6 + flash * 0.5)); }`,
  } as const;
  const surface = (frag: string, geo: THREE.BufferGeometry, side?: THREE.Side) => { const m = new THREE.Mesh(geo, mat(VERT, frag, side)); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
  const slash = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(BILL, FRAG.slash)); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
  const puff = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(BILL, FRAG.puff)); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
  const glints = (n: number, color: string, size: number) => Array.from({ length: n }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); s.visible = false; s.frustumCulled = false; scene.add(s); return s; });
  const sop = (s: THREE.Sprite, v: number) => { (s.material as THREE.SpriteMaterial).opacity = v; };

  // ---- the five looks. start(x, z) places an instance; update(age) poses it and returns its light, or undefined once done.
  const heal = (): Inst => {
    const glow = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), pillar = surface(FRAG.pillar, new THREE.CylinderGeometry(0.6, 0.6, 3.2, 40, 1, true)), motes = glints(24, '#fff0b0', 0.3), bloom = smoke(3, '#fff0b8', '#ffffff', 1);
    set(glow, { uA: '#4a7a30', uSeed: 0.6, uUseRamp: 1, uRamp: healRamp }); set(pillar, { uA: '#9fd36a', uB: '#fff6c8' }); for (const p of bloom) set(p, { uUseRamp: 1, uRamp: healRamp }); let x = 0, z = 0; const ticks = 96;
    return { ticks, objs: [glow, pillar, ...bloom, ...motes], start(px_, pz) { x = px_; z = pz; },   // a glowing sigil on the ground (ragged, veined), a rim-lit column of light, soft bloom puffs, motes lifting
      update(age) { const k = age / ticks, out = 1 - (1 - k) ** 3, inn = Math.min(1, age / 10); glow.position.set(x, 0.05, z); glow.scale.setScalar(0.9 + 0.9 * out); set(glow, { uK: k, uT: age / 60, uAlpha: 0.6 * inn, uHot: 0.95 * (1 - 0.6 * k) });
        pillar.position.set(x, 1.6, z); pillar.scale.set(1 + 0.18 * k, 1, 1 + 0.18 * k); set(pillar, { uK: k, uT: age / 60 });
        bloom.forEach((p, i) => { const t = clamp01((age - i * 6) / 60); p.position.set(x, 0.7 + t * 1.5, z); set(p, { uSize: 1.7 + t, uK: t, uSeed: rnd(i, 4), uHot: 1, uAlpha: 0.4 * Math.sin(Math.PI * t) }); });
        motes.forEach((m, i) => { const t = clamp01((age - (i / 24) * 40) / 52), a = i * 2.4 + age * 0.12, r = 0.2 + 0.5 * (1 - 0.5 * t); m.position.set(x + Math.cos(a) * r, 0.1 + t * 2.7, z + Math.sin(a) * r); m.scale.setScalar(0.3 * (1 - 0.4 * t)); sop(m, 0.95 * Math.sin(Math.PI * t)); });
        return { light: Math.sin(Math.PI * Math.min(1, k * 1.25)), color: '#d6f59a' }; } };
  };
  const healGather = (): Inst => {   // the heal's windup: a faint warm sigil spreads under the caster and motes drift up
    const sc = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), mo = glints(16, '#fff0b0', 0.22); set(sc, { uA: '#1c3a14', uSeed: 0.9, uUseRamp: 1, uRamp: healRamp }); let x = 0, z = 0;
    return { ticks: NYX_GATHER_TICKS, objs: [sc, ...mo], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / NYX_GATHER_TICKS, build = Math.min(1, k * 1.4); sc.position.set(x, 0.05, z); sc.scale.setScalar(0.5 + 0.9 * build); set(sc, { uK: 0, uT: age / 60, uAlpha: 0.15 + 0.6 * build, uHot: 0.2 + 0.7 * build });
        mo.forEach((m, i) => { const t = (age * 0.012 + rnd(i, 3)) % 1, a = rnd(i, 4) * 6.283, r = 0.3 + 0.6 * rnd(i, 5); m.position.set(x + Math.cos(a) * r, 0.1 + t * 2.0, z + Math.sin(a) * r); m.scale.setScalar(0.16 + 0.1 * build); sop(m, 0.85 * Math.sin(Math.PI * t) * (0.25 + 0.75 * build)); });
        return { light: 0.3 * build, color: '#cfe89a' }; } };
  };
  const smoke = (n: number, a: string, b: string, hot: number) => { const ps = Array.from({ length: n }, puff); for (const p of ps) set(p, { uA: a, uB: b, uHot: hot }); return ps; };
  const shock = (): Inst => {   // the start spell: a dust shock rolls out from the target
    const crack = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), wave = surface(FRAG.wave, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), wave2 = surface(FRAG.wave, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), dust = smoke(12, '#3a2c20', '#f6ead2', 0.6), rock = smoke(10, '#150f0a', '#5a4632', 0), [flashS] = glints(1, '#fff1d0', 1);
    set(crack, { uA: '#120d08', uSeed: 0.2, uUseRamp: 1, uRamp: sandRamp }); set(wave, { uA: '#8c6f4c', uSeed: 0.35, uUseRamp: 1, uRamp: sandRamp }); set(wave2, { uA: '#8c6f4c', uSeed: 0.8, uUseRamp: 1, uRamp: sandRamp }); for (const p of [...dust, ...rock]) set(p, { uUseRamp: 1, uRamp: sandRamp }); let x = 0, z = 0; const ticks = 90;
    return { ticks, objs: [crack, wave, wave2, ...dust, ...rock, flashS!], start(px_, pz) { x = px_; z = pz; },   // Storm-Demon's Roar: a ragged ring of dust tears out across the sand, cracks open, dust billows and rubble is thrown up
      update(age) { const k = age / ticks, out = 1 - (1 - k) ** 3, flash = Math.exp(-age / 3.5), inn = Math.min(1, age / 5);
        crack.position.set(x, 0.04, z); crack.scale.setScalar(1.4 + 0.9 * out); set(crack, { uK: k, uT: age / 60, uAlpha: 0.9 * inn, uHot: 0.6 * (1 - k) + flash * 0.4 });
        wave.position.set(x, 0.06, z); wave.scale.setScalar(3.6); set(wave, { uK: k, uT: age / 60, uAlpha: 1 }); wave2.position.set(x, 0.08, z); wave2.scale.setScalar(3.6); set(wave2, { uK: clamp01(k * 1.25 - 0.12), uT: age / 60, uAlpha: 0.7 });
        dust.forEach((p, i) => { const t = clamp01((age - rnd(i, 1) * 6) / (ticks - 6)), a = (i / 12) * 6.283 + rnd(i, 2), r = 0.3 + (0.2 + 2.6 * (1 - (1 - t) ** 2)) * (0.6 + 0.6 * rnd(i, 3)); p.position.set(x + Math.cos(a) * r, 0.2 + t * (0.9 + rnd(i, 6)), z + Math.sin(a) * r); set(p, { uSize: 1.1 + 2.5 * t, uK: t, uSeed: rnd(i, 4), uHot: 0.9 * (1 - 0.7 * t) + flash * 0.5, uAlpha: 0.85 }); });   // pale, billowing dust (lit from the flash), not a muddy brown smear
        flashS.position.set(x, 0.9, z); flashS.scale.setScalar(3.2 * flash); sop(flashS, 0.85 * flash);
        rock.forEach((p, i) => { const t = (age - rnd(i, 5) * 4) / 60; if (t < 0 || t > 1.1) { p.visible = false; return; } p.visible = true; const a = rnd(i, 6) * 6.283, v = 1.5 + 2.4 * rnd(i, 7), up = 3.2 + 3.0 * rnd(i, 8); p.position.set(x + Math.cos(a) * v * t, Math.max(GROUND_Y, 0.3 + up * t - 4.9 * t * t), z + Math.sin(a) * v * t); set(p, { uSize: 0.16 + 0.12 * rnd(i, 9), uK: 0.1 + 0.5 * t, uSeed: rnd(i, 4), uHot: 0, uAlpha: 1 }); });   // chunks arc out, fall and vanish on the sand
        return { light: Math.max(flash * 1.1, 0.25 * (1 - k)), color: '#ffd9a0' }; } };
  };
  const shockGather = (): Inst => {   // the roar's windup: dust is pulled in toward the caster and a crack stain spreads under the feet
    const sc = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), dust = smoke(8, '#3a2c20', '#d2b98a', 0.3); set(sc, { uA: '#120d08', uSeed: 0.55, uUseRamp: 1, uRamp: sandRamp }); for (const p of dust) set(p, { uUseRamp: 1, uRamp: sandRamp }); let x = 0, z = 0;
    return { ticks: NYX_GATHER_TICKS, objs: [sc, ...dust], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / NYX_GATHER_TICKS, build = Math.min(1, k * 1.4); sc.position.set(x, 0.05, z); sc.scale.setScalar(0.5 + 1.0 * build); set(sc, { uK: 0, uT: age / 60, uAlpha: 0.2 + 0.6 * build, uHot: 0.3 + 0.5 * build });
        dust.forEach((p, i) => { const t = (age * 0.012 + rnd(i, 3)) % 1, a = rnd(i, 4) * 6.283 + age * 0.01, r = 2.0 * (1 - t) + 0.3; p.position.set(x + Math.cos(a) * r, 0.2 + t * 0.7, z + Math.sin(a) * r); set(p, { uSize: 0.5 + 0.4 * build, uK: t, uSeed: rnd(i, 5), uHot: 0.2, uAlpha: 0.5 * Math.sin(Math.PI * t) * (0.3 + 0.7 * build) }); });
        return { light: 0.15 * build, color: '#e0c89a' }; } };
  };
  const ash = (): Inst => {   // Ash Fall: a roiling column of ash with a hot core, embers thrown up, a flash
    const ps = smoke(8, '#2a211c', '#ff8a2e', 1), em = glints(30, '#ff9a3c', 0.24), scorch = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), glow = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
    set(scorch, { uA: '#0b0705', uSeed: 0.3 }); set(glow, { uA: '#1a0d07', uSeed: 0.8, uUseRamp: 1, uRamp: ashRamp }); for (const p of ps) set(p, { uUseRamp: 1, uRamp: ashRamp }); let x = 0, z = 0; const ticks = 120;
    return { ticks, objs: [scorch, glow, ...ps, ...em], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / ticks, flash = Math.exp(-age / 4), inn = Math.min(1, age / 8);   // a white-hot flash frame, then the plume climbs and darkens while the ground keeps its scorch
        scorch.position.set(x, 0.04, z); scorch.scale.setScalar(2.2 + 0.8 * (1 - (1 - k) ** 3)); set(scorch, { uK: k, uT: age / 60, uAlpha: 0.85 * inn });
        glow.position.set(x, 0.05, z); glow.scale.setScalar(1.3 + 0.7 * (1 - (1 - k) ** 3)); set(glow, { uK: k, uT: age / 60, uAlpha: inn, uHot: Math.max(flash, 0.9 * (1 - k * 1.2)) });
        ps.forEach((p, i) => { const t = clamp01((age - rnd(i, 1) * 14) / (ticks - 14)), a = i * 2.4, r = 0.25 + 0.5 * t * rnd(i, 2); p.position.set(x + Math.cos(a) * r, 0.3 + t * (2.2 + rnd(i, 3)), z + Math.sin(a) * r); set(p, { uSize: 0.9 + 1.8 * t, uK: t, uSeed: rnd(i, 4), uHot: Math.max(0, 1 - t * 1.5) + flash * 0.6, uAlpha: 0.7 }); });
        em.forEach((s, i) => { const t = (age - rnd(i, 5) * 10) / 60, life = clamp01(t / 1.6); if (t < 0 || t > 1.6) { s.visible = false; return; } s.visible = true; const a = rnd(i, 6) * 6.283, v = 0.8 + 1.8 * rnd(i, 7), up = 3.0 + 2.6 * rnd(i, 8); s.position.set(x + Math.cos(a) * v * t, Math.max(GROUND_Y, 0.3 + up * t - 4.2 * t * t), z + Math.sin(a) * v * t); sop(s, 0.95 * (1 - life) * (0.6 + 0.4 * Math.sin(age * 1.7 + i * 2))); s.scale.setScalar(0.24 * (1 - 0.6 * life)); });   // embers arc up, fall back and sputter out on the ground
        return { light: Math.max(flash * 1.4, 0.45 * (1 - k)), color: '#ff7a2a' }; } };
  };
  // Ash Fall's anticipation: heat builds around the caster: a scorch creeps out under the feet, ember veins heat up, sparks lift off the ground. Ends when the cast lands or is cut.
  const ashGather = (): Inst => {
    const sc = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), em = glints(18, '#ff9a3c', 0.2); set(sc, { uA: '#140b07', uSeed: 0.45, uUseRamp: 1, uRamp: ashRamp }); let x = 0, z = 0;
    return { ticks: NYX_GATHER_TICKS, objs: [sc, ...em], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / NYX_GATHER_TICKS, build = Math.min(1, k * 1.4); sc.position.set(x, 0.05, z); sc.scale.setScalar(0.5 + 1.0 * build); set(sc, { uK: 0, uT: age / 60, uAlpha: 0.2 + 0.7 * build, uHot: 0.2 + 0.8 * build });
        em.forEach((s, i) => { const t = (age * 0.014 + rnd(i, 3)) % 1, a = rnd(i, 4) * 6.283, r = 0.3 + 0.9 * rnd(i, 5) * build; s.position.set(x + Math.cos(a) * r, 0.1 + t * 1.8, z + Math.sin(a) * r); s.scale.setScalar(0.12 + 0.12 * build); sop(s, 0.9 * Math.sin(Math.PI * t) * (0.2 + 0.8 * build)); });
        return { light: 0.4 * build, color: '#e0601c' }; } };
  };
  const wind = (): Inst => {   // Wind Wall: a funnel of grain turning over the target, dust at its foot, leaves in the air
    const f = surface(FRAG.funnel, new THREE.CylinderGeometry(1.15, 0.28, 3.6, 48, 1, true)), wave = surface(FRAG.wave, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), dust = smoke(7, '#2b3a2c', '#bcd4b4', 0.3), lv = glints(18, '#d8e8b0', 0.22), blades = Array.from({ length: 5 }, slash), [flashS] = glints(1, '#eafff0', 1);
    set(f, { uA: '#3d4a3c', uB: '#cfe0c6' }); set(wave, { uA: '#6c8a6a', uSeed: 0.5, uUseRamp: 1, uRamp: windRamp }); for (const p of dust) set(p, { uUseRamp: 1, uRamp: windRamp }); for (const b of blades) set(b, { uUseRamp: 1, uRamp: windRamp }); let x = 0, z = 0; const ticks = 100;
    return { ticks, objs: [wave, f, ...dust, ...lv, ...blades, flashS!], start(px_, pz) { x = px_; z = pz; },   // Sickle Wind: curved blades of wind slash across the target, a funnel of grain turns, a ragged ring of dust and leaves blows out
      update(age) { const k = age / ticks, out = 1 - (1 - k) ** 3, flash = Math.exp(-age / 3); wave.position.set(x, 0.06, z); wave.scale.setScalar(3.6); set(wave, { uK: k, uT: age / 60, uAlpha: 0.95 });
        f.position.set(x, 1.8, z); f.scale.set(1 + 0.25 * k, 1, 1 + 0.25 * k); set(f, { uK: k, uT: age / 60, uAlpha: 0.6 * Math.min(1, age / 6) });
        blades.forEach((b, i) => { const t = clamp01((age - 1 - i * 3) / 20), off = (rnd(i, 1) - 0.5) * 1.4; b.position.set(x + Math.cos(i * 1.7) * 0.4, 1.1 + off * 0.5, z + Math.sin(i * 1.7) * 0.4); set(b, { uSize: 5.4, uK: t, uSeed: [0.06, 0.94, 0.14, 0.86, 0.0][i]!, uAlpha: 1 }); });   // five blades criss-cross within a few ticks, thick with a soft halo
        flashS.position.set(x, 1.2, z); flashS.scale.setScalar(3.4 * flash); sop(flashS, 0.9 * flash);
        dust.forEach((p, i) => { const t = clamp01((age - rnd(i, 1) * 10) / (ticks - 10)), a = i * 0.9 + age * 0.05, r = 0.5 + 2.2 * out * (0.6 + 0.5 * rnd(i, 3)); p.position.set(x + Math.cos(a) * r, 0.3 + t * 0.7, z + Math.sin(a) * r); set(p, { uSize: 1.0 + 1.3 * t, uK: t, uSeed: rnd(i, 4), uHot: 0.2, uAlpha: 0.55 }); });
        lv.forEach((s, i) => { const t = clamp01((age - rnd(i, 2) * 20) / 70), a = i * 0.35 + age * (0.09 + 0.05 * rnd(i, 3)), r = 0.4 + 1.6 * t; s.position.set(x + Math.cos(a) * r, 0.2 + t * 3.0, z + Math.sin(a) * r); sop(s, 0.85 * Math.sin(Math.PI * t)); });
        return { light: Math.max(0.5 * Math.exp(-age / 6), 0.2 * Math.sin(Math.PI * Math.min(1, k * 1.4))), color: '#e4f0d4' }; } };
  };
  const windGather = (): Inst => {   // the windup: grit and leaves spiral in toward the caster, a ragged wind-scoured patch spreads on the sand
    const sc = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), dust = smoke(6, '#2b3a2c', '#a8c4a0', 0.2), lv = glints(16, '#d8e8b0', 0.2); set(sc, { uA: '#1d261d', uSeed: 0.65, uUseRamp: 1, uRamp: windRamp }); for (const p of dust) set(p, { uUseRamp: 1, uRamp: windRamp }); let x = 0, z = 0;
    return { ticks: NYX_GATHER_TICKS, objs: [sc, ...dust, ...lv], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / NYX_GATHER_TICKS, build = Math.min(1, k * 1.4); sc.position.set(x, 0.05, z); sc.scale.setScalar(0.5 + 1.2 * build); set(sc, { uK: 0, uT: age / 60, uAlpha: 0.15 + 0.5 * build, uHot: 0.25 + 0.5 * build });
        dust.forEach((p, i) => { const t = (age * 0.013 + rnd(i, 3)) % 1, a = rnd(i, 4) * 6.283 + t * 5, r = 2.0 * (1 - t) + 0.3; p.position.set(x + Math.cos(a) * r, 0.2 + t * 0.9, z + Math.sin(a) * r); set(p, { uSize: 0.5 + 0.4 * build, uK: t, uSeed: rnd(i, 5), uHot: 0.2, uAlpha: 0.45 * Math.sin(Math.PI * t) * (0.3 + 0.7 * build) }); });
        lv.forEach((s, i) => { const t = (age * 0.015 + rnd(i, 6)) % 1, a = rnd(i, 7) * 6.283 + t * 6, r = 2.2 * (1 - t) + 0.3; s.position.set(x + Math.cos(a) * r, 0.2 + t * 1.8, z + Math.sin(a) * r); sop(s, 0.85 * Math.sin(Math.PI * t) * (0.3 + 0.7 * build)); });
        return { light: 0.12 * build, color: '#dfe8c8' }; } };
  };
  const nyx = (): Inst => {   // Nyx Nightfall: the arena goes dark under a grain-starred dome, shadow wisps gather on the target
    const d = surface(FRAG.dome, new THREE.SphereGeometry(13, 40, 20), THREE.BackSide), ws = smoke(9, '#150c24', '#7a4cc2', 0.5), pool = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), ring = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), motes = glints(14, '#c9a8ff', 0.3);
    set(d, { uA: '#0b0618', uB: '#2a1850', uUseRamp: 1 }); set(pool, { uA: '#06040a', uSeed: 0.7 }); set(ring, { uA: '#0d0a12', uSeed: 0.2, uUseRamp: 1 }); for (const p of ws) set(p, { uUseRamp: 1 }); let x = 0, z = 0; const ticks = 130;
    return { ticks, objs: [d, pool, ring, ...ws, ...motes], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / ticks, flash = Math.exp(-age / 3.5);   // the landing frame: one overbright violet flash, then the dark settles in
        d.position.set(x, 1.5, z); set(d, { uK: k, uT: age / 60, uAlpha: 1, uHot: flash });
        const inn = Math.min(1, age / 10);   // the stain bites in fast, then lingers and fades with the cast
        pool.position.set(x, 0.04, z); pool.scale.setScalar(6.5); set(pool, { uK: k, uT: age / 60, uAlpha: 0.7 * inn });
        ring.position.set(x, 0.05, z); ring.scale.setScalar(1.5 + 0.9 * (1 - (1 - k) ** 3)); set(ring, { uK: k, uT: age / 60, uAlpha: inn, uHot: Math.max(flash, 0.55 * (1 - k)) });
        ws.forEach((p, i) => { const t = clamp01((age - rnd(i, 1) * 20) / (ticks - 20)), a = i * 0.7 + age * 0.03, r = 1.4 * (1 - 0.55 * Math.sin(Math.PI * t)); p.position.set(x + Math.cos(a) * r, 0.5 + t * 1.8, z + Math.sin(a) * r); set(p, { uSize: 1.1 + 1.2 * t, uK: t, uSeed: rnd(i, 4), uHot: 0.8 * Math.sin(Math.PI * t), uAlpha: 0.62 }); });   // thinner than before (it read as a dense blue slab)
        motes.forEach((m, i) => { const t = clamp01((age - rnd(i, 2) * 30) / 80), a = i * 0.45 + age * 0.05; m.position.set(x + Math.cos(a) * (0.5 + 0.4 * t), 0.2 + t * 3.2, z + Math.sin(a) * (0.5 + 0.4 * t)); m.scale.setScalar(0.3 * (1 - 0.5 * t)); sop(m, 0.85 * Math.sin(Math.PI * t)); });
        return { light: Math.max(flash * 1.3, 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.2))), color: '#8a5cf0' }; } };
  };
  // Nyx's anticipation: during the windup, violet motes stream in to the caster and a dark ring tightens under them, building with the cast (study rule 2: the windup is free time). Ends at once when that caster's cast lands, fizzles or is cut.
  const nyxGather = (): Inst => {
    const ring = surface(FRAG.stain, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), motes = glints(16, '#b58cff', 0.26); set(ring, { uA: '#0d0a12', uSeed: 0.5, uUseRamp: 1 }); let x = 0, z = 0;
    return { ticks: NYX_GATHER_TICKS, objs: [ring, ...motes], start(px_, pz) { x = px_; z = pz; },
      update(age) { const k = age / NYX_GATHER_TICKS, build = Math.min(1, k * 1.4); ring.position.set(x, 0.05, z); ring.scale.setScalar(0.5 + 1.1 * build); set(ring, { uK: 0, uT: age / 60, uAlpha: 0.15 + 0.7 * build, uHot: 0.15 + 0.7 * build });   // a dark stain creeps out under the caster, its veins heating as the cast builds
        motes.forEach((m, i) => { const t = ((age * 0.011 + rnd(i, 3)) % 1), a = i * 0.39 + rnd(i, 4) * 6.283, r = 1.9 * (1 - t); m.position.set(x + Math.cos(a + t * 2) * r, 0.15 + t * 1.5, z + Math.sin(a + t * 2) * r); m.scale.setScalar(0.18 + 0.2 * build); sop(m, 0.9 * Math.sin(Math.PI * t) * (0.3 + 0.7 * build)); });
        return { light: 0.35 * build, color: '#7a4cc2' }; } };
  };
  const builders: Record<string, () => Inst> = { heal, healGather, shock, shockGather, ash, ashGather, wind, windGather, nyx, nyxGather };
  for (const [kind, build] of Object.entries(builders)) insts[kind] = [build(), build()];
  const groups = new Map<Inst, THREE.Group>(), wp = new THREE.Vector3();   // each look lives in a group so it can be scaled about its landing point
  for (const list of Object.values(insts)) for (const inst of list) { const g = new THREE.Group(); for (const o of inst.objs) g.add(o); scene.add(g); groups.set(inst, g); }
  const place = (inst: Inst, s: number, x: number, z: number) => { const g = groups.get(inst)!; g.scale.setScalar(s); g.position.set(x * (1 - s), 0, z * (1 - s)); };
  light = new THREE.PointLight('#ffffff', 0, 12, 2); scene.add(light);   // in the scene from the start (intensity 0 when idle): the lit materials are compiled with it
  const live: { inst: Inst; at: number }[] = []; for (const list of Object.values(insts)) for (const inst of list) live.push({ inst, at: -1 });
  const next: Record<string, number> = {}, gathering = new Map<number, Inst>();
  const show = (inst: Inst, v: boolean) => { for (const o of inst.objs) o.visible = v; };
  const find = (inst: Inst) => live.find((l) => l.inst === inst)!;
  return {
    /** Shows every part for one `compile()` so their shader programs and the light exist before the first cast, then hides them. */
    warm(compile: () => void): void {
      for (const l of live) show(l.inst, true);
      try { compile(); } catch { /* a lost context: the first cast pays as before */ }
      for (const l of live) show(l.inst, false);
    },
    trigger(events: readonly Ev[], fighters: readonly At[]): void {
      for (const e of events) {
        const gk = e.type === 'SpecialStarted' && e.spell ? `${vfxOf(e.spell)}Gather` : '';   // the windup begins: a look that has a gather plays it on the caster (nyxGather, ashGather)
        if (gk && insts[gk] && fighters[e.actor]) {
          const list = insts[gk]!, inst = list[(next[gk] = ((next[gk] ?? -1) + 1) % list.length)]!;
          inst.start(fighters[e.actor]!.body.x, fighters[e.actor]!.body.z); place(inst, 1, 0, 0); find(inst).at = e.tick; gathering.set(e.actor, inst); continue;
        }
        if (e.type === 'SpecialInterrupted' || e.type === 'SpecialFizzled' || e.type === 'SpecialLanded') { const g = gathering.get(e.actor); if (g) { find(g).at = -1; gathering.delete(e.actor); } }
        if (e.type !== 'SpecialLanded') continue;
        const kind = e.heal !== undefined ? 'heal' : e.spell ? vfxOf(e.spell) : undefined, who = fighters[e.heal !== undefined ? e.actor : (e.target ?? -1)];
        if (!kind || !who || !insts[kind]) continue;
        const list = insts[kind]!, inst = list[(next[kind] = ((next[kind] ?? -1) + 1) % list.length)]!, from = fighters[e.actor];
        const s = e.heal !== undefined || !from ? 1 : vfxScaleAt(100 * Math.hypot(who.body.x - from.body.x, who.body.z - from.body.z));   // Dom 2026-10-17: "didn't see much": spells land up to 25 m away, so the look grows with the distance (rows vfxScale*: 1x close, 3x from 10 m) to read on a phone
        inst.start(who.body.x, who.body.z); place(inst, s, who.body.x, who.body.z); find(inst).at = e.tick;
      }
    },
    update(tick: number): void {
      let best = 0, color = '#fff', bx = 0, bz = 0; const py = 1.3;
      for (const l of live) {
        const age = tick - l.at, alive = l.at >= 0 && age >= 0 && age < l.inst.ticks; show(l.inst, alive); if (!alive) continue;
        const r = l.inst.update(age); if (r && r.light > best) { best = r.light; color = r.color; const o = l.inst.objs[0]!; o.updateWorldMatrix(true, false); o.getWorldPosition(wp); bx = wp.x; bz = wp.z; }
      }
      if (light) { light.intensity = 14 * best; light.color.set(color); light.position.set(bx, py, bz); }
    },
  };
}
