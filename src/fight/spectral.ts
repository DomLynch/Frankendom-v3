import { BufferGeometry, Color, Float32BufferAttribute, Object3D, MeshStandardMaterial, Points, ShaderMaterial, SkinnedMesh, Vector3 } from 'three';

// Cut pieces have baked/rotated coordinates: keep the spectral surface without the live rig's height mask or wisps.
export function spectralMaterial(source: MeshStandardMaterial, phase = { value: 0 }, intact = false) {
  const material = source.clone();
  material.transparent = true; material.depthWrite = false; material.opacity = .86;
  material.metalness = .06; material.roughness = 1;
  material.customProgramCacheKey = () => intact ? 'wraith-dissolve-v1' : 'wraith-cut-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.spectralTime = phase;
    if (intact) {
      shader.vertexShader = 'uniform float spectralTime; varying float spectralHeight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      spectralHeight = position.y;
      float wisp = 1.0 - smoothstep(0.1, 1.05, position.y);
      transformed.x += sin(position.y * 13.0 + spectralTime * 1.3) * 0.025 * wisp;
      transformed.z += cos(position.y * 11.0 - spectralTime) * 0.018 * wisp;`);
    }
    shader.fragmentShader = (intact ? 'varying float spectralHeight;\n' : '') + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float ash = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(ash * 0.88, ash * 0.97, ash), 0.9);
      ${intact ? 'diffuseColor.a *= smoothstep(0.08, 0.95, spectralHeight);' : ''}`);
  };
  return material;
}

// Presentation only: the Wraith's intact core dissolves into a small, bounded ash cloud.
export function spectralAppearance(root: Object3D) {
  const body = root.getObjectByName('CreatureBody');
  if (!(body instanceof SkinnedMesh) || body.userData.creature !== 'wraith' || !(body.material instanceof MeshStandardMaterial)) return;
  // Owner size pass: scale the complete rig and its held weapon together, about the floor.
  root.scale.multiplyScalar(1.5);
  const phase = { value: 0 }, life = { value: 1 };
  const material = body.material = spectralMaterial(body.material, phase, true);
  body.castShadow = false;
  const positions: number[] = [], seeds: number[] = [];
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.39996, radius = .10 + (i % 4) * .027;
    positions.push(Math.cos(angle) * radius, (i % 7) * .085, Math.sin(angle) * radius); seeds.push(i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 1));
  const smoke = new Points(geometry, new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { phase, life, tint: { value: new Color('#a3aeb0') } },
    vertexShader: `attribute float seed; uniform float phase; varying float fade;
      void main() {
        float age = fract(seed * 0.618034 + phase * 0.14);
        vec3 p = position; p.y += age * 0.65;
        p.x += sin(phase + seed) * 0.06; p.z += cos(phase * 0.8 + seed) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv; gl_PointSize = clamp(155.0 / max(0.1, -mv.z), 1.0, 75.0);
        fade = sin(age * 3.14159);
      }`,
    fragmentShader: `uniform vec3 tint; uniform float life; varying float fade;
      void main() {
        float edge = max(0.0, 1.0 - length(gl_PointCoord - 0.5) * 2.0);
        gl_FragColor = vec4(tint, edge * edge * fade * life * 0.09);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  smoke.frustumCulled = false; root.add(smoke);
  const pelvis = root.getObjectByName('pelvis'), position = new Vector3();
  let openedTime = 0;
  return (dt: number, dead: boolean, progress: number, opened = false, hold = 3.6) => {   // hold: seconds the ghost stays whole after the death starts (a longer scene holds it longer)
    openedTime = dead && opened ? openedTime + dt : 0;
    phase.value += dt;
    // The body must separate and land before the ghost disappears. Zero-dt freezes this clock.
    life.value = dead ? opened ? Math.max(0, 1 - Math.max(0, openedTime - hold) / 1.4) : Math.max(0, 1 - progress * 1.3) : 1;
    material.opacity = .86 * life.value;
    if (pelvis) { root.updateWorldMatrix(true, true); root.worldToLocal(pelvis.getWorldPosition(position)); smoke.position.copy(position); smoke.position.y -= .85; }
    return life.value;
  };
}
