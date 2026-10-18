// Portions adapted from levy-street/world-of-claudecraft (f46f30f), src/render/ability_vfx/solid_impact_fragments.ts, Copyright (c) 2026 Levy Street, MIT (public/licenses/world-of-claudecraft.txt).
// Changed: the kit / prewarm / production-asset plumbing is gone; the two faceted shard shapes (a stone chip and a metal splinter) are built here in code, so no asset is taken; the sun comes from this scene's own
// DirectionalLight; gravity, bounce and every spawn number are the `specialShards` rows (sandbox-rules.ts), not literals; the pool is two instanced draws, built at scene creation and compiled by the warm-up.
// Presentation only: lit 3D chips thrown off a landed special (a melee special's contact, a ground slam), flying, tumbling, bouncing once and shrinking out entirely on the GPU. Deterministic: every "random" is an index hash.
import * as THREE from 'three';
import type { ShardRow } from './sandbox-rules.ts';

export type ShardKind = 'stone' | 'metal';
const KINDS: readonly ShardKind[] = ['stone', 'metal'];

type Batch = { mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>; ends: Float64Array };

// A faceted chip: a squashed icosahedron (stone) or a long thin wedge (metal), flat-shaded.
const shape = (kind: ShardKind): THREE.BufferGeometry => {
  const g = (kind === 'stone' ? new THREE.IcosahedronGeometry(1, 0) : new THREE.ConeGeometry(0.5, 2.4, 4, 1)).toNonIndexed();
  g.computeVertexNormals();
  return g;
};

/** `perKind`: the pool of each shape, from the rows themselves (shardCapacity(): every row's count, so every row can be mid-flight at once). A burst takes what is free, never more than its row's count. */
export function createSpecialShards(scene: THREE.Scene, perKind: number) {
  const batches = new Map<ShardKind, Batch>(), sun = new THREE.Vector3(0.4, 0.8, 0.3).normalize(), colour = new THREE.Color();
  let time = 0, serial = 0;
  for (const kind of KINDS) {
    const source = shape(kind), geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', source.getAttribute('position')); geometry.setAttribute('normal', source.getAttribute('normal'));
    for (const name of ['aOrigin', 'aVelocity', 'aTint']) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(perKind * 3), 3).setUsage(THREE.DynamicDrawUsage));
    for (const name of ['aLife', 'aShape', 'aWorld']) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(perKind * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = perKind;
    const material = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sun }, uTime: { value: 0 }, uMetal: { value: kind === 'metal' ? 1 : 0 } },
      vertexShader: `attribute vec3 aOrigin,aVelocity,aTint;attribute vec4 aLife,aShape,aWorld;uniform float uTime;uniform vec3 uSun;varying vec3 vNormal,vView,vTint,vLight;varying float vFade;
        void main(){float age=uTime-aLife.x;float life=aLife.y;float p=clamp(age/max(life,0.001),0.,1.);float live=step(0.,age)*(1.-step(life,age))*step(0.001,life);float t=age;
          float gravity=aWorld.x;float bounce=aWorld.y;float floorY=aShape.w;float fall=aOrigin.y-floorY;float hit=(aVelocity.y+sqrt(max(0.,aVelocity.y*aVelocity.y+2.*gravity*fall)))/gravity;
          float after=max(0.,t-hit);float bounceV=bounce*max(0.,gravity*hit-aVelocity.y);
          vec3 travel=aVelocity*t;travel.y-=0.5*gravity*t*t;
          if(t>hit){travel.xz=aVelocity.xz*(hit+after*aWorld.z);travel.y=floorY-aOrigin.y+max(0.,bounceV*after-0.5*gravity*after*after);}
          float spin=(3.+mod(abs(aLife.w)*1.73,8.))*sign(sin(aLife.w));
          float angle=abs(aLife.w)+t*spin;float c=cos(angle),s=sin(angle);mat3 rot=mat3(c,0.,s,s*0.6,0.8,-c*0.6,-s*0.8,0.6,c*0.8);
          float shrink=1.-smoothstep(aWorld.w,1.,p);vec3 local=rot*(position*aShape.xyz)*aLife.z*shrink*live;
          vec4 view=modelViewMatrix*vec4(aOrigin+travel+local,1.);vNormal=normalize(normalMatrix*rot*(normal/max(aShape.xyz,vec3(0.001))));vView=-view.xyz;vTint=aTint;vLight=mat3(viewMatrix)*uSun;vFade=live;gl_Position=projectionMatrix*view;
          if(live<0.5)gl_Position=vec4(2.,2.,2.,1.);
        }`,
      fragmentShader: `uniform float uMetal;varying vec3 vNormal,vView,vTint,vLight;varying float vFade;void main(){if(vFade<0.5)discard;vec3 n=normalize(vNormal);vec3 light=normalize(vLight);float diffuse=0.24+0.76*max(0.,dot(n,light));float spec=pow(max(0.,dot(reflect(-light,n),normalize(vView))),38.);vec3 colour=vTint*diffuse+vec3(0.9,0.9,0.85)*spec*(0.1+uMetal*0.5);gl_FragColor=vec4(colour,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthWrite: true, depthTest: true, side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `specialShards:${kind}`; mesh.visible = false; mesh.frustumCulled = false; mesh.userData.warmHidden = true;   // warmOwn compiles it shown: the program links at zone warm-up, never at the first hit
    scene.add(mesh);
    batches.set(kind, { mesh, ends: new Float64Array(perKind) });
  }
  scene.traverse((o) => { if (o instanceof THREE.DirectionalLight) { sun.copy(o.position).sub(o.target.position).normalize(); } });

  return {
    /** Throw a row's chips from (x, y, z), away along (dx, dz). Returns how many were spawned. `floor`: the sand height under the burst. */
    burst(row: ShardRow, x: number, y: number, z: number, dx: number, dz: number, floor = 0): number {
      const batch = batches.get(row.kind === 'metal' ? 'metal' : 'stone');
      if (!batch || ![x, y, z, dx, dz].every(Number.isFinite)) return 0;
      const g = batch.mesh.geometry, origin = g.getAttribute('aOrigin') as THREE.InstancedBufferAttribute, velocity = g.getAttribute('aVelocity') as THREE.InstancedBufferAttribute, life = g.getAttribute('aLife') as THREE.InstancedBufferAttribute,
        shapeAttr = g.getAttribute('aShape') as THREE.InstancedBufferAttribute, tints = g.getAttribute('aTint') as THREE.InstancedBufferAttribute, world = g.getAttribute('aWorld') as THREE.InstancedBufferAttribute;
      const length = Math.hypot(dx, dz); dx = length > 0.01 ? dx / length : 0; dz = length > 0.01 ? dz / length : 0;
      colour.set(row.tint);
      const amount = Math.min(row.count, perKind), force = row.power / 1000, seed = ++serial; let n = 0;
      for (let i = 0; i < perKind && n < amount; i++) {
        if (batch.ends[i]! > time) continue;
        const phase = (seed * 1.618 + n) * 2.399963, radial = 1.2 + ((n * 7 + seed) % 9) * 0.17;   // the golden angle spreads the chips round the burst
        const vx = (Math.cos(phase) * radial + dx * row.forward / 1000) * force, vz = (Math.sin(phase) * radial + dz * row.forward / 1000) * force, vy = (row.lift / 1000 + (n % 4) * 0.65) * force;
        const duration = row.life / 1000 + (n % 3) * 0.28, size = (row.size / 1000) * (0.7 + (n % 5) * 0.17) * force;
        origin.setXYZ(i, x, Math.max(y, floor + 0.08), z); velocity.setXYZ(i, vx, vy, vz);
        life.setXYZW(i, time, duration, size, phase);
        shapeAttr.setXYZW(i, 0.65 + (n % 3) * 0.15, row.kind === 'metal' ? 1 : 0.9, 0.7, floor + 0.025);
        world.setXYZW(i, row.gravity / 1000, row.bounce / 1000, row.slide / 1000, row.shrink / 1000);
        tints.setXYZ(i, colour.r, colour.g, colour.b);
        batch.ends[i] = time + duration; n++;
      }
      if (n) { for (const a of [origin, velocity, life, shapeAttr, tints, world]) a.needsUpdate = true; batch.mesh.visible = true; }
      return n;
    },
    update(dt: number): void {
      time += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      for (const b of batches.values()) { b.mesh.material.uniforms.uTime!.value = time; b.mesh.visible = b.ends.some((end) => end > time); }
    },
    alive(): number { let k = 0; for (const b of batches.values()) for (const end of b.ends) if (end > time) k++; return k; },
    dispose(): void { for (const b of batches.values()) { b.mesh.removeFromParent(); b.mesh.geometry.dispose(); b.mesh.material.dispose(); } batches.clear(); },
  };
}
