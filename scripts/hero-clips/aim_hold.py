"""data/hero-clips.json `aimFrom` (seconds in the Mixamo clip): from that key on, the wrist keeps the blade on the row's `aim` at EVERY key,
not only at the contact key (build.py aim_blade's constant turn, which this runs after). It is eased in over `RAMP` seconds before
`aimFrom` (smoothstep), so the wind-up keeps the constant turn. For the stab (Dom 2026-10-26: "the straightforward stab"): the drive from the
hip to full extension then points the blade ahead the whole way, instead of swinging it up from the hip into line (an uppercut's arc)."""
import numpy as np
from glbkit import qinv, qmul, qnorm, qrot, slerp

RAMP = 0.133


def aim_hold(W, times, local, pel, frm, aim, ramp=RAMP):
    F = len(times); N = len(W.nodes); R = np.zeros((F, N, 4)); T = np.zeros((F, N, 3)); S = np.zeros((F, N, 3))
    for i in range(N): r, t, s = W.rest(i); R[:, i] = r; T[:, i] = t; S[:, i] = s
    for i, q in local.items(): R[:, i] = q
    T[:, W.byname['pelvis']] = pel
    WR, _, _ = W.fk(R, T, S); h = W.byname['hand_r']
    s = qrot(np.array(W.rest(W.byname['SwordDrawn'])[0]), np.array([0, 1.0, 0]))            # the blade's axis in hand_r's frame
    a = np.array(aim, float) / np.linalg.norm(aim); out = dict(local); hq = local[h].copy(); turns = []
    for f in range(F):
        w = np.clip((times[f] - (frm - ramp)) / ramp, 0, 1); w = w * w * (3 - 2 * w)
        want = qrot(qinv(WR[f, h]), a); axis = np.cross(s, want); n = np.linalg.norm(axis)
        ang = np.arccos(np.clip(np.dot(s, want), -1, 1)); turns.append(float(np.degrees(ang)) * w)
        if w <= 0 or n < 1e-9: continue
        Q = np.r_[axis / n * np.sin(ang / 2), np.cos(ang / 2)]
        hq[f] = qnorm(qmul(local[h][f], slerp(np.array([0, 0, 0, 1.0]), Q, w)))
    out[h] = hq
    return out, max(turns)
