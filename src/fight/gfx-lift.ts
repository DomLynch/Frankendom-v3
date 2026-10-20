// Graphics lift (Test Zone sandbox, Dom 2026-10-17: "AAA graphics for 2026 on mobile without a loading bottleneck"). A look flag: `?gfx=1` turns on (1) height fog (denser near the ground, thinner up high; the fog
// chunk is patched BEFORE any material compiles, so no shader is built later), (2) half-res bloom on the bright cores only, (3) one grade pass: contrast, saturation, teal shadows, warm highlights, vignette and
// a dither that removes banding. Donors: Veloren postprocess-frag.glsl (grade, dither), World of Claudecraft gfx.ts (a cheap composer tier), 117HD tone/fog formulas. Every number is an fx row (gfx.*). Off = the
// page is exactly as before, and this file is only fetched when the flag is on (main.ts imports it dynamically; the flag itself is gfx-flag.ts). Budget (Strategy + Dom, +-20%): post stack about 2 ms on a 2021 phone,
// zero shader compiles after zone ready. Donor: the Test Zone sandbox, zone/goblin-field-dome @5da7b0388 (copied and adapted, not merged).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { fxNum } from './index.ts';

// The GLSL literals are written from the rows once (a fixed-point string for each), so the shader text carries no tuning of its own.
const fixed = (id: string, digits: number): string => fxNum(id).toFixed(digits);

/** Height fog: the fog chunks gain the world height of each vertex and the density follows it. Call once, before the first render. */
export function patchHeightFog(): void {
  const boost = fixed('gfx.fog.ground-boost', fxNum('gfx.fog.digits')), fall = fixed('gfx.fog.height-falloff', fxNum('gfx.fog.digits-fine')), keep = fixed('gfx.fog.sky-keep', fxNum('gfx.fog.digits'));
  const C = THREE.ShaderChunk as Record<string, string>;
  C.fog_pars_vertex = C.fog_pars_vertex!.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
  C.fog_vertex = C.fog_vertex!.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogY = dot(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]), mvPosition.xyz) + cameraPosition.y;');
  C.fog_pars_fragment = C.fog_pars_fragment!.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
  C.fog_fragment = C.fog_fragment!.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    `float fogH = ${keep} + ${boost} * exp( - max( vFogY, 0.0 ) * ${fall} );\n\t\tfloat fogD = fogDensity * fogH;\n\t\tfloat fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );`);
}

const gradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, contrast: { value: 1 }, saturation: { value: 1 }, teal: { value: 0 }, warm: { value: 0 }, vignette: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast, saturation, teal, warm, vignette; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += vec3(-teal * 0.6, teal * 0.3, teal) * (1.0 - smoothstep(0.0, 0.5, l)) + vec3(warm, warm * 0.55, -warm * 0.5) * smoothstep(0.5, 1.0, l);
      vec2 d = vUv - 0.5; c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.0);
      c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** The composer for the walk's frame. `render()` replaces renderer.render(scene, camera); `setSize` follows the page's resize. */
export function createGfxLift(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: fxNum('gfx.msaa-samples') });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), fxNum('gfx.bloom.strength'), fxNum('gfx.bloom.radius'), fxNum('gfx.bloom.threshold')));
  composer.addPass(new OutputPass());   // the renderer's tone mapping and sRGB, once, here
  const grade = new ShaderPass(gradeShader);
  const u = grade.uniforms as typeof gradeShader.uniforms;
  u.contrast.value = fxNum('gfx.grade.contrast'); u.saturation.value = fxNum('gfx.grade.saturation'); u.teal.value = fxNum('gfx.grade.shadow-teal'); u.warm.value = fxNum('gfx.grade.highlight-warm'); u.vignette.value = fxNum('gfx.grade.vignette');
  composer.addPass(grade);
  // A program is keyed on the render target it was compiled for (output colour space and tone mapping differ for the composer's HalfFloat target), so every warm-up compile (the plan's per-material compiles, the creature kinds, the gear stage) must run against the composer's target or its programs link again at the first frame that draws through the lift (seamless-quiet: the creature weapon's Leather / WeatheredStone linked after [zone ready]). Only the synchronous part of the call needs the target; the driver's later link wait does not.
  for (const name of ['compile', 'compileAsync'] as const) {
    const original = renderer[name].bind(renderer) as (...args: unknown[]) => unknown;
    (renderer as unknown as Record<string, unknown>)[name] = (...args: unknown[]): unknown => { const before = renderer.getRenderTarget(); renderer.setRenderTarget(composer.readBuffer); try { return original(...args); } finally { renderer.setRenderTarget(before); } };
  }
  return {
    render: (): void => composer.render(),
    /** Compile the scene's programs for the composer's render target (the Pit's loading card: a program is keyed on its target, so a compile for the screen leaves these to link at the first frame). */
    compile(): void { const before = renderer.getRenderTarget(); renderer.setRenderTarget(composer.readBuffer); try { renderer.compile(scene, camera); } finally { renderer.setRenderTarget(before); } },
    setSize(w: number, h: number): void { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
  };
}
