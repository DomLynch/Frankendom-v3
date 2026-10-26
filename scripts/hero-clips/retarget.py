"""Mixamo library clip -> warrior.glb (V1's 65-joint hero) the way V1's own chain landed: per bone, the hero's world rotation is the Mixamo
world rotation times a constant measured from V1's shipped pairs (Riposte = 9032041 and Return = 9017002 replay with 0.0 deg median spread),
the pelvis keeps only its height (in place), as exo-hero-clips.mjs does. `mirror` makes the right-handed mirror of a clip."""
import sys, re, numpy as np
from glbkit import *

LIB = {'dir': None, 'index': None}   # the Mixamo library: models/mixamo (holds clips/index.json); set by build.py


def lib_file(mixamo_id):
    import json, os
    if LIB['index'] is None: LIB['index'] = json.load(open(os.path.join(LIB['dir'], 'clips', 'index.json')))['clips']
    c = next(x for x in LIB['index'] if x['id'].startswith(mixamo_id + '-'))
    return os.path.join(LIB['dir'], c['file']), c


STD_PAIRS = [('Riposte', '9032041'), ('Return', '9017002')]   # V1's warrior.glb clips and the Mixamo clips they were made from
STD = '9032041'   # a standard-rest library clip (the rest every 9xxx/1xxxxx clip shares)


def calibrate(W):
    acc = {}; hips = []
    for clip, cid in STD_PAIRS:
        A = Glb(lib_file(cid)[0]); an = A.j['animations'][0]; bn = W.anim(clip)
        times = W.tracks(bn)[(W.byname['pelvis'], 'rotation')][0]
        RB, TB, SB = W.sample_local(bn, times); WRB, _, _ = W.fk(RB, TB, SB)
        RA, TA, SA = A.sample_local(an, times); WRA, WPA, _ = A.fk(RA, TA, SA)
        for a, ue in MX.items():
            C = qnorm(qmul(qinv(WRA[:, A.byname[a]]), WRB[:, W.byname[ue]]))
            C = C * np.sign(np.sum(C * C[0], -1, keepdims=True)); acc.setdefault(ue, []).append(C)
        hips.append((WPA[:, A.byname['mixamorig:Hips'], 1], TB[:, W.byname['pelvis'], 2]))
    Cs = {}
    for ue, lst in acc.items():
        allc = np.concatenate([c * np.sign(np.sum(c * lst[0][0], -1, keepdims=True)) for c in lst]); Cs[ue] = qnorm(allc.mean(0))
    hy = np.concatenate([h for h, _ in hips]); pz = np.concatenate([p for _, p in hips]); k = float(np.dot(hy, pz) / np.dot(hy, hy))
    return Cs, k


def rest_world(G):
    N = len(G.nodes); R = np.zeros((1, N, 4)); T = np.zeros((1, N, 3)); S = np.zeros((1, N, 3))
    for i in range(N): r, t, s = G.rest(i); R[0, i] = r; T[0, i] = t; S[0, i] = s
    return G.fk(R, T, S)


def reflect_q(q): return q * np.array([1, -1, -1, 1.0])   # a rotation seen in a mirror across the x = 0 plane (x: the hero's left-right axis)


def source_world(A, times):
    """Mixamo world rotations per bone name and the hips' world height."""
    an = A.j['animations'][0]; R, T, S = A.sample_local(an, times); WR, WP, _ = A.fk(R, T, S)
    return {a: WR[:, A.byname[a]] for a in MX}, WP[:, A.byname['mixamorig:Hips'], 1], WP


def to_std(A, world):
    """a library clip on a different rest (the Gladio and Glory set): world-delta onto the standard Mixamo rest"""
    Sd = Glb(lib_file(STD)[0]); RWs, _, _ = rest_world(Sd); RWa, _, _ = rest_world(A)
    return {a: qnorm(qmul(qmul(q, qinv(RWa[0, A.byname[a]])), RWs[0, Sd.byname[a]])) for a, q in world.items()}


def hips_rest_y(G):
    _, WP, _ = rest_world(G); return float(WP[0, G.byname['mixamorig:Hips'], 1])


def build(W, Cs, k, mixamo_id, start, end, fps=30.0):
    """the library clip `mixamo_id` from `start` to `end` s on the hero: times (from 0), {node index: local quats [F,4]}, pelvis local translations [F,3]"""
    A = Glb(lib_file(mixamo_id)[0]); dur = A.duration(A.j['animations'][0]); end = min(end if end is not None else dur, dur)
    n = int(round((end - start) * fps)); times = start + np.arange(n + 1) / fps; times[-1] = end
    world, hy, _ = source_world(A, times)
    Sd = Glb(lib_file(STD)[0])
    if abs(hips_rest_y(A) - hips_rest_y(Sd)) > 1e-3: world = to_std(A, world); hy = hy * hips_rest_y(Sd) / hips_rest_y(A)
    joints = [W.j['skins'][0]['joints'][i] for i in range(len(W.j['skins'][0]['joints']))]
    ref = W.anim('Riposte'); R0, T0, S0 = W.sample_local(ref, np.array([0.0]))
    F = len(times); RB = np.repeat(R0, F, 0); TB = np.repeat(T0, F, 0); SB = np.repeat(S0, F, 0)
    WRB, _, _ = W.fk(RB, TB, SB)   # parents above the skeleton and the unmapped joints at the reference pose
    inv = {v: k_ for k_, v in MX.items()}
    out = {}
    order = sorted(joints, key=lambda i: depth(W, i))
    for i in order:
        nm = W.nodes[i]['name']; p = W.parent[i]
        if nm in inv: wq = qnorm(qmul(world[inv[nm]], Cs[nm]))
        else: wq = qnorm(qmul(WRB[:, p], RB[:, i]))
        WRB[:, i] = wq; out[i] = qnorm(qmul(qinv(WRB[:, p]), wq))
    pel = np.zeros((F, 3)); pel[:, 2] = k * hy
    return times - start, out, pel


def depth(G, i):
    d = 0
    while G.parent[i] >= 0: i = G.parent[i]; d += 1
    return d


def sword_path(W, times, local, pel, base=0.18, tip=0.86):
    """SwordDrawn's contact segment in the warrior's model frame at each key (base xyz, tip xyz), and hand_r"""
    F = len(times); R = np.zeros((F, len(W.nodes), 4)); T = np.zeros((F, len(W.nodes), 3)); S = np.zeros((F, len(W.nodes), 3))
    for i in range(len(W.nodes)): r, t, s = W.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
    for i, q in local.items(): R[:, i] = q
    T[:, W.byname['pelvis']] = pel
    WR, WP, WS = W.fk(R, T, S); sd = W.byname['SwordDrawn']
    seg = [WP[:, sd] + qrot(WR[:, sd], np.array([0, y, 0.0]) * WS[:, sd, None]) for y in (base, tip)]
    return seg[0], seg[1], WP[:, W.byname['hand_r']], WP[:, W.byname['pelvis']]


def clip_local(W, name):
    an = W.anim(name); times = W.tracks(an)[(W.byname['pelvis'], 'rotation')][0]
    R, T, S = W.sample_local(an, times)
    joints = W.j['skins'][0]['joints']
    return times, {i: R[:, i] for i in joints}, T[:, W.byname['pelvis']]


def q2m(q):
    x, y, z, w = np.moveaxis(q, -1, 0)
    return np.stack([np.stack([1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], -1), np.stack([2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], -1), np.stack([2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)], -1)], -2)


def m2q(m):
    out = np.zeros(m.shape[:-2] + (4,))
    for idx in np.ndindex(m.shape[:-2]):
        a = m[idx]; t = np.trace(a)
        if t > 0: s = np.sqrt(t + 1) * 2; q = [(a[2, 1]-a[1, 2])/s, (a[0, 2]-a[2, 0])/s, (a[1, 0]-a[0, 1])/s, s/4]
        elif a[0, 0] > a[1, 1] and a[0, 0] > a[2, 2]: s = np.sqrt(1+a[0, 0]-a[1, 1]-a[2, 2])*2; q = [s/4, (a[0, 1]+a[1, 0])/s, (a[0, 2]+a[2, 0])/s, (a[2, 1]-a[1, 2])/s]
        elif a[1, 1] > a[2, 2]: s = np.sqrt(1+a[1, 1]-a[0, 0]-a[2, 2])*2; q = [(a[0, 1]+a[1, 0])/s, s/4, (a[1, 2]+a[2, 1])/s, (a[0, 2]-a[2, 0])/s]
        else: s = np.sqrt(1+a[2, 2]-a[0, 0]-a[1, 1])*2; q = [(a[0, 2]+a[2, 0])/s, (a[1, 2]+a[2, 1])/s, s/4, (a[1, 0]-a[0, 1])/s]
        out[idx] = q
    return qnorm(out)


ARM = re.compile(r'^(upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)_')


def mirror(W, local, pel, keep=None):
    """A right-handed mirror: the body (pelvis, spine, head, legs, clavicles) takes its twin's motion reflected across the mid plane, as a
    mirror does; each ARM keeps its own side and draws its own path reflected (world rotation M.W.N, N = the bone's local X flipped: the
    elbow and finger hinge axis on this rig, and perpendicular to the sword, which runs along hand_r's local Z), so the sword stays in the
    right hand and the blade's path is the mirror image of the original's."""
    joints = list(local.keys()); F = next(iter(local.values())).shape[0]
    N_ = len(W.nodes); R = np.zeros((F, N_, 4)); T = np.zeros((F, N_, 3)); S = np.zeros((F, N_, 3))
    for i in range(N_): r, t, s = W.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
    for i, q in local.items(): R[:, i] = q
    T[:, W.byname['pelvis']] = pel
    WR, _, _ = W.fk(R, T, S); RW, _, _ = rest_world(W)
    twin = lambda n: n[:-2] + ('_r' if n.endswith('_l') else '_l') if n.endswith(('_l', '_r')) else n
    M = np.diag([-1.0, 1, 1]); Nl = np.diag([-1.0, 1, 1]); new = {}
    for i in joints:
        nm = W.nodes[i]['name']
        if keep is not None and keep.match(nm): new[i] = WR[:, i]
        elif ARM.match(nm): new[i] = m2q(M @ q2m(WR[:, i]) @ Nl)
        else:
            t_ = W.byname[twin(nm)]; D = qnorm(qmul(WR[:, t_], qinv(RW[0, t_])))
            new[i] = qnorm(qmul(reflect_q(D), RW[0, i]))
    WR2 = WR.copy(); out = {}
    for i in sorted(joints, key=lambda i: depth(W, i)):
        WR2[:, i] = new[i]; p = W.parent[i]; out[i] = qnorm(qmul(qinv(WR2[:, p]), new[i]))
    return out
