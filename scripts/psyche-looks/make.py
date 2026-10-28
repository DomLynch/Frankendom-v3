import sys, io, colorsys
sys.path.insert(0, '/private/tmp/claude-501/pv')
import glbio
import numpy as np
from PIL import Image

SRC = '/private/tmp/claude-501/psyche-var/src/assets/psyche-106.glb'
OUT = '/private/tmp/claude-501/psyche-var/src/assets/looks/'
import os
os.makedirs(OUT, exist_ok=True)


def hsv(a):
    a = a / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0)
    gc = np.where(m, (mx - g) / np.where(m, d, 1), 0)
    bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(mx == r, bc - gc, np.where(mx == g, 2 + rc - bc, 4 + gc - rc))
    h = (h / 6.0) % 1.0
    h = np.where(m, h, 0)
    s = np.where(mx > 0, d / np.where(mx > 0, mx, 1), 0)
    return h, s, mx


def rgb(h, s, v):
    i = np.floor(h * 6).astype(int)
    f = h * 6 - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    i = i % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1) * 255


def smooth(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


def recolor_body(img, jeans_hue, jeans_sat, jeans_val, skin_mul, blouse_hue):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, s, v = hsv(a)
    # jeans: blue hue (0.55..0.7), saturated, left side of atlas only
    jeans = smooth(s, 0.18, 0.35) * (1 - smooth(abs(h - 0.62), 0.07, 0.14))
    xs = np.linspace(0, 1, a.shape[1])[None, :].repeat(a.shape[0], 0)
    jeans *= (xs < 0.56)
    # skin: warm hue, low-mid saturation, right half, y > 0.05
    skin = (1 - smooth(abs(h - 0.04), 0.04, 0.09)) * smooth(s, 0.08, 0.2) * (1 - smooth(s, 0.45, 0.6))
    skin *= (xs > 0.5)
    # pink blouse / frills: hue near 0.95..0.02, saturation > 0.3
    pink = (1 - smooth(np.minimum(abs(h - 0.97), abs(h - 0.97 + 1)), 0.04, 0.1)) * smooth(s, 0.3, 0.45)
    pink *= (xs > 0.5) * (np.arange(a.shape[0])[:, None] < 330)
    h2, s2, v2 = h.copy(), s.copy(), v.copy()
    h2 = h2 * (1 - jeans) + jeans_hue * jeans
    s2 = s2 * (1 - jeans) + np.clip(s2 * jeans_sat, 0, 1) * jeans
    v2 = v2 * (1 - jeans) + np.clip(v2 * jeans_val, 0, 1) * jeans
    ys = np.arange(a.shape[0])[:, None].repeat(a.shape[1], 1)
    tee = ((xs < 0.52) & (ys < 112)).astype(np.float32) * (1 - smooth(s, 0.3, 0.5))
    tee = np.maximum(tee, ((ys < 160) & (s < 0.14) & (v > 0.55)).astype(np.float32))
    ts, tv = TEE[0], TEE[1]
    h2 = h2 * (1 - tee) + blouse_hue * tee
    s2 = s2 * (1 - tee) + ts * tee
    v2 = v2 * (1 - tee) + np.clip(v2 * tv, 0, 1) * tee
    out = rgb(h2, np.clip(s2, 0, 1), v2)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def recolor_hair(img, hue, sat, val):
    rgba = np.asarray(img.convert('RGBA')).astype(np.float32)
    a = rgba[..., :3]
    h, s, v = hsv(a)
    h2 = np.full_like(h, hue)
    s2 = np.clip(np.maximum(s, 0.15) * sat, 0, 1)
    v2 = np.clip(v * val, 0, 1)
    out = rgb(h2, s2, v2)
    res = np.concatenate([out, rgba[..., 3:4]], -1)
    return Image.fromarray(np.clip(res, 0, 255).astype(np.uint8), 'RGBA')


def webp(img, q):
    bio = io.BytesIO()
    img.save(bio, 'WEBP', quality=q, method=6)
    return bio.getvalue()


LOOKS = {
    # name: (jeans hue, jeans sat mult, jeans val mult, skin value mul, blouse hue, hair hue, hair sat, hair val)
    'ember': (0.07, 0.8, 0.55, 0.92, 0.08, 0.04, 1.8, 1.05),
    'frost': (0.33, 0.55, 0.45, 1.0, 0.55, 0.12, 0.35, 1.5),
}
j0, b0 = glbio.read(SRC)
body = Image.open(io.BytesIO(glbio.image_bytes(j0, b0, 2)))
hair = Image.open(io.BytesIO(glbio.image_bytes(j0, b0, 5)))
for name, (jh, js, jv, sk, bh, hh, hs, hv) in LOOKS.items():
    j, b = glbio.read(SRC)
    TEE = {'ember': (0.62, 0.72), 'frost': (0.35, 0.35)}[name]
    nb = recolor_body(body, jh, js, jv, sk, bh)
    nh = recolor_hair(hair, hh, hs, hv)
    nb.save(f'/private/tmp/claude-501/pv/{name}-body.png')
    j, b = glbio.replace_images(j, b, {2: webp(nb, 80), 5: webp(nh, 85)})
    glbio.write(f'{OUT}psyche-106-look-{name}.glb', j, b)
    print(name, os.path.getsize(f'{OUT}psyche-106-look-{name}.glb'))
print('orig', os.path.getsize(SRC))
