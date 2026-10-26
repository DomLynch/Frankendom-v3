# Re-encode the painted base-colour PNG inside a weapon shape GLB (public/weapons/shapes/) as WebP (EXT_texture_webp), in place.
# First-visit weight (docs/V3-OWED-2026-10-26.md section 2): each shape held one 1024x1024 PNG of ~0.9 MB that gzip cannot shrink.
# Only that image's bytes change: geometry, accessors, the metal-roughness PNG, the sampler and every other byte of the JSON stay as
# they were (bufferViews after the image move up). three's GLTFLoader reads EXT_texture_webp itself: no new loader, no runtime dep.
# The image stays 1024x1024; quality 90 (PSNR ~44 dB against the PNG). A file already WebP is left alone.
#
# Usage (one-off, offline; Pillow is not a project dependency):
#   uv run --with pillow python scripts/shape-textures.py public/weapons/shapes/longsword-plain.glb [...more.glb]
import io, json, struct, sys
from PIL import Image

QUALITY = 90


def pad(b, fill):
    return b + fill * (-len(b) % 4)


def recode(path):
    raw = open(path, 'rb').read()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2, 'Expected GLB v2'
    n = struct.unpack_from('<I', raw, 12)[0]
    d = json.loads(raw[20:20 + n])
    b = raw[28 + n:28 + n + struct.unpack_from('<I', raw, 20 + n)[0]]
    assert len(d['buffers']) == 1 and 'uri' not in d['buffers'][0], 'one embedded buffer'
    base = d['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
    tex = d['textures'][base]
    if 'source' not in tex:
        print(path, 'already recoded'); return
    img = d['images'][tex['source']]
    assert img['mimeType'] == 'image/png'
    assert sum(1 for t in d['textures'] if t.get('source') == tex['source']) == 1, 'base colour image is shared'
    view = img['bufferView']
    assert not any(a.get('bufferView') == view for a in d.get('accessors', [])), 'image view used by an accessor'
    v = d['bufferViews'][view]
    o = v.get('byteOffset', 0)
    im = Image.open(io.BytesIO(b[o:o + v['byteLength']]))
    assert im.mode == 'RGB', f'{im.mode}: alpha would need lossless WebP'
    out = io.BytesIO(); im.save(out, 'WEBP', quality=QUALITY, method=6)
    webp = out.getvalue()
    # Rebuild the buffer: views in offset order, each 4-byte aligned, the image view's bytes swapped.
    blob = b''
    for i in sorted(range(len(d['bufferViews'])), key=lambda i: d['bufferViews'][i].get('byteOffset', 0)):
        bv = d['bufferViews'][i]
        start = bv.get('byteOffset', 0)
        data = webp if i == view else b[start:start + bv['byteLength']]
        blob = pad(blob, b'\0')
        bv['byteOffset'] = len(blob)
        bv['byteLength'] = len(data)
        blob += data
    blob = pad(blob, b'\0')
    d['buffers'][0]['byteLength'] = len(blob)
    img['mimeType'] = 'image/webp'
    del tex['source']
    tex['extensions'] = {**tex.get('extensions', {}), 'EXT_texture_webp': {'source': d['images'].index(img)}}
    for key in ('extensionsUsed', 'extensionsRequired'):
        d[key] = sorted(set(d.get(key, [])) | {'EXT_texture_webp'})
    js = pad(json.dumps(d, separators=(',', ':')).encode(), b' ')
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(blob)) + b'BIN\0' + blob
    open(path, 'wb').write(glb)
    print(f'{path}: {len(raw)} -> {len(glb)} bytes, base colour webp {len(webp)}')


for p in sys.argv[1:]:
    recode(p)
