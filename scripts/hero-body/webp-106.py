# Re-encode the PNG textures inside an already meshopt-packed 106-joint body (OpenTrident's src/assets/*-106.glb) as WebP, in place.
# Why: those files carry 512x512 PNGs (~1.7-1.8 MB per body) that gzip cannot shrink, so the 106 bodies cost MORE on the wire than the
# packed 65 bodies (hero 2.08 -> 2.33 MB gz) although they are smaller raw. The 65 bodies' textures are WebP at quality 88
# (scripts/hero-body/prep-mixamo-body.py), image/webp as the image's mimeType: three's GLTFLoader reads it with no new loader.
# Same here: same size (512 px), quality 88, method 6. Only the image bytes move: every meshopt stream and plain view keeps its bytes,
# the views (and EXT_meshopt_compression's ranges) on the GLB's BIN buffer are re-laid in their old order, 4-byte aligned.
# A file already WebP is left alone. scripts/build.mjs does not pack these files (PACKED): they ship as this script leaves them.
#
# Usage (one-off, offline; Pillow is not a project dependency):
#   uv run --with pillow python -I scripts/hero-body/webp-106.py src/assets/psyche-106.glb src/assets/minotaur-106.glb
import io, json, struct, sys
from PIL import Image

QUALITY = 88


def pad(b):
    return b + b'\0' * (-len(b) % 4)


def recode(path):
    raw = open(path, 'rb').read()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2, 'Expected GLB v2'
    n = struct.unpack_from('<I', raw, 12)[0]
    d = json.loads(raw[20:20 + n])
    binlen = struct.unpack_from('<I', raw, 20 + n)[0]
    b = raw[28 + n:28 + n + binlen]
    assert 'uri' not in d['buffers'][0], 'buffer 0 is the BIN chunk'
    if all(im.get('mimeType') == 'image/webp' for im in d['images']):
        print(path, 'already webp'); return
    # Every range of buffer 0: a plain view on it, or a meshopt view's compressed stream on it.
    ranges = []   # (offset, length, owner dict holding byteOffset/byteLength)
    for v in d['bufferViews']:
        ext = v.get('extensions', {}).get('EXT_meshopt_compression')
        if ext and ext['buffer'] == 0: ranges.append((ext.get('byteOffset', 0), ext['byteLength'], ext))
        if v['buffer'] == 0: ranges.append((v.get('byteOffset', 0), v['byteLength'], v))
    new = {}
    for im in d['images']:
        v = d['bufferViews'][im['bufferView']]
        assert v['buffer'] == 0 and 'extensions' not in v
        if im.get('mimeType') == 'image/webp': continue
        o = v.get('byteOffset', 0)
        img = Image.open(io.BytesIO(b[o:o + v['byteLength']]))
        # As prep-mixamo-body.py does it (alpha kept in lossy WebP): the 65 bodies' textures came out of the same call, byte for byte.
        out = io.BytesIO(); img.save(out, 'WEBP', quality=QUALITY, method=6)
        new[id(v)] = out.getvalue()
        print(f"  {im.get('name')}: {img.size} png {v['byteLength']} B -> webp {len(new[id(v)])} B")
        im['mimeType'] = 'image/webp'
    blob = b''
    for off, length, owner in sorted(ranges, key=lambda r: r[0]):
        data = new.get(id(owner), b[off:off + length])
        blob = pad(blob)
        owner['byteOffset'] = len(blob)
        owner['byteLength'] = len(data)
        blob += data
    blob = pad(blob)
    d['buffers'][0]['byteLength'] = len(blob)
    js = json.dumps(d, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(blob)) + b'BIN\0' + blob
    open(path, 'wb').write(glb)
    print(f'{path}: {len(raw)} -> {len(glb)} bytes')


for p in sys.argv[1:]:
    recode(p)
