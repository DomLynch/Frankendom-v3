#!/usr/bin/env python3
"""Readies a Mixamo library body (OpenTrident models/mixamo/phone/<id>.glb, 52 `mixamorig:*` joints) for scripts/hero-body/hero-exo.mjs.
  python3 -I scripts/hero-body/prep-mixamo-body.py <mixamo body.glb> <V1 warrior.glb> <out.glb> [max texture side = 1024] [webp quality = 88]
1. Scale: the hero's clips key the pelvis by absolute height (V1's Exo hero, hips 0.964 m over the floor), so a body whose hips stand higher or
   lower would hover or sink in every clip. The whole body is scaled once, uniformly, so its Hips stand exactly where the hero's pelvis does:
   proportions stay the body's own (hero-exo.mjs then moves each hero joint onto the body's joints).
2. Textures: PNGs re-encoded as WebP no bigger than the max side (the hero row of V1's phone budgets: 1024 px, no PNG), as the Exo hero's are.
3. Materials, matte like V1's Exo hero (every Exo material: metallic 0, roughness 0.55): Mixamo's export binds the body's *Glossiness* map as
   glTF's metallicRoughness texture (blue 255 = metal, green = gloss read as roughness, so the jeans sit at roughness ~0.2) with metallic 0.5,
   and the hair at metallic 0.5 / roughness 0.12. Under the arena's sky environment (scene.ts rebuildEnvironment, intensity 1.0) that drew
   vinyl jeans and metal hair (PR #25 review). Each mesh node gets its own copy of its material (same base, normal and specular textures, so no
   new image and the same draw count) with metallic 0, no metallicRoughness texture, and a roughness by what the node is (ROUGHNESS below).
Only the JSON and the image bytes change; the mesh, skin and joints are the body's own."""
import io, json, struct, sys
import numpy as np
from PIL import Image


def read(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), bytearray(b[28 + n:])


def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    m = np.eye(4); m[:3, :3] = q2m(n.get('rotation', [0, 0, 0, 1])) @ np.diag(n.get('scale', [1, 1, 1])); m[:3, 3] = n.get('translation', [0, 0, 0]); return m


def world(j, name):
    parent = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}
    i = next(k for k, n in enumerate(j['nodes']) if n.get('name') == name); m = np.eye(4)
    while i is not None: m = local(j['nodes'][i]) @ m; i = parent.get(i)
    return m


def pad4(b): return b + b'\0' * ((4 - len(b) % 4) % 4)


# Roughness by the mesh node's name (Mixamo names them <id>_Body, _Hair, _Eyelashes, _Pants, _Shirt, _Sneakers, ...); first match wins, the
# rest (skin, and the eyes and teeth that share the body's atlas) is SKIN. Metallic is 0 on all of them.
ROUGHNESS = [(('pants', 'jeans', 'shirt', 'top', 'jacket', 'dress', 'skirt', 'shorts', 'cloth', 'hoodie', 'sweater'), 0.9),
             (('hair', 'eyelash', 'brow', 'beard'), 0.65), (('sneaker', 'shoe', 'boot'), 0.6)]
SKIN = 0.55


def roughness_for(name):
    low = name.lower()
    return next((r for keys, r in ROUGHNESS if any(k in low for k in keys)), SKIN)


def matte(j):
    """Step 3: one matte material per mesh node (see the module docstring)."""
    for n in j['nodes']:
        if 'mesh' not in n: continue
        rough, mesh = roughness_for(n.get('name', '')), j['meshes'][n['mesh']]
        part = n.get('name', '').split('_')[-1].lower() or 'part'
        for p in mesh['primitives']:
            if p.get('material') is None: continue
            m = json.loads(json.dumps(j['materials'][p['material']]))
            pbr = m.setdefault('pbrMetallicRoughness', {}); pbr.pop('metallicRoughnessTexture', None)
            pbr['metallicFactor'] = 0; pbr['roughnessFactor'] = rough
            m['name'] = f"{m.get('name', 'mat').split('_')[0]}_{part}"
            j['materials'].append(m); p['material'] = len(j['materials']) - 1
            print(f"{n.get('name')}: {m['name']} metallic 0, roughness {rough}")
    # drop the source materials no primitive uses now, and renumber
    used = sorted({p['material'] for me in j['meshes'] for p in me['primitives'] if p.get('material') is not None})
    remap = {old: new for new, old in enumerate(used)}
    j['materials'] = [j['materials'][i] for i in used]
    for me in j['meshes']:
        for p in me['primitives']:
            if p.get('material') is not None: p['material'] = remap[p['material']]


def main():
    body_path, hero_path, out = sys.argv[1:4]
    side = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
    quality = int(sys.argv[5]) if len(sys.argv) > 5 else 88
    j, bin_ = read(body_path); hero, _ = read(hero_path)
    want, have = world(hero, 'pelvis')[1, 3], world(j, 'mixamorig:Hips')[1, 3]
    s = float(want / have)
    roots = j['scenes'][j.get('scene', 0)]['nodes']
    for r in roots:
        n = j['nodes'][r]; assert 'matrix' not in n, 'a root node with a matrix is not handled'
        n['scale'] = [x * s for x in n.get('scale', [1, 1, 1])]
        if 'translation' in n: n['translation'] = [x * s for x in n['translation']]
    print(f'scale {s:.4f}: hips {have:.4f} m -> {want:.4f} m (the hero pelvis)')
    out_bin = pad4(bytes(bin_))
    for im in j.get('images', []):
        v = j['bufferViews'][im['bufferView']]; o = v.get('byteOffset', 0)
        img = Image.open(io.BytesIO(bytes(bin_[o:o + v['byteLength']]))); w0 = img.size
        if max(img.size) > side: img = img.resize((side * img.size[0] // max(img.size), side * img.size[1] // max(img.size)), Image.LANCZOS)
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=quality, method=6); data = buf.getvalue()
        j['bufferViews'].append({'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)}); out_bin = pad4(out_bin + data)
        print(f"{im.get('name')}: {w0} {v['byteLength']} B -> {img.size} {len(data)} B webp")
        im['bufferView'] = len(j['bufferViews']) - 1; im['mimeType'] = 'image/webp'
    matte(j)
    j['buffers'][0]['byteLength'] = len(out_bin)
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    open(out, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(out_bin)) + struct.pack('<I', len(js)) + b'JSON' + js
                          + struct.pack('<I', len(out_bin)) + b'BIN\0' + out_bin)


if __name__ == '__main__':
    main()
