"""Mixamo library clip -> warrior.glb (V1's 65-joint hero) the way V1's own chain landed: per bone, the hero's world rotation is the Mixamo
world rotation times a constant measured from V1's shipped pairs (Riposte = 9032041 and Return = 9017002 replay with 0.0 deg median spread),
the pelvis keeps only its height (in place), as exo-hero-clips.mjs does. `backhand` makes the right-handed mirror of a clip (`mirror`, the
whole body, then the sword hand laid back on the mirror image's path); `untwist` keeps a clip's shoulders within a turn of its hips."""
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


def pose(W, local, pel):
    """world rotations and positions of every node for local tracks {node: [F,4]} and the pelvis translation"""
    F = next(iter(local.values())).shape[0]; N_ = len(W.nodes); R = np.zeros((F, N_, 4)); T = np.zeros((F, N_, 3)); S = np.zeros((F, N_, 3))
    for i in range(N_): r, t, s = W.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
    for i, q in local.items(): R[:, i] = q
    T[:, W.byname['pelvis']] = pel
    return W.fk(R, T, S)


def relocal(W, local, pel, world):
    """local tracks with the given bones set to the given world rotations ({node: [F,4]}); every other bone keeps its local track"""
    WR, _, _ = pose(W, local, pel); out = dict(local)
    for i in sorted(local, key=lambda i: depth(W, i)):
        p = W.parent[i]
        if i in world: WR[:, i] = world[i]; out[i] = qnorm(qmul(qinv(WR[:, p]), world[i]))
        else: WR[:, i] = qnorm(qmul(WR[:, p], local[i]))
    return out


def yaw_q(deg):
    """a turn about the model's up axis (+y) by deg [F]"""
    h = np.radians(np.asarray(deg, float)) / 2; return np.stack([np.zeros_like(h), np.sin(h), np.zeros_like(h), np.cos(h)], -1)


def twist(W, WR, WP):
    """the trunk's turn against the hips per key (degrees about +y): the shoulder line (upperarm_l - upperarm_r) against the hip line
    (thigh_l - thigh_r), both laid flat; V1's own clips stay within 62 degrees"""
    b = W.byname; flat = lambda v: np.arctan2(-v[..., 2], v[..., 0])
    d = np.degrees(flat(WP[:, b['upperarm_l']] - WP[:, b['upperarm_r']]) - flat(WP[:, b['thigh_l']] - WP[:, b['thigh_r']]))
    return (d + 180) % 360 - 180


def backhand(W, local, pel, max_twist=60.0, step=2.0):
    """The right-handed mirror of a right-hand cut, as a body can do it: the whole body (pelvis, legs, trunk, neck, head, clavicles) is the
    original mirrored, so the trunk turns with the hips the way the mirror image does (no trunk kept against mirrored hips: that left the
    shoulders up to 153 degrees round from the hips). The sword hand then goes where the mirror image's sword hand is, holding the mirror
    image's grip: the trunk turns about +y (shared over spine_01..03, the neck turning back so the head still looks where the mirror image
    looks) by the least angle that brings the right shoulder within arm's reach of that hand, never more than `max_twist` degrees from the
    hips (V1's clips stay within 62), and a two-bone IK lays upperarm_r and lowerarm_r to it, the elbow bent toward the mirror image's.
    Returns the local tracks and a report: the per-key trunk turn, twist and how far the hand misses the mirror image's (0 when in reach)."""
    M = np.array([-1.0, 1, 1]); _, WP0, _ = pose(W, local, pel)
    full = mirror(W, local, pel, None); WRm, _, _ = pose(W, full, pel)
    # the mirror image's sword hand and elbow (the pole), and its grip (mirror() reflects the arm's own path)
    return hold_hand(W, full, pel, WP0[:, W.byname['hand_r']] * M, WP0[:, W.byname['lowerarm_r']] * M, WRm[:, W.byname['hand_r']], max_twist, step)


def untwist(W, local, pel, max_twist=60.0, step=2.0):
    """A clip whose trunk turns more than `max_twist` degrees from its hips: the trunk turned back within it and the sword hand kept on its
    own path (hold_hand). A clip within it is returned as it is."""
    WR, WP, _ = pose(W, local, pel); b = W.byname
    if np.abs(twist(W, WR, WP)).max() <= max_twist: return local, None
    return hold_hand(W, local, pel, WP[:, b['hand_r']], WP[:, b['lowerarm_r']], WR[:, b['hand_r']], max_twist, step)


def hold_hand(W, full, pel, target, elbow, hand_rot, max_twist=60.0, step=2.0):
    """The body `full` with the trunk turned about +y (shared over spine_01..03, the neck turning back so the head keeps its look) by the
    least angle that brings the right shoulder within arm's reach of `target` while the shoulders stay within `max_twist` degrees of the
    hips, then upperarm_r and lowerarm_r laid to it by a two-bone IK (elbow toward `elbow`) and hand_r holding `hand_rot` (world)."""
    b = W.byname; F = next(iter(full.values())).shape[0]
    WRm, WPm, _ = pose(W, full, pel)
    spines = [b['spine_01'], b['spine_02'], b['spine_03']]; neck, head = b['neck_01'], b['Head']
    sh, lo, ha = b['upperarm_r'], b['lowerarm_r'], b['hand_r']
    up = np.linalg.norm(WPm[0, lo] - WPm[0, sh]); fore = np.linalg.norm(WPm[0, ha] - WPm[0, lo]); reach = up + fore - 0.005

    def turned(theta):
        world = {s: qnorm(qmul(yaw_q(theta * (k + 1) / 3), WRm[:, s])) for k, s in enumerate(spines)}
        world[neck] = qnorm(qmul(yaw_q(theta / 2), WRm[:, neck])); world[head] = WRm[:, head]
        return relocal(W, full, pel, world)
    base = twist(W, WRm, WPm)
    grid = np.arange(-180, 180 + step, step); dist = np.zeros((len(grid), F))
    for g, th in enumerate(grid):
        _, WP, _ = pose(W, turned(np.full(F, th)), pel); dist[g] = np.linalg.norm(target - WP[:, sh], axis=1)
    theta = np.zeros(F)
    for f in range(F):
        ok = np.abs(base[f] + grid) <= max_twist
        fits = ok & (dist[:, f] <= reach)
        cand = np.where(fits)[0] if fits.any() else np.where(ok)[0][[np.argmin(dist[ok, f])]]
        theta[f] = grid[cand[np.argmin(np.abs(grid[cand]))]]
    k = np.exp(-0.5 * (np.arange(-4, 5) / 2.0) ** 2); k /= k.sum()   # smooth the turn over keys (about 0.07 s at 30 fps), then hold the cap
    theta = np.convolve(np.pad(theta, 4, mode='edge'), k, mode='valid')
    theta = np.clip(theta, -max_twist - base, max_twist - base)
    out = turned(theta)
    # two-bone IK: shoulder S, elbow E, hand H to the target, elbow toward the mirror image's elbow
    WR, WP, _ = pose(W, out, pel); S = WP[:, sh]
    d = target - S; dl = np.linalg.norm(d, axis=1); dn = d / dl[:, None]; dl = np.clip(dl, abs(up - fore) + 1e-3, reach)
    pole = elbow - S; pole = pole - np.sum(pole * dn, 1)[:, None] * dn; pole /= np.linalg.norm(pole, axis=1)[:, None]
    ca = np.clip((up ** 2 + dl ** 2 - fore ** 2) / (2 * up * dl), -1, 1); E = S + up * (ca[:, None] * dn + np.sqrt(1 - ca ** 2)[:, None] * pole)
    H = S + dn * dl[:, None]

    def turn_to(q, a, bb):   # q turned by the least rotation taking direction a onto bb
        a = a / np.linalg.norm(a, axis=1)[:, None]; bb = bb / np.linalg.norm(bb, axis=1)[:, None]
        ax = np.cross(a, bb); s = np.linalg.norm(ax, axis=1); c = np.sum(a * bb, 1); ang = np.arctan2(s, c)
        ax = ax / np.where(s < 1e-9, 1, s)[:, None]
        r = np.concatenate([ax * np.sin(ang / 2)[:, None], np.cos(ang / 2)[:, None]], 1); return qnorm(qmul(r, q))
    up_w = turn_to(WR[:, sh], WP[:, lo] - S, E - S)
    out = relocal(W, out, pel, {sh: up_w})
    WR, WP, _ = pose(W, out, pel)
    lo_w = turn_to(WR[:, lo], WP[:, ha] - WP[:, lo], H - WP[:, lo])
    out = relocal(W, out, pel, {lo: lo_w, ha: hand_rot})
    WR, WP, _ = pose(W, out, pel)
    return out, {'trunkTurnDeg': theta, 'twistDeg': twist(W, WR, WP), 'handMiss': np.linalg.norm(WP[:, ha] - target, axis=1)}
