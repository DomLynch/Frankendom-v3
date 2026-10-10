import {Float32BufferAttribute,Group,Matrix4,Mesh,Object3D,Quaternion,SkinnedMesh,Vector3} from 'three';

// Cache the actual held weapon at its release pose. Geometry belongs to this prop; materials remain borrowed.
export function prepareWeaponDrop(root:Object3D,anchor:Group) {
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
 const held=root.getObjectByName('WeaponDrawn')??root.getObjectByName('SwordDrawn');
 const inverse=anchor.matrixWorld.clone().invert(),pivot=held?held.getWorldPosition(new Vector3()).applyMatrix4(inverse):new Vector3();
 const group=new Group();group.name='DroppedWeapon';group.position.copy(pivot);group.visible=false;
 const points:number[]=[];
 held?.traverse(object=>{
  if(!(object instanceof Mesh))return;
  for(let p:Object3D|null=object;p && p!==held;p=p.parent)if(!p.visible)return;
  const transform=inverse.clone().multiply(object.matrixWorld),geometry=object.geometry.clone();
  if(object instanceof SkinnedMesh){
   object.skeleton.update();const position=geometry.getAttribute('position'),values:number[]=[];
   for(let i=0;i<position.count;i++)values.push(...object.getVertexPosition(i,new Vector3()).applyMatrix4(transform).toArray());
   geometry.setAttribute('position',new Float32BufferAttribute(values,3));geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.deleteAttribute('tangent');geometry.computeVertexNormals();
  } else geometry.applyMatrix4(transform);
  geometry.translate(-pivot.x,-pivot.y,-pivot.z);geometry.boundingBox=null;geometry.boundingSphere=null;
  const position=geometry.getAttribute('position');for(let i=0;i<position.count;i++)points.push(position.getX(i),position.getY(i),position.getZ(i));
  const mesh=new Mesh(geometry,object.material);mesh.name=object.name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);
 });
 const axis=held?new Vector3(0,1,0).transformDirection(inverse.clone().multiply(held.matrixWorld)):new Vector3(0,1,0),flat=new Vector3(0,0,1),aligned=new Quaternion().setFromUnitVectors(axis,flat),rest=aligned.clone();
 let thickness=Infinity;
 for(let i=0;i<64;i++){
  const q=new Quaternion().setFromAxisAngle(flat,i*Math.PI/32).multiply(aligned),m=new Matrix4().makeRotationFromQuaternion(q).elements;let low=Infinity,high=-Infinity;
  for(let j=0;j<points.length;j+=3){const y=m[1]*points[j]+m[5]*points[j+1]+m[9]*points[j+2];low=Math.min(low,y);high=Math.max(high,y);}
  if(high-low<thickness){thickness=high-low;rest.copy(q);}
 }
 const floors:number[]=[];
 for(let i=0;i<=120;i++){
  const t=i/120,q=new Quaternion().slerp(rest,t*t*(3-2*t)),m=new Matrix4().makeRotationFromQuaternion(q).elements;let low=Infinity;
  for(let j=0;j<points.length;j+=3)low=Math.min(low,m[1]*points[j]+m[5]*points[j+1]+m[9]*points[j+2]);
  floors.push(points.length?.006-low:0);
 }
 points.length=0;let active=false,previous=held?.visible??false;
 return {
  group,
  apply(elapsed:number){
   const shown=elapsed>=0 && group.children.length>0;
   if(held){if(shown && !active)previous=held.visible;if(shown)held.visible=false;else if(active)held.visible=previous;}
   active=shown;group.visible=shown;if(!shown)return;
   const t=Math.min(1,elapsed/.72),ease=t*t*(3-2*t),at=t*120,i=Math.min(119,Math.floor(at)),floor=floors[i]+(floors[i+1]-floors[i])*(at-i);
   group.quaternion.identity().slerp(rest,ease);group.position.copy(pivot);group.position.x+=.18*ease;group.position.z-=.1*ease;
   group.position.y=Math.max(floor,pivot.y+.35*elapsed-6*elapsed*elapsed);
  },
  dispose(){if(held && active)held.visible=previous;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});}
 };
}
