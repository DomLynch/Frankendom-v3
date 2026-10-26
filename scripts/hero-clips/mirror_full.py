"""A whole-body mirror (data/hero-clips.json `mirror: "full"`): every joint takes its left/right twin's motion reflected across the hero's
mid plane (x = 0, his left-right axis), the way a mirror shows it. A left-handed clip becomes a right-handed one: the striking arm is then
the right arm, which carries SwordDrawn (hand_r's child), and the left arm plays the clip's free arm reflected. The hero's rest is symmetric
(each _l joint's rest is its _r twin's reflected), so a joint's world turn away from its own rest, reflected, lands on its twin's rest.
Used for Dom's stab (Mixamo 100770901, 2026-10-26: "it's a left-hand stab, so the weapon is in the right hand"). The cuts' right-handed
mirror (arms keep their side) is retarget.py mirror."""
import numpy as np
from glbkit import qinv, qmul, qnorm
from retarget import depth, reflect_q, rest_world


def twin(name):
    return name[:-2] + ('_r' if name.endswith('_l') else '_l') if name.endswith(('_l', '_r')) else name


def mirror_full(W, local, pel):
    joints = list(local.keys()); F = next(iter(local.values())).shape[0]; N = len(W.nodes)
    R = np.zeros((F, N, 4)); T = np.zeros((F, N, 3)); S = np.zeros((F, N, 3))
    for i in range(N): r, t, s = W.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
    for i, q in local.items(): R[:, i] = q
    T[:, W.byname['pelvis']] = pel
    WR, _, _ = W.fk(R, T, S); RW, _, _ = rest_world(W); new = {}
    for i in joints:
        t_ = W.byname[twin(W.nodes[i]['name'])]
        new[i] = qnorm(qmul(reflect_q(qnorm(qmul(WR[:, t_], qinv(RW[0, t_])))), RW[0, i]))
    WR2 = WR.copy(); out = {}
    for i in sorted(joints, key=lambda i: depth(W, i)):
        WR2[:, i] = new[i]; p = W.parent[i]; out[i] = qnorm(qmul(qinv(WR2[:, p]), new[i]))
    return out
