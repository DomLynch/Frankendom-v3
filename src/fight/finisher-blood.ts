import { AddEquation, Color, CustomBlending, DstColorFactor, DynamicDrawUsage, OneMinusSrcAlphaFactor, SRGBColorSpace, TextureLoader, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, SphereGeometry, Texture, Vector3 } from 'three';
import type { FinisherId } from './finishers.ts';
import { HAMSTRUNG_BEATS } from '../hamstrung.ts';
import { EXECUTION_BEATS, executionAt } from '../execution.ts';

// Blood on the floor multiplies onto the sand: dst × lerp(1, texture, alpha·opacity). Premultiplied output makes alpha and opacity
// fade it toward "no change" — never toward white, which a plain MultiplyBlending ignores opacity for.
export function multiplyOnto(material: MeshBasicMaterial, map: Texture) {
  Object.assign(material, { map, blending: CustomBlending, blendEquation: AddEquation, blendSrc: DstColorFactor,
    blendDst: OneMinusSrcAlphaFactor, premultipliedAlpha: true, transparent: true, depthWrite: false, toneMapped: false });
  material.needsUpdate = true;
}
// The floor stain shapes (scripts/blood/floor-textures.py): two pools, four splashes, handed out in turn so no two neighbours match.
export const FLOOR_POOLS = ['floor-pool.png', 'floor-pool-b.png'], FLOOR_SPLASHES = ['floor-splash.png', 'floor-splash-b.png', 'floor-splash-c.png', 'floor-splash-d.png'];

export type BloodSource = { site: string; position: Vector3; direction: Vector3; strength: number; delay?: number; seed?: number };   // delay: seconds after the finish begins before the wound opens (a later blow of a paired scene); seed: drops thrown on the frame it opens, so the blow reads at 375

// Which of a weapon's materials a kill bloodies. A sword bloodies its Blade only. A hafted weapon bloodies everything but its
// handle: every shipped two-hander ships the haft, grip wrap and binding as their own materials (Haft/Ash/Leather/Cord/Wire), so
// "tint the whole weapon" painted the scythe's haft red after a kill (owner, 2026-09-19).
// A reconstructed part (weapons lane Phase 2, scripts/weapon-fit.py) ships two materials: Weapon<Id> — the head, the striking part —
// and Weapon<Id>Shaft, its baked handle; the sword rule admits the head, the handle rule the shaft.
export const HANDLE_MATERIAL = /haft|handle|grip|wrap|leather|cord|wire|shaft$|^ash$/i;
const RECONSTRUCTED_HEAD = /^Weapon[A-Z]\w*$/;
export function bloodiesMaterial(name: string, twoHanded: boolean): boolean {
  return twoHanded ? !HANDLE_MATERIAL.test(name) : name === 'Blade' || (RECONSTRUCTED_HEAD.test(name) && !HANDLE_MATERIAL.test(name));
}
type Mode = 'red' | 'dark' | 'off';

// Read after posing, separation and final actor headings. Every position is world space.
export function finisherBloodSources(kind: FinisherId, victim: Object3D, head: Object3D | null, location = 'torso'): BloodSource[] {
  victim.updateWorldMatrix(true, true);
  const at = (name: string) => victim.getObjectByName(name)?.getWorldPosition(new Vector3());
  const neck = at('neck_01'), crown = at('Head'), chest = at('spine_02');
  if (!neck || !crown || !chest) return [];
  const up = crown.clone().sub(neck).normalize(), size = Math.max(.5, Math.min(1.6, crown.distanceTo(neck)/.075));
  const forward = new Vector3(0,0,1).transformDirection(victim.matrixWorld);
  forward.addScaledVector(up,-forward.dot(up)).normalize();
  const source = (site: string, position: Vector3, direction: Vector3, strength = 1): BloodSource => ({site,position,direction:direction.normalize(),strength:strength*size});
  if (kind === 'opened') {
    const opened = victim.getObjectByName('Opened');
    if (!opened?.visible) return [];
    return ['OpenedLegs','OpenedTorso'].flatMap((name,i) => {
      const half = opened.getObjectByName(name);
      if (!half?.visible) return [];
      const cut = half.getObjectByName('WaistCut') as Mesh | undefined;
      if (!cut) return [];
      if (!cut.geometry.boundingBox) cut.geometry.computeBoundingBox();
      return [source(i ? 'waist-torso' : 'waist-legs', cut.localToWorld(cut.geometry.boundingBox!.getCenter(new Vector3())), new Vector3(0,i ? -1 : 1,0).transformDirection(cut.matrixWorld),1.4)];
    });
  }
  if (kind === 'hamstrung') {
    // The knee is cut at the first blow, the back entered at the second (the second waits out the first blow's hit-stop).
    const knee = at('calf_r');
    return [
      ...(knee ? [{...source('knee-cut',knee,forward.clone().negate(),1.1),delay:HAMSTRUNG_BEATS.knee*HAMSTRUNG_BEATS.duration,seed:8}] : []),
      {...source('back-entry',chest.clone().addScaledVector(forward,-.13*size),forward.clone().negate().addScaledVector(up,.6),1.4),delay:HAMSTRUNG_BEATS.back*HAMSTRUNG_BEATS.duration+HAMSTRUNG_BEATS.hold,seed:8},
    ];
  }
  if (kind === 'execution') {
    // One wound, at the cut: the nape. He kneels turned away, so the back of his neck faces the killer (`forward`, the actor's heading, points at him).
    // The jet rises and leans toward the killer; the neck bone then rides him down onto his face, so the seep pools under the head. The head stays whole.
    const nape = neck.clone().addScaledVector(forward,.025*size);
    return [{...source('nape-cut',nape,forward.clone().addScaledVector(up,.9),1.2),delay:executionAt(EXECUTION_BEATS.strike),seed:8}];
  }
  if (kind === 'decapitation') {
    const sites = [source('neck-stump',neck.clone().addScaledVector(up,.035*size),up.clone().addScaledVector(forward,.35),1.35)];
    const cut = head?.getObjectByName('BloodHeadCut');
    if (cut) sites.push(source('detached-head',cut.getWorldPosition(new Vector3()),new Vector3(0,-1,0).transformDirection(cut.matrixWorld),.8));
    return sites;
  }
  if (kind === 'splitCrown') return [source('skull-seam',crown.clone().addScaledVector(up,.045*size),up.clone().addScaledVector(forward,.4),1.15)];
  if (kind === 'runThrough') return [
    source('chest-entry',chest.clone().addScaledVector(forward,.14*size),forward.clone(),1),
    source('back-exit',chest.clone().addScaledVector(forward,-.13*size),forward.clone().negate(),.85),
  ];
  return [source('blade-wound',location === 'head' ? crown : location === 'legs' ? at('thigh_r') ?? chest : chest,forward,.9)];
}

// Fixed resources: 160 ballistic droplets and 80 growing floor stains in seven draws — the droplets, and one per floor shape
// (owner 2026-09-23 on the live finishers: the spray landed as flat bright-red blots, all one shape). A wound's seep takes a
// pool shape, a landed droplet a splash shape, each in turn; once the textures land they multiply onto the sand like the
// splashes (multiplyOnto). The borrowed canvas splat with the old tint stands in until then, and forever under node.
// No allocation per emission.
export function createFinisherBlood(map: Texture) {
  const group = new Group(); group.name = 'FinisherBlood'; group.visible = false;
  const dropMaterial = new MeshStandardMaterial({color:'#740f19',roughness:.46,metalness:0});
  const plane = new PlaneGeometry(2,2), SHAPES = FLOOR_POOLS.length + FLOOR_SPLASHES.length;
  const poolMaterials = Array.from({length:SHAPES},()=>new MeshBasicMaterial({map,color:'#68121a',transparent:true,opacity:.86,depthWrite:false,toneMapped:false}));
  const drops = new InstancedMesh(new SphereGeometry(1,8,4),dropMaterial,160);
  const pools = poolMaterials.map((m,i)=>Object.assign(new InstancedMesh(plane,m,80),{name:`FinisherPools${i}`}));
  drops.name = 'FinisherDroplets';
  for (const mesh of [drops,...pools]) { mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled=false; }
  group.add(drops,...pools);
  let photo = false, tint = '#68121a';
  if (typeof document !== 'undefined')
    Promise.all([...FLOOR_POOLS,...FLOOR_SPLASHES].map(f=>new TextureLoader().loadAsync(new URL(`../assets/blood/${f}`, import.meta.url).href))).then(all=>{
      all.forEach((t,i)=>{t.colorSpace=SRGBColorSpace;multiplyOnto(poolMaterials[i],t);poolMaterials[i].opacity=1;});photo=true;
    }).catch(()=>{});   // no textures: the canvas splat stays
  const particles = Array.from({length:160},()=>({position:new Vector3(),velocity:new Vector3(),life:0,size:0}));
  const stains = Array.from({length:80},()=>({position:new Vector3(),radius:0,target:0,angle:0,site:'',shape:0}));
  const velocityDirection = new Vector3(), turn = new Quaternion(), zAxis = new Vector3(0,0,1);
  const dummy = new Object3D(), yAxis = new Vector3(0,1,0), flat = new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2), tone = new Color();
  let active: FinisherId | null = null, elapsed = 0, cursor = 0, stainCursor = 0, serial = 0;
  let pending: number[] = [], seeded: boolean[] = [], emitted = 0, landed = 0, lateSeeded = false;
  function reset() {
    for (const p of particles) p.life=0;
    for (const s of stains) { s.radius=0; s.target=0; }
    drops.count=0;for(const m of pools)m.count=0; pending=[]; seeded=[]; cursor=stainCursor=serial=emitted=landed=0; elapsed=0; active=null; lateSeeded=false; group.visible=false;
  }
  function stain(position: Vector3, amount: number, site: string) {
    // Merge nearby landings without pulling a previous pool along with a moving wound.
    let s=stains.find(p=>p.target>0 && (p.position.x-position.x)**2+(p.position.z-position.z)**2<.2*.2);
    if (!s) { s=stains[stainCursor++%stains.length]; s.position.set(position.x,.025,position.z);s.radius=.035;s.target=.055;s.angle=serial*2.4;s.site=site;s.shape=site==='spray' ? FLOOR_POOLS.length+stainCursor%FLOOR_SPLASHES.length : stainCursor%FLOOR_POOLS.length; }
    s.target=Math.min(.85,Math.sqrt(s.target*s.target+amount));
  }
  reset();
  return {
    group,
    update(dt: number, kind: FinisherId | null, progress: number, sources: readonly BloodSource[], mode: Mode) {
      if (!kind) { if(active)reset(); return; }
      if(active!==kind) {reset();active=kind;}
      group.visible=mode!=='off';
      dropMaterial.color.set(mode==='dark' ? '#342127' : '#740f19'); tint=mode==='dark' ? '#2b2226' : '#68121a';
      for(const m of poolMaterials)m.color.set(photo ? (mode==='dark' ? '#a8a0a0' : '#ffffff') : tint);   // multiplied: white = the texture's own crimson
      // Hold state at zero dt; off hides and clears airborne drops but never freezes the bleed clock.
      if(dt<=0)return;
      dt=Math.min(dt,.1);elapsed+=dt;
      if(mode==='off') {for(const p of particles)p.life=0;drops.count=0;return;}
      if(elapsed>=7 && !lateSeeded && stainCursor===0) { for(const s of sources)stain(s.position,.3,s.site);lateSeeded=sources.length>0; }
      const start=kind==='decapitation' ? .05 : kind==='opened' || kind==='splitCrown' ? .045 : .01;
      if(progress>=start && elapsed<7) sources.forEach((s,i)=>{
        if(elapsed<(s.delay??0))return;
        if(!seeded[i]) { seeded[i]=true; pending[i]=(pending[i]??0)+(s.seed??0); }   // the drops of the blow itself, thrown the frame the wound opens
        const age=elapsed-(s.delay??0), burst=age<1.7, rate=(burst ? 78 : age<3.5 ? 32 : 14)*s.strength;
        pending[i]=(pending[i]??0)+rate*dt;
        while(pending[i]>=1) {
          pending[i]--; const p=particles[cursor++%particles.length], a=++serial*2.399963;
          const pressure=burst ? (1.5+.8*Math.sin(elapsed*17)**2) : .25;
          p.position.copy(s.position);p.velocity.copy(s.direction).multiplyScalar(pressure*Math.min(1.2,s.strength));
          p.velocity.x+=Math.sin(a)*.45;p.velocity.z+=Math.cos(a)*.45;p.velocity.y+=burst ? .35+.35*Math.sin(a*1.7) : -.3;
          p.life=2;p.size=(serial%11===0 ? .022 : .004+(serial%4)*.002)*Math.sqrt(s.strength);emitted++;
        }
        // Once the wound is near the floor, seep directly underneath it as well as landing droplets.
        if(s.position.y<.65)stain(s.position,dt*.08*s.strength,s.site);
      });
      let count=0;
      for(const p of particles) {
        if(p.life<=0)continue;
        p.life-=dt;p.velocity.y-=9.8*dt;p.position.addScaledVector(p.velocity,dt);
        if(p.position.y<=.03) {stain(p.position,.006,'spray');p.life=0;landed++;continue;}
        dummy.position.copy(p.position);dummy.quaternion.setFromUnitVectors(yAxis,velocityDirection.copy(p.velocity).normalize());
        dummy.scale.set(p.size,p.size*(1.4+Math.min(1.2,p.velocity.length()*.2)),p.size);dummy.updateMatrix();drops.setMatrixAt(count++,dummy.matrix);
      }
      drops.count=count;drops.instanceMatrix.needsUpdate=true;
      for(const m of pools)m.count=0;
      let layer=0;
      for(const s of stains) {
        if(!s.target)continue;
        s.radius+=(s.target-s.radius)*(1-Math.exp(-dt*2.2));
        const mesh=pools[s.shape];
        dummy.position.copy(s.position);dummy.position.y+=layer++*.00004;
        dummy.quaternion.copy(flat).multiply(turn.setFromAxisAngle(zAxis,s.angle));
        dummy.scale.set(s.radius,s.radius*(.7+.2*Math.sin(s.angle)**2),1);dummy.updateMatrix();mesh.setMatrixAt(mesh.count,dummy.matrix);
        tone.setScalar(.75+.25*Math.min(1,s.radius/.2));mesh.setColorAt(mesh.count++,tone);
      }
      for(const m of pools){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
    },
    inspect() { return {kind:active,elapsed,emitted,landed,color:tint.slice(1),airborne:drops.count,visible:group.visible,pools:stains.filter(s=>s.target>0).map(s=>({position:s.position.toArray(),radius:s.radius,site:s.site})),capacity:{drops:particles.length,pools:stains.length}}; },
    reset,
    dispose() {reset();group.removeFromParent();drops.geometry.dispose();plane.dispose();dropMaterial.dispose();for(const m of poolMaterials){if(m.map!==map)m.map?.dispose();m.dispose();}},
  };
}
