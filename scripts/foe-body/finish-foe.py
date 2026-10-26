#!/usr/bin/env python3
"""Last step of scripts/foe-body/build-minotaur.sh: hero-exo.mjs's output (the Centurion's veteran.glb skeleton, clips and weapon sockets with a
Mixamo body on them) made into a body the opponent loader takes.
  python3 -I scripts/foe-body/finish-foe.py <hero-exo out.glb> <out.glb>
1. The Centurion's empty slot markers go (the childless, meshless nodes `Steel`, `Leather`, `Bronze` ... carrying only `extras.slot`: his
   creature pipeline's names for draws fused into CreatureBody). One of them is named `Steel`, and characters.ts missingMap reads the FIRST
   `Steel` it meets, so it would refuse the rig; nothing else reads them (only the scutum is worn on the new body). They are unlinked, so the
   loader never builds them.
2. The body node (`Steel`, hero-exo's rename) is split into one node per primitive (a Mixamo body is one mesh with one primitive per texture
   tile; three.js would make it a Group, which missingMap and wear() do not take). The largest primitive stays `Steel`, tagged
   `extras.slot = "Body"` (characters.ts wear() hangs the kit on the Body draw, as on the Centurion's CreatureBody); the others are named
   `<Steel>_<n>`. Same skin, same accessors: nothing in the binary changes.
3. Materials matte (metallic 0, roughness MATTE, Mixamo's glossiness-as-metalRoughness map unbound; the packer drops the unused image)."""
import json, struct, sys

MATTE = 0.6


def read(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), b[28 + n:]


def main():
    src, out = sys.argv[1:3]
    j, bin_ = read(src)
    joints = {i for s in j.get('skins', []) for i in s['joints']}
    marker = lambda i, n: i not in joints and 'mesh' not in n and not n.get('children') and set((n.get('extras') or {}).keys()) == {'slot'}
    gone = {i for i, n in enumerate(j['nodes']) if marker(i, n)}
    for n in j['nodes']:
        if 'children' in n:
            n['children'] = [c for c in n['children'] if c not in gone]
            if not n['children']: del n['children']
    for s in j['scenes']: s['nodes'] = [c for c in s['nodes'] if c not in gone]
    print('unlinked slot markers:', ', '.join(j['nodes'][i]['name'] for i in sorted(gone)))
    body = [i for i, n in enumerate(j['nodes']) if n.get('name') == 'Steel' and 'mesh' in n]
    assert len(body) == 1, f'expected one Steel body node, found {len(body)}'
    bi = body[0]; node = j['nodes'][bi]; mesh = j['meshes'][node['mesh']]
    prims = mesh['primitives']
    count = lambda p: j['accessors'][p['attributes']['POSITION']]['count']
    order = sorted(range(len(prims)), key=lambda k: -count(prims[k]))
    node['extras'] = {**(node.get('extras') or {}), 'slot': 'Body'}
    mesh['primitives'] = [prims[order[0]]]
    scene = j['scenes'][j.get('scene', 0)]['nodes']
    for n, k in enumerate(order[1:], 1):
        j['meshes'].append({'name': f"{mesh.get('name', 'Steel')}_{n}", 'primitives': [prims[k]]})
        j['nodes'].append({'name': f'Steel_{n}', 'mesh': len(j['meshes']) - 1, 'skin': node['skin']})
        scene.append(len(j['nodes']) - 1)
    print(f"body split: Steel {count(prims[order[0]])} vertices (slot Body)" + ''.join(f", Steel_{n} {count(prims[k])}" for n, k in enumerate(order[1:], 1)))
    # 3. Matte, as #27 made Psyche (that step is not in prep-mixamo-body.py on main since #29): Mixamo binds its Glossiness map as the
    # metallicRoughness texture with metallic 0.5, which draws a hide as polished metal under the arena sky. Metallic 0, that map dropped,
    # roughness MATTE (hide and horn); base, normal and specular maps kept.
    for k in [order[0], *order[1:]]:
        m = j['materials'][prims[k]['material']]; pbr = m.setdefault('pbrMetallicRoughness', {})
        pbr.pop('metallicRoughnessTexture', None); pbr['metallicFactor'] = 0; pbr['roughnessFactor'] = MATTE
        print(f"{m.get('name')}: metallic 0, roughness {MATTE}")
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    open(out, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<I', len(js)) + b'JSON' + js
                          + struct.pack('<I', len(bin_)) + b'BIN\0' + bin_)


if __name__ == '__main__':
    main()
