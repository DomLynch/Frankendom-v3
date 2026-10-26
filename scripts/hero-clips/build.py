#!/usr/bin/env python3
"""Bakes Dom's picked strike clips (data/hero-clips.json) into the hero's GLB beside V1's own clips (numpy only; run on the VPS, where the
Mixamo library lives).
  python3 -I scripts/hero-clips/build.py <V1 warrior.glb> <models/mixamo dir> data/hero-clips.json <out warrior.glb> [report.json]
The input must be V1's warrior.glb (it carries the Riposte and Return clips the retarget is calibrated on, retarget.py calibrate). Every row
becomes one more animation named `clip`; V1's 27 clips are kept byte for byte, so ?clips=v1 plays exactly today's clips."""
import json, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbkit import Glb, qinv, qmul, qnorm, qrot
from retarget import LIB, backhand, build, calibrate, pose, sword_path, twist, untwist

# How far the shoulders may turn from the hips (degrees). V1's own clips stay within 62. The first mirror (#19) kept the trunk's own motion
# over mirrored hips and turned the shoulders up to 153 degrees from the hips; the right cut as Mixamo made it turns 94 just after contact.
MAX_TWIST = float(os.environ.get('MAX_TWIST', 60))


def aim_blade(W, times, local, pel, at, aim):
    """A constant wrist offset (the smallest turn of hand_r) that points the blade along `aim` (hero frame: +x his left, +y up, +z forward) at
    time `at`: a knife clip's grip turned into a sword's. Returns the new local tracks and the turn in degrees."""
    F = len(times); N = len(W.nodes); R = np.zeros((F, N, 4)); T = np.zeros((F, N, 3)); S = np.zeros((F, N, 3))
    for i in range(N): r, t, s = W.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
    for i, q in local.items(): R[:, i] = q
    T[:, W.byname['pelvis']] = pel
    WR, _, _ = W.fk(R, T, S); h = W.byname['hand_r']; c = int(np.argmin(np.abs(times - at)))
    s = qrot(np.array(W.rest(W.byname['SwordDrawn'])[0]), np.array([0, 1.0, 0]))            # the blade's axis in hand_r's frame
    want = qrot(qinv(WR[c, h]), np.array(aim, float) / np.linalg.norm(aim))                  # the aim in hand_r's frame at the contact key
    axis = np.cross(s, want); ang = np.arccos(np.clip(np.dot(s, want), -1, 1)); axis = axis / np.linalg.norm(axis)
    Q = np.r_[axis * np.sin(ang / 2), np.cos(ang / 2)]
    out = dict(local); out[h] = qnorm(qmul(local[h], Q))
    return out, float(np.degrees(ang))


def pad4(b): return b + b'\0' * ((4 - len(b) % 4) % 4)


def add_clip(W, name, times, local, pel):
    j = W.j; assert not any(a['name'] == name for a in j['animations']), f'{name} is already in the GLB: build from V1 warrior.glb'
    bin_ = bytes(W.bin); views = j['bufferViews']; accs = j['accessors']

    def acc(arr, typ, minmax=False):
        nonlocal bin_
        data = np.ascontiguousarray(arr, dtype='<f4').tobytes(); bin_ = pad4(bin_)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data)}); bin_ += data
        a = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': int(arr.shape[0]), 'type': typ}
        if minmax: a['min'] = [float(arr.min())]; a['max'] = [float(arr.max())]
        accs.append(a); return len(accs) - 1
    t = acc(times.reshape(-1, 1), 'SCALAR', True); samplers = []; channels = []
    for node in sorted(local):
        samplers.append({'input': t, 'output': acc(local[node], 'VEC4')}); channels.append({'sampler': len(samplers) - 1, 'target': {'node': node, 'path': 'rotation'}})
    samplers.append({'input': t, 'output': acc(pel, 'VEC3')}); channels.append({'sampler': len(samplers) - 1, 'target': {'node': W.byname['pelvis'], 'path': 'translation'}})
    j['animations'].append({'name': name, 'samplers': samplers, 'channels': channels})
    W.bin = bytearray(pad4(bin_)); j['buffers'][0]['byteLength'] = len(W.bin)


def save(W, path):
    js = json.dumps(W.j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(W.bin)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(W.bin)) + b'BIN\0' + bytes(W.bin)
    open(path, 'wb').write(out)


def main():
    src, LIB['dir'], rows_path, out = sys.argv[1:5]
    rows = json.load(open(rows_path)); W = Glb(src); Cs, k = calibrate(W); report = {'pelvisHeightFactor': round(k, 4), 'clips': []}
    for r in rows['clips']:
        times, local, pel = build(W, Cs, k, r['mixamo'], r['from'], r['to'])
        WR, WP, _ = pose(W, local, pel); before = float(np.abs(twist(W, WR, WP)).max())
        if r['mirror']: local, _ = backhand(W, local, pel, MAX_TWIST)   # the right-handed mirror, the whole body mirrored
        else: local, _ = untwist(W, local, pel, MAX_TWIST)              # unchanged when within MAX_TWIST
        WR, WP, _ = pose(W, local, pel); after = float(np.abs(twist(W, WR, WP)).max())
        turn = None
        if r.get('aim'): local, turn = aim_blade(W, times, local, pel, r['contact'] - r['from'], r['aim'])
        add_clip(W, r['clip'], times, local, pel)
        base, tip, hand, _ = sword_path(W, times, local, pel)
        c = int(np.argmin(np.abs(times - (r['contact'] - r['from']))))
        report['clips'].append({'clip': r['clip'], 'role': r['role'], 'keys': len(times), 'duration': round(float(times[-1]), 3),
                                'source': round((r['contact'] - r['from']) / (r['to'] - r['from']), 4), 'wristTurnDeg': None if turn is None else round(turn, 1),
                                'twistDeg': {'source': round(before, 1), 'baked': round(after, 1)},
                                'tipAtContact': [round(float(x), 3) for x in tip[c]], 'tipStart': [round(float(x), 3) for x in tip[0]], 'tipEnd': [round(float(x), 3) for x in tip[-1]]})
    save(W, out)
    report['bytes'] = {'in': os.path.getsize(src), 'out': os.path.getsize(out)}
    text = json.dumps(report, indent=1); print(text)
    if len(sys.argv) > 5: open(sys.argv[5], 'w').write(text)


if __name__ == '__main__':
    main()
