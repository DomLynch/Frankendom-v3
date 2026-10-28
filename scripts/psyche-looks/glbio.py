import struct, json


def read(p):
    d = open(p, 'rb').read()
    l = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + l])
    off = 20 + l
    bl = struct.unpack('<I', d[off:off + 4])[0]
    b = d[off + 8:off + 8 + bl]
    return j, b


def write(p, j, b):
    # pad binary
    while len(b) % 4:
        b += b'\0'
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(b)
    out = struct.pack('<4sII', b'glTF', 2, total)
    out += struct.pack('<I4s', len(js), b'JSON') + js
    out += struct.pack('<I4s', len(b), b'BIN\0') + b
    open(p, 'wb').write(out)


def image_bytes(j, b, i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return b[o:o + bv['byteLength']]


def replace_images(j, b, repl):
    """repl: {image index: new bytes}. Rebuild buffer, appending replaced views."""
    b = bytearray(b)
    for i, nb in repl.items():
        while len(b) % 4:
            b.append(0)
        bvi = j['images'][i]['bufferView']
        j['bufferViews'][bvi]['byteOffset'] = len(b)
        j['bufferViews'][bvi]['byteLength'] = len(nb)
        b += nb
    j['buffers'][0]['byteLength'] = len(b)
    return j, bytes(b)
