"""Minimal GLB reader / FK / quaternion kit for the hero clip swap (numpy only)."""
import json, struct
import numpy as np

SIZE = {5126: 4, 5122: 2, 5123: 2, 5120: 1, 5121: 1, 5125: 4}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0); bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz], -1)


def qinv(q): return q * np.array([-1, -1, -1, 1.0])
def qnorm(q): return q / np.linalg.norm(q, axis=-1, keepdims=True)


def qrot(q, v):
    r = qmul(qmul(q, np.concatenate([v, np.zeros(v.shape[:-1] + (1,))], -1)), qinv(q)); return r[..., :3]


def qangle(a, b):
    d = np.abs(np.sum(a * b, -1)).clip(0, 1); return np.degrees(2 * np.arccos(d))


def slerp(a, b, t):
    d = np.sum(a * b, -1, keepdims=True); b = np.where(d < 0, -b, b); d = np.abs(d)
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    lin = d > 0.9995
    th = np.arccos(d.clip(-1, 1)); s = np.sin(th); s = np.where(s < 1e-9, 1, s)
    out = np.where(lin, a + (b - a) * t, (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / s)
    return qnorm(out)


class Glb:
    def __init__(self, path):
        b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
        self.j = json.loads(b[20:20 + n]); self.bin = bytearray(b[28 + n:]) if len(b) > 20 + n else bytearray()
        self.path = path
        self.nodes = self.j['nodes']; self.byname = {x.get('name'): i for i, x in enumerate(self.nodes)}
        self.parent = [-1] * len(self.nodes)
        for i, x in enumerate(self.nodes):
            for c in x.get('children', []): self.parent[c] = i

    def acc(self, ai):
        a = self.j['accessors'][ai]; v = self.j['bufferViews'][a['bufferView']]; w = WIDTH[a['type']]; ct = a['componentType']
        base = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', w * SIZE[ct])
        dt = {5126: '<f4', 5122: '<i2', 5123: '<u2', 5120: 'i1', 5121: 'u1', 5125: '<u4'}[ct]
        out = np.zeros((a['count'], w), np.float64)
        raw = np.frombuffer(bytes(self.bin), dtype=np.uint8)
        for i in range(a['count']):
            out[i] = np.frombuffer(raw[base + i * stride: base + i * stride + w * SIZE[ct]].tobytes(), dtype=dt)
        if ct == 5122: out = np.maximum(out / 32767, -1)
        elif ct == 5123: out = out / 65535
        elif ct == 5120: out = np.maximum(out / 127, -1)
        elif ct == 5121: out = out / 255
        return out

    def rest(self, i):
        n = self.nodes[i]
        return np.array(n.get('rotation', [0, 0, 0, 1.0])), np.array(n.get('translation', [0, 0, 0.0])), np.array(n.get('scale', [1, 1, 1.0]))

    def anim(self, name):
        return next(a for a in self.j['animations'] if a['name'] == name)

    def tracks(self, an):
        """{(node, path): (times, values)}"""
        out = {}
        for c in an['channels']:
            s = an['samplers'][c['sampler']]
            out[(c['target']['node'], c['target']['path'])] = (self.acc(s['input'])[:, 0], self.acc(s['output']))
        return out

    def duration(self, an):
        return max(float(self.j['accessors'][s['input']]['max'][0]) for s in an['samplers'])

    def sample_local(self, an, times):
        """local (R [F,N,4], T [F,N,3], S [F,N,3]) for every node at the given times"""
        F, N = len(times), len(self.nodes)
        R = np.zeros((F, N, 4)); T = np.zeros((F, N, 3)); S = np.zeros((F, N, 3))
        for i in range(N):
            r, t, s = self.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
        for (ni, path), (tt, vv) in self.tracks(an).items():
            idx = np.clip(np.searchsorted(tt, times, side='right') - 1, 0, len(tt) - 1); nx = np.clip(idx + 1, 0, len(tt) - 1)
            span = np.where(nx > idx, tt[nx] - tt[idx], 1); f = np.clip((times - tt[idx]) / span, 0, 1)
            if path == 'rotation': R[:, ni] = slerp(qnorm(vv[idx]), qnorm(vv[nx]), f)
            elif path == 'translation': T[:, ni] = vv[idx] + (vv[nx] - vv[idx]) * f[:, None]
            elif path == 'scale': S[:, ni] = vv[idx] + (vv[nx] - vv[idx]) * f[:, None]
        return R, T, S

    def fk(self, R, T, S):
        """world rotation, position, (uniform) scale per node"""
        F, N = R.shape[:2]; WR = np.zeros_like(R); WP = np.zeros_like(T); WS = np.ones((F, N))
        done = [False] * N

        def go(i):
            if done[i]: return
            p = self.parent[i]
            if p < 0: WR[:, i] = R[:, i]; WP[:, i] = T[:, i]; WS[:, i] = S[:, i, 0]
            else:
                go(p); WR[:, i] = qnorm(qmul(WR[:, p], R[:, i])); WP[:, i] = WP[:, p] + qrot(WR[:, p], T[:, i] * WS[:, p, None]); WS[:, i] = WS[:, p] * S[:, i, 0]
            done[i] = True
        for i in range(N): go(i)
        return WR, WP, WS


MX = {'Hips': 'pelvis', 'Spine': 'spine_01', 'Spine1': 'spine_02', 'Spine2': 'spine_03', 'Neck': 'neck_01', 'Head': 'Head'}
for side, s in (('Left', 'l'), ('Right', 'r')):
    MX.update({side + 'Shoulder': 'clavicle_' + s, side + 'Arm': 'upperarm_' + s, side + 'ForeArm': 'lowerarm_' + s, side + 'Hand': 'hand_' + s,
               side + 'UpLeg': 'thigh_' + s, side + 'Leg': 'calf_' + s, side + 'Foot': 'foot_' + s, side + 'ToeBase': 'ball_' + s})
    for f, g in (('Index', 'index'), ('Middle', 'middle'), ('Pinky', 'pinky'), ('Ring', 'ring'), ('Thumb', 'thumb')):
        for k in (1, 2, 3): MX['%sHand%s%d' % (side, f, k)] = '%s_%02d_%s' % (g, k, s)
MX = {'mixamorig:' + k: v for k, v in MX.items()}
